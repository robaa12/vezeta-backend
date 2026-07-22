# Data Model: Appointments & Booking

**Feature**: 006-appointments-booking
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role, 004-doctor-search,
005-doctor-categories.

## Overview

This feature introduces two new domain tables — `DoctorSlot` (a
bookable time window) and `Appointment` (a patient's claim on a
slot) — and adds back-relations to the existing `User` and
`Doctor` models. The migration is **purely additive**; no
existing table is modified.

The booking loop is built around an **atomic conditional update**
on `DoctorSlot.status`: booking attempts flip the slot from
`AVAILABLE` to `BOOKED` inside a `prisma.$transaction` whose
`WHERE status = 'AVAILABLE'` clause is the database-level
concurrency guard (Constitution Principle IV — Transactional Data
Integrity).

## Entities

### DoctorSlot (new)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| doctorId | String (cuid) | NOT NULL, FK → `Doctor.id`, `onDelete: Restrict` | The doctor this slot belongs to |
| startsAt | DateTime | NOT NULL | Slot start (UTC) |
| endsAt | DateTime | NOT NULL | Slot end (UTC), strictly > `startsAt` |
| status | String | default: `"AVAILABLE"` | Enum: `"AVAILABLE"` \| `"BOOKED"` \| `"BLOCKED"` |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Constraints:**
- `@@index([doctorId, startsAt])` — supports the public slot
  listing (filter by doctor, sort by start time).
- `@@index([status])` — supports status-filtered queries.
- The back-relation `appointment Appointment?` is the 1:1 edge
  from `DoctorSlot` to `Appointment` (one slot can result in at
  most one appointment).

**State transitions:**
- `null` → `AVAILABLE` (on creation).
- `AVAILABLE` → `BOOKED` (on patient booking, atomic with
  appointment creation in a transaction).
- `AVAILABLE` → `BLOCKED` (on admin block, or via
  `PATCH /api/admin/slots/:id` with `status: 'BLOCKED'`).
- `BLOCKED` → `AVAILABLE` (on admin un-block, or via
  `PATCH /api/admin/slots/:id` with `status: 'AVAILABLE'`).
- `BOOKED` → `AVAILABLE` (on appointment cancellation, atomic
  with appointment update in a transaction).

`BOOKED` slots cannot be deleted, blocked, or otherwise mutated
except via the cancellation flow. `BLOCKED` slots are universally
unavailable — they are not "unavailable to a specific user".

**Slot lifetime:**
- A slot's lifecycle ends when (a) it is deleted (admin action,
  only allowed when `status = 'AVAILABLE'`), or (b) the slot's
  `startsAt` passes (the slot is in the past).
- Past-time slots are NOT auto-deleted. The admin is responsible
  for cleanup. The public listing may include past-time slots
  (the booking endpoint rejects them with 400).

### Appointment (new)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| userId | String (cuid) | NOT NULL, FK → `User.id`, `onDelete: Restrict` | The patient who booked |
| doctorId | String (cuid) | NOT NULL, FK → `Doctor.id`, `onDelete: Restrict` | Denormalized from the slot for query speed |
| slotId | String (cuid) | NOT NULL, UNIQUE, FK → `DoctorSlot.id`, `onDelete: Restrict` | The slot this appointment claims |
| scheduledAt | DateTime | NOT NULL | Denormalized from `DoctorSlot.startsAt` for query speed |
| status | String | default: `"PENDING"` | Enum: `"PENDING"` \| `"CONFIRMED"` \| `"COMPLETED"` \| `"CANCELLED"` |
| patientNotes | String? | nullable, max 2000 chars | Patient-supplied context (e.g. reason for visit) |
| adminNotes | String? | nullable, max 2000 chars | Admin-supplied context (e.g. cancellation reason) |
| cancelledAt | DateTime? | nullable | When the appointment was cancelled (null if not cancelled) |
| cancelledBy | String? | nullable | Enum: `"USER"` \| `"ADMIN"` |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Constraints:**
- `@@unique([slotId])` — enforces 1:1 between a slot and an
  appointment at the database level. Combined with the
  application-level conditional update, this is the
  anti-double-booking guarantee.
- `@@index([userId, scheduledAt])` — supports the patient list
  endpoint.
- `@@index([doctorId, scheduledAt])` — supports the future
  "doctor schedule" admin view.
- `@@index([status])` — supports status-filtered queries.

**State transitions:**
- `null` → `PENDING` (on patient booking).
- `PENDING` → `CONFIRMED` (admin confirms).
- `PENDING` → `CANCELLED` (patient or admin cancels).
- `CONFIRMED` → `COMPLETED` (admin completes, requires
  `scheduledAt` to be in the past).
- `CONFIRMED` → `CANCELLED` (patient or admin cancels; patient
  has 24h cutoff, admin has no cutoff).

Terminal states: `COMPLETED` and `CANCELLED` are immutable. A
CANCELLED appointment cannot be revived; a COMPLETED appointment
cannot be cancelled. State-transition violations return 409.

**`cancelledAt` / `cancelledBy` semantics:**
- `null` initially.
- Set on the `→ CANCELLED` transition, atomically with the
  appointment update and slot release.
- `cancelledBy = 'USER'` for patient self-cancel; `cancelledBy =
  'ADMIN'` for admin cancel.
- Never set if the appointment is not CANCELLED.

### Back-relations on existing models

The `User` model gains `appointments Appointment[]` (no other
changes).

The `Doctor` model gains `slots DoctorSlot[]` and `appointments
Appointment[]` (no other changes).

The `Category` and Better Auth tables are **untouched**.

## Concurrency: The Booking Transaction

Booking is the most contended operation in this feature. Two
patients may submit a booking for the same slot at the same
moment. The application MUST guarantee that exactly one wins.

**Pattern (per research.md R3):**

```ts
await prisma.$transaction(async (tx) => {
  // 1. Conditional update: only succeeds if slot is AVAILABLE
  const updated = await tx.doctorSlot.updateMany({
    where: { id: slotId, status: 'AVAILABLE' },
    data: { status: 'BOOKED' },
  });
  if (updated.count === 0) {
    throw new ConflictException({ message: 'Slot is no longer available' });
  }

  // 2. Fetch slot for denormalized fields
  const slot = await tx.doctorSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: { doctorId: true, startsAt: true },
  });

  // 3. Create the appointment
  return tx.appointment.create({
    data: {
      userId, doctorId: slot.doctorId, slotId,
      scheduledAt: slot.startsAt, status: 'PENDING',
      patientNotes: patientNotes ?? null,
    },
    include: { doctor: { include: { category: { select: { id: true, name: true } } } } },
  });
});
```

**Why this is safe under concurrency:**
- The `updateMany WHERE status = 'AVAILABLE'` is atomic at the
  Postgres level. Two concurrent transactions both see
  `status = 'AVAILABLE'`, but only one can perform the update —
  the other sees `count = 0` and aborts with 409.
- The `tx` argument is the transaction-scoped Prisma client; every
  query inside the callback runs in the same transaction.
- If the `findUniqueOrThrow` or `create` fails after the
  `updateMany`, the transaction rolls back and the slot returns
  to `AVAILABLE`. (Caveat: a `findUniqueOrThrow` failure after
  the update is a rare edge case where the slot was deleted
  concurrently — see R12 in `research.md` for the trade-off.)

## Cancellation: The Slot Release Transaction

Cancellation is the second most contended operation. An admin
cancels an appointment, a patient concurrently tries to cancel the
same appointment, or a different patient tries to book the
released slot. The transaction serializes all three.

**Pattern (per research.md R4):**

```ts
await prisma.$transaction(async (tx) => {
  // 1. Fetch + validate the appointment
  const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new NotFoundException('Appointment not found');
  if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') {
    throw new ConflictException({ message: 'Appointment cannot be cancelled' });
  }

  // 2. Update the appointment
  const updated = await tx.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy },
    include: { doctor: { include: { category: { select: { id: true, name: true } } } } },
  });

  // 3. Release the slot
  await tx.doctorSlot.update({
    where: { id: updated.slotId },
    data: { status: 'AVAILABLE' },
  });

  return updated;
});
```

**Why this is safe under concurrency:**
- Two simultaneous cancellations: the first wins, the second sees
  `status = 'CANCELLED'` and returns 409.
- A booking attempt on the slot during cancellation: the booking
  `updateMany WHERE status = 'AVAILABLE'` either runs before the
  release (and succeeds, making the slot BOOKED again) or after
  (and succeeds because the slot is now AVAILABLE). The order
  is non-deterministic but the outcome is always consistent.
- A slot deletion during cancellation: the FK `onDelete:
  Restrict` prevents the deletion while the appointment is in
  flight; the cancellation completes first.

## Deactivation Cascade

The public slot listing and the booking endpoint both require the
doctor and the doctor's category to be ACTIVE. This is enforced
at the query level via a JOIN:

```ts
prisma.doctorSlot.findMany({
  where: {
    doctorId,
    status: 'AVAILABLE',
    doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
  },
  orderBy: { startsAt: 'asc' },
});
```

If a doctor is DEACTIVATED after slots are created, those slots
disappear from the public listing immediately. If a slot is
already BOOKED at the time of doctor deactivation, the
appointment remains in the database but the doctor's profile
returns 404 (per feature 005) and the patient cannot see the
doctor in the catalog. The admin can still manage the
appointment via the admin endpoints.

## Public Response Shapes

### `GET /api/doctors/:doctorId/slots`

```json
{
  "slots": [
    {
      "id": "slot_abc",
      "doctorId": "doc_xyz",
      "startsAt": "2026-08-01T09:00:00.000Z",
      "endsAt": "2026-08-01T09:30:00.000Z",
      "status": "AVAILABLE",
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/appointments` (response)

```json
{
  "appointment": {
    "id": "appt_abc",
    "status": "PENDING",
    "scheduledAt": "2026-08-01T09:00:00.000Z",
    "patientNotes": "Annual checkup",
    "doctor": {
      "id": "doc_xyz",
      "name": "Dr. Jane Smith",
      "category": { "id": "cat_cardio", "name": "Cardiology" }
    },
    "createdAt": "2026-07-12T00:00:00.000Z",
    "updatedAt": "2026-07-12T00:00:00.000Z"
  }
}
```

### `GET /api/appointments` (response)

```json
{
  "appointments": [
    {
      "id": "appt_abc",
      "status": "CONFIRMED",
      "scheduledAt": "2026-08-01T09:00:00.000Z",
      "patientNotes": "Annual checkup",
      "doctor": {
        "id": "doc_xyz",
        "name": "Dr. Jane Smith",
        "category": { "id": "cat_cardio", "name": "Cardiology" }
      },
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

## Migration

The migration is a single `prisma migrate dev` that adds the two
new models, their indexes, and the FK constraints. No existing
table is modified. The migration runs in a single transaction
(Prisma wraps each migration in one).

The `User` and `Doctor` back-relations are added by the same
migration (Prisma generates the necessary SQL automatically when
the schema is regenerated).
