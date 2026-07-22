# Feature Specification: Appointments & Booking

**Feature Branch**: `006-appointments-booking`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Module 3 — Appointments (slots & booking). Admin-managed slots, PENDING → CONFIRMED → COMPLETED lifecycle (or CANCELLED). Patients can cancel up to 24h before. Full booking loop scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Patient browses available slots for a doctor (Priority: P1)

A patient (signed-in user with role `user`) wants to find a free time slot with a specific doctor. They open the doctor's profile, see a list of slots that are still open, sorted chronologically, and can pick one to book.

**Why this priority**: Without a way to discover available slots, the rest of the booking loop is unreachable. This is the patient-facing entry point and the most common read.

**Independent Test**: Sign in as a patient, hit `GET /api/doctors/:doctorId/slots?status=AVAILABLE` for a doctor that has slots, and verify the response is the OPEN slots for that doctor, sorted ascending by start time, with no slots that are already BOOKED or BLOCKED.

**Acceptance Scenarios**:

1. **Given** a doctor has 5 OPEN slots, 2 BOOKED slots, and 1 BLOCKED slot, **When** a patient requests `GET /api/doctors/:doctorId/slots?status=AVAILABLE`, **Then** the response contains exactly the 5 OPEN slots, sorted ascending by `startsAt`.
2. **Given** a doctor has no slots at all, **When** a patient requests the slots list, **Then** the response is `{ slots: [], total: 0 }` with HTTP 200.
3. **Given** the requested doctor does not exist (or is DEACTIVATED), **When** a patient requests the slots list, **Then** the response is HTTP 404.
4. **Given** the patient is not signed in, **When** they request the slots list, **Then** the response is HTTP 401.

---

### User Story 2 - Patient books a slot (Priority: P1)

A patient picks an OPEN slot and books it. The slot is marked as BOOKED, a new appointment is created in PENDING status, and the patient receives a confirmation with the appointment id and the doctor's name.

**Why this priority**: This is the core write path of the booking loop. Without it, the platform has no way to record a patient's intent to see a doctor.

**Independent Test**: Sign in as a patient, pick an OPEN slot, POST `/api/appointments` with `{ slotId }`, and assert (a) HTTP 201 with the new appointment record, (b) the slot is now BOOKED in the database, (c) the appointment status is PENDING, (d) a second attempt to book the same slot returns 409.

**Acceptance Scenarios**:

1. **Given** a slot exists with status AVAILABLE for an ACTIVE doctor, **When** a signed-in patient posts `{ slotId }` to `/api/appointments`, **Then** the response is HTTP 201 with `{ appointment: { id, status: 'PENDING', scheduledAt, doctor: { id, name, category } } }` and the slot is now BOOKED.
2. **Given** a slot is already BOOKED, **When** a signed-in patient (or a different patient) tries to book the same slot, **Then** the response is HTTP 409 (no double-booking).
3. **Given** a patient posts a slotId that does not exist, **Then** the response is HTTP 404.
4. **Given** a patient posts a slotId that belongs to a doctor whose status is DEACTIVATED, **Then** the response is HTTP 400.
5. **Given** a patient posts a slotId whose `startsAt` is in the past, **Then** the response is HTTP 400.
6. **Given** the requester is not signed in, **Then** the response is HTTP 401.

---

### User Story 3 - Admin confirms a pending appointment (Priority: P1)

A Super Admin reviews the queue of PENDING appointments and confirms them. The appointment transitions PENDING → CONFIRMED and the patient sees the updated status in their booking list.

**Why this priority**: Until the admin confirms, the appointment is "soft" — it doesn't actually reserve the slot in the user's mind. Confirmation is the gate between "I asked" and "I'm booked".

**Independent Test**: Sign in as a patient and book a slot, then sign in as a Super Admin and PATCH `/api/admin/appointments/:id/confirm`. Assert the response is HTTP 200 with `status: 'CONFIRMED'` and the patient's `GET /api/appointments` returns the appointment with `status: 'CONFIRMED'`.

**Acceptance Scenarios**:

1. **Given** an appointment exists with status PENDING, **When** a Super Admin PATCHes `/api/admin/appointments/:id/confirm`, **Then** the response is HTTP 200 with `status: 'CONFIRMED'`.
2. **Given** an appointment is already CONFIRMED, **When** an admin tries to confirm it again, **Then** the response is HTTP 409 (idempotency via 409, not a silent no-op).
3. **Given** an appointment is CANCELLED, **When** an admin tries to confirm it, **Then** the response is HTTP 409 (a cancelled appointment cannot be revived).
4. **Given** the requester is not an admin, **Then** the response is HTTP 403.

---

### User Story 4 - Patient lists their own appointments (Priority: P1)

A patient wants to see their upcoming and past bookings. They hit `GET /api/appointments` and get a paginated list scoped to their own user id, sorted by scheduled time.

**Why this priority**: Without a list view, the patient has no way to know what they booked, when, or with whom.

**Independent Test**: Sign in as a patient, book two slots with different doctors, hit `GET /api/appointments`, and assert the response is exactly those two appointments scoped to the patient (no other patient's bookings appear).

**Acceptance Scenarios**:

1. **Given** a patient has 2 appointments (one PENDING, one CONFIRMED), **When** they request `GET /api/appointments`, **Then** the response contains exactly those 2 appointments scoped to them, sorted by `scheduledAt` ascending.
2. **Given** a patient has 5 appointments and the default page size is 20, **When** they request `GET /api/appointments`, **Then** the response is all 5 on one page.
3. **Given** a patient requests `?status=CONFIRMED`, **When** the response is returned, **Then** only the CONFIRMED appointments are in the list.
4. **Given** the requester is not signed in, **Then** the response is HTTP 401.
5. **Given** a different patient's appointment exists, **When** patient A requests their own list, **Then** patient A does NOT see patient B's appointments (privacy).

---

### User Story 5 - Patient cancels their own upcoming appointment (Priority: P2)

A patient changes their mind and cancels a future appointment. The appointment transitions to CANCELLED, the slot is freed back to AVAILABLE, and a new patient can book it.

**Why this priority**: Patients must be able to release a slot they no longer need, otherwise the catalog gets clogged. The 24-hour cutoff prevents last-minute abuse.

**Independent Test**: Sign in as a patient, book a slot for 48 hours from now, PATCH `/api/appointments/:id/cancel`, and assert (a) HTTP 200 with `status: 'CANCELLED'`, (b) the slot is now AVAILABLE again, (c) the slot can be re-booked by another patient.

**Acceptance Scenarios**:

1. **Given** a patient has a CONFIRMED appointment scheduled > 24h from now, **When** they PATCH `/api/appointments/:id/cancel`, **Then** the response is HTTP 200 with `status: 'CANCELLED'` and the associated slot is back to AVAILABLE.
2. **Given** a patient has a CONFIRMED appointment scheduled within 24h, **When** they try to cancel, **Then** the response is HTTP 403 (too late — admin must intervene).
3. **Given** a patient tries to cancel an appointment that belongs to a different patient, **Then** the response is HTTP 404 (information disclosure protection — the id does not "exist" for them).
4. **Given** a patient tries to cancel a CANCELLED appointment, **Then** the response is HTTP 409 (idempotency via 409).
5. **Given** a patient tries to cancel a COMPLETED appointment, **Then** the response is HTTP 409 (past appointments are immutable).

---

### User Story 6 - Admin cancels any appointment (Priority: P2)

A Super Admin needs to cancel appointments on behalf of patients (no-shows, doctor unavailability, support tickets). The admin can cancel any appointment regardless of timing.

**Why this priority**: This is the safety valve — admins must be able to override any patient-side restriction, including the 24h cutoff.

**Independent Test**: Sign in as a patient and book a slot for 2 hours from now. Sign in as a Super Admin, PATCH `/api/admin/appointments/:id/cancel`, assert HTTP 200 and the slot is freed.

**Acceptance Scenarios**:

1. **Given** an appointment exists (any status, any timing), **When** an admin PATCHes `/api/admin/appointments/:id/cancel`, **Then** the response is HTTP 200 with `status: 'CANCELLED'` and the slot is AVAILABLE again.
2. **Given** an admin cancels a CANCELLED appointment, **Then** the response is HTTP 409.
3. **Given** the requester is not an admin, **Then** the response is HTTP 403.

---

### User Story 7 - Admin marks a confirmed appointment as completed (Priority: P2)

After the appointment time has passed, a Super Admin marks the appointment as COMPLETED. This is the terminal "did happen" state and is the prerequisite for any future review/payment features.

**Why this priority**: Without a terminal "completed" state, downstream features (reviews, payments) cannot know which appointments are eligible. This is a small admin action that unlocks the next module.

**Independent Test**: Create a confirmed appointment in the past, sign in as admin, PATCH `/api/admin/appointments/:id/complete`, assert HTTP 200 with `status: 'COMPLETED'`.

**Acceptance Scenarios**:

1. **Given** a CONFIRMED appointment exists with `scheduledAt` in the past, **When** an admin PATCHes `/api/admin/appointments/:id/complete`, **Then** the response is HTTP 200 with `status: 'COMPLETED'`.
2. **Given** a PENDING appointment exists, **When** an admin tries to complete it, **Then** the response is HTTP 409 (must be CONFIRMED first).
3. **Given** a COMPLETED appointment exists, **When** an admin tries to complete it again, **Then** the response is HTTP 409.
4. **Given** a CONFIRMED appointment exists with `scheduledAt` in the future, **When** an admin tries to complete it, **Then** the response is HTTP 400 (cannot complete a future appointment).

---

### User Story 8 - Admin creates and manages doctor slots (Priority: P1)

A Super Admin needs to populate a doctor's schedule with bookable time slots. They can create one slot or a batch of slots, view existing slots, and BLOCK slots that are unavailable (e.g. doctor on vacation).

**Why this priority**: Without slots, there is nothing to book. Slot CRUD is the prerequisite for US1, US2, and the entire booking loop. The admin pattern is consistent with category and doctor CRUD from feature 005.

**Independent Test**: Sign in as a Super Admin, POST `/api/admin/doctors/:doctorId/slots` with `{ startsAt, endsAt }` for a future time, assert the slot is created with status AVAILABLE. Then GET the slot list and verify it appears.

**Acceptance Scenarios**:

1. **Given** a doctor exists and is ACTIVE, **When** an admin POSTs a slot with `startsAt < endsAt` and both in the future, **Then** the response is HTTP 201 with `{ slot: { id, doctorId, startsAt, endsAt, status: 'AVAILABLE' } }`.
2. **Given** an admin POSTs a slot with `startsAt >= endsAt`, **Then** the response is HTTP 400.
3. **Given** an admin POSTs a slot with `startsAt` in the past, **Then** the response is HTTP 400.
4. **Given** an admin POSTs a slot for a doctor that does not exist, **Then** the response is HTTP 404.
5. **Given** an admin POSTs a slot for a doctor whose category is DEACTIVATED, **Then** the response is HTTP 400 (booking requires active doctor AND active category, per feature 005).
6. **Given** an existing slot, **When** an admin PATCHes it to status BLOCKED, **Then** patients cannot see it in the AVAILABLE list and cannot book it.
7. **Given** an existing AVAILABLE slot, **When** an admin DELETEs it, **Then** it is removed (only AVAILABLE slots can be deleted; BOOKED or BLOCKED cannot).
8. **Given** an existing BOOKED slot, **When** an admin tries to delete it, **Then** the response is HTTP 409.

---

### Edge Cases

- **Concurrent booking attempts**: Two patients hit the booking endpoint at the same moment for the same slot. Exactly one wins (201), the other gets 409. Enforced by an atomic conditional update inside a `prisma.$transaction` (Principle IV).
- **Slot past-time guard**: A slot in the past cannot be booked or completed prematurely. Booking rejects with 400 if `startsAt <= now`. Completion rejects with 400 if `scheduledAt > now`.
- **Slot ownership on cancellation**: When an appointment is CANCELLED, the slot's status must atomically return to AVAILABLE. Implemented inside the same `prisma.$transaction` as the appointment update so a partial failure cannot leave a "BOOKED" slot with a "CANCELLED" appointment.
- **Deactivated doctor**: If a doctor is DEACTIVATED after slots are created, the public slot listing returns 404 (consistent with feature 005's deactivation rules).
- **Deactivated category**: Slots for doctors in a DEACTIVATED category are hidden from the public listing (consistent with feature 005's deactivation cascade).
- **Slot with no doctor reference**: Cannot happen because the FK is NOT NULL. Enforced at the DB level.
- **Past-time slot creation**: Admin cannot create slots in the past (400). This is a write-time guard, not a read-time filter.
- **Slot overlapping an existing slot for the same doctor**: For v1, we allow it (a doctor may have a 9:00-9:30 slot AND a 9:15-9:45 slot if the admin makes a mistake). The booking concurrency guard prevents double-booking. A future enhancement could add a uniqueness check or an overlap validator — out of scope for v1.
- **Patient self-cancel after 24h cutoff**: Patient gets 403 with a clear message ("Within 24 hours of the appointment; please contact support"). Admin can still cancel.
- **Listing paginated with `?pageSize=101`**: DTO `Max(100)` validation returns 400.
- **Slot that spans midnight**: Allowed — the date is just an ISO 8601 timestamp. No special handling needed.
- **Patient account deactivated mid-booking**: The booking transaction checks `user.isActive` (mirroring the existing `RolesGuard` pattern) and returns 403 if not.
- **Slot created for a non-existent category**: Already prevented by the FK from Doctor to Category.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist two new tables: `DoctorSlot` and `Appointment`. A `DoctorSlot` represents a bookable time window; an `Appointment` records a patient's claim on a slot.
- **FR-002**: `DoctorSlot` MUST have fields: `id` (cuid), `doctorId` (FK → `Doctor.id`, NOT NULL, `onDelete: Restrict`), `startsAt` (DateTime, NOT NULL), `endsAt` (DateTime, NOT NULL), `status` (String default `"AVAILABLE"`, enum: `AVAILABLE` | `BOOKED` | `BLOCKED`), `createdAt`, `updatedAt`. `@@index([doctorId, startsAt])` and `@@index([status])`.
- **FR-003**: `Appointment` MUST have fields: `id` (cuid), `userId` (FK → `User.id`, NOT NULL, `onDelete: Restrict`), `doctorId` (FK → `Doctor.id`, NOT NULL, `onDelete: Restrict`, denormalized from the slot for query speed), `slotId` (FK → `DoctorSlot.id`, NOT NULL, UNIQUE, `onDelete: Restrict`), `scheduledAt` (DateTime, denormalized from the slot for query speed), `status` (String default `"PENDING"`, enum: `PENDING` | `CONFIRMED` | `COMPLETED` | `CANCELLED`), `patientNotes` (String?, max 2000), `adminNotes` (String?, max 2000), `cancelledAt` (DateTime?), `cancelledBy` (String?, enum: `USER` | `ADMIN`), `createdAt`, `updatedAt`. `@@index([userId, scheduledAt])`, `@@index([doctorId, scheduledAt])`, `@@index([status])`.
- **FR-004**: A `DoctorSlot` can be associated with at most one `Appointment` (enforced by the UNIQUE constraint on `Appointment.slotId`).
- **FR-005**: Booking MUST execute inside a `prisma.$transaction`. The transaction (a) runs an `UPDATE DoctorSlot SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE'`, (b) checks the affected row count, (c) if 0 rows were updated throws `ConflictException(409)`, (d) otherwise creates the `Appointment` with `status = 'PENDING'`. This is the canonical anti-double-booking pattern (Principle IV).
- **FR-006**: Cancellation MUST execute inside a `prisma.$transaction` that atomically (a) sets `Appointment.status = 'CANCELLED'`, (b) sets `Appointment.cancelledAt = now()` and `Appointment.cancelledBy = 'USER' | 'ADMIN'`, (c) sets the associated `DoctorSlot.status = 'AVAILABLE'`. A partial failure rolls back both.
- **FR-007**: Patients MUST be able to cancel their own PENDING or CONFIRMED appointments scheduled more than 24 hours from now. Cancellation within 24 hours returns 403; only admins can cancel within 24 hours.
- **FR-008**: Patients MUST NOT be able to view, modify, or cancel any other patient's appointments. Cross-patient access returns 404 (information disclosure protection — the id is "not found" from the patient's perspective).
- **FR-009**: The system MUST expose a public `GET /api/doctors/:doctorId/slots?status=AVAILABLE` endpoint that returns the OPEN slots for an ACTIVE doctor, sorted ascending by `startsAt`. No authentication required. (Same auth pattern as the existing public doctor endpoints — `@AllowAnonymous()` but the slot listing is rate-limited.)
- **FR-010**: The system MUST expose a patient-authenticated `POST /api/appointments` endpoint that takes `{ slotId, patientNotes? }` and returns the created appointment with the nested doctor object.
- **FR-011**: The system MUST expose a patient-authenticated `GET /api/appointments` endpoint that returns the patient's own appointments, paginated, with optional `?status=` filter.
- **FR-012**: The system MUST expose a patient-authenticated `PATCH /api/appointments/:id/cancel` endpoint for patient self-cancellation.
- **FR-013**: The system MUST expose admin-authenticated `POST /api/admin/doctors/:doctorId/slots` and `PATCH /api/admin/slots/:id` and `DELETE /api/admin/slots/:id` and `PATCH /api/admin/slots/:id/block` endpoints for slot CRUD.
- **FR-014**: The system MUST expose admin-authenticated `GET /api/admin/appointments` (filterable by `status`, `userId`, `doctorId`, paginated) and `GET /api/admin/appointments/:id` for admin oversight.
- **FR-015**: The system MUST expose admin-authenticated `PATCH /api/admin/appointments/:id/confirm`, `PATCH /api/admin/appointments/:id/cancel`, and `PATCH /api/admin/appointments/:id/complete` lifecycle endpoints.
- **FR-016**: All admin endpoints MUST require an authenticated session with the `admin` role (existing `RolesGuard` + `@Roles('admin')` pattern). Patient endpoints MUST require an authenticated session with role `user` or `admin` (a user without an active session returns 401; a deactivated user returns 403).
- **FR-017**: The slot listing endpoint MUST return 404 if the doctor is DEACTIVATED or the doctor's category is DEACTIVATED. This mirrors feature 005's deactivation rules.
- **FR-018**: The system MUST prevent booking a slot whose `startsAt` is in the past (returns 400).
- **FR-019**: The system MUST prevent an admin from completing a CONFIRMED appointment whose `scheduledAt` is in the future (returns 400). Past-time completion is allowed.
- **FR-020**: The system MUST rate-limit the public slot listing and the patient booking endpoint per IP (e.g. via `@nestjs/throttler`, consistent with feature 004 patterns).
- **FR-021**: The system MUST include a `Cache-Control: public, max-age=N` header on the public slot listing (60s — same as the public doctor listing).
- **FR-022**: Appointment responses MUST include the nested `doctor: { id, name, category: { id, name } }` object so the patient UI can render the booking without an extra round trip.
- **FR-023**: The migration MUST be additive — no changes to existing tables (`User`, `Session`, `Account`, `Verification`, `Doctor`, `Category`). The migration creates only the two new tables and their indexes/constraints.
- **FR-024**: Booking MUST validate that the requesting `User` is active (`isActive = true`); a deactivated user gets 403 (consistent with `RolesGuard` behavior).
- **FR-025**: Slot creation MUST validate that the slot's `endsAt` is strictly greater than `startsAt` and both are in the future; violations return 400.

### Key Entities *(include if feature involves data)*

- **DoctorSlot**: A bookable time window attached to a doctor. Lifecycle: `AVAILABLE` → `BOOKED` (on patient booking) or `BLOCKED` (on admin block) → `AVAILABLE` (on cancellation) or deleted. One slot can result in at most one active appointment. Relations: many slots belong to one doctor; at most one appointment per slot (UNIQUE).
- **Appointment**: A patient's claim on a doctor slot. Lifecycle: `PENDING` (on booking) → `CONFIRMED` (admin confirms) → `COMPLETED` (admin completes after the visit). May be `CANCELLED` from `PENDING` or `CONFIRMED` (by patient within 24h cutoff, or by admin anytime). Terminal states: `COMPLETED` and `CANCELLED` are immutable. Relations: belongs to one user; references one doctor (denormalized) and one slot (unique).
- **No other entities are introduced.** `User`, `Doctor`, `Category`, and Better Auth tables are untouched.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A patient can complete the full booking loop (browse slots → book → see in their list → cancel) in under 60 seconds of user time, on a typical broadband connection.
- **SC-002**: When two patients simultaneously attempt to book the same slot, exactly one receives a 201 success response and the other receives a 409. Verified via a load test that fires 10 concurrent requests; exactly 1 succeeds and 9 receive 409.
- **SC-003**: 100% of booking attempts for already-BOOKED slots are rejected with 409, regardless of timing. Verified by re-trying a known-booked slot 100 times; all 100 attempts return 409.
- **SC-004**: After rollout, 100% of `Appointment` rows have a non-null `slotId` referencing a `DoctorSlot`, and 100% of `DoctorSlot` rows with `status = 'BOOKED'` have exactly one associated `Appointment` (referential integrity enforced by the UNIQUE constraint).
- **SC-005**: An admin can confirm, cancel, or complete any appointment regardless of timing, and these state transitions persist as expected (re-verifiable by re-fetching the appointment).
- **SC-006**: A patient can only see, modify, or cancel their OWN appointments. Cross-patient access attempts return 404. Verified by attempting to access another patient's appointment id 100 times across both GET and PATCH; 100% return 404.
- **SC-007**: The 24-hour patient self-cancel cutoff is enforced. Verified by attempting to cancel a CONFIRMED appointment scheduled 23 hours from now: returns 403. Same appointment at 25 hours: returns 200.
- **SC-008**: Public slot listing returns only AVAILABLE slots for ACTIVE doctors in ACTIVE categories, sorted ascending by start time, and is rate-limited per IP (60 req/min, consistent with feature 004's listing endpoint).
- **SC-009**: Appointment listing for a patient returns only that patient's appointments (never another patient's), and is paginated (default 20, max 100).
- **SC-010**: An admin can create, list, edit, block, and delete slots for any ACTIVE doctor via the admin endpoints. These operations persist in the database as expected.
- **SC-011**: Deactivated doctors or doctors in deactivated categories have their slots hidden from the public listing (returns 404) and from patient booking (returns 400), with no leakage.

## Assumptions

- **Slot granularity**: Slots are flexible in duration; the system does not enforce a fixed length (e.g. 30 min). The admin chooses `startsAt` and `endsAt`. The first version does not support recurring slots ("every Monday 9-17") — each slot is a one-off range.
- **Slot overlapping**: The first version does not prevent overlapping slots for the same doctor. The admin is responsible for not creating overlaps. A future enhancement could add an overlap-detection validator.
- **No payment or review in scope**: This feature is the booking loop only. Payment integration, review writing, and notifications are out of scope and will land in subsequent features (Module 4, 5, 6). The COMPLETED state exists in the lifecycle so those future features can key off it.
- **Confirmation is admin-driven**: Since doctors are not platform users (per feature 003), an admin confirms PENDING appointments on the doctor's behalf. The confirmation flow is the only way an appointment becomes "firm" in v1.
- **Single-clinic identity**: A slot is for one doctor. A patient cannot book a single slot for multiple doctors (consistent with feature 005's single-clinic identity principle).
- **Cancellable status**: A `COMPLETED` appointment is terminal and cannot be cancelled. A `CANCELLED` appointment is terminal and cannot be un-cancelled. The "complete" and "cancel" actions are one-way doors.
- **Cancellation timestamps**: When a patient cancels, `cancelledBy = 'USER'`. When an admin cancels, `cancelledBy = 'ADMIN'`. This supports future audit/analytics.
- **Time zones**: All timestamps are stored as UTC `DateTime` in the database. The patient's local time is a presentation concern, out of scope for v1.
- **Idempotency for the cancel sub-resource**: A second cancel attempt on a CANCELLED appointment returns 409, not 200. Consistent with the deactivate pattern in features 003/005.
- **Idempotency for confirm**: Same — second confirm returns 409.
- **Past-time booking is rejected at the DTO layer**: A 400 with a clear message. This is a write-time guard, not a read-time filter.
- **Past-time slot creation is rejected at the DTO layer**: Same pattern.
- **The user is active**: If a user is `isActive = false` (deactivated by an admin), they cannot book. Existing `RolesGuard` returns 403 for deactivated users; the booking service applies the same check.
- **No waitlist / no priority queue**: v1 is first-come-first-served. If a slot is taken, the patient picks another one. Waitlist is a future enhancement.
- **No reschedule flow**: A patient who wants to change the time must cancel and re-book. A dedicated reschedule endpoint is a future enhancement.
- **No bulk slot creation UI**: The admin endpoint accepts a single slot per request. A bulk endpoint (`POST /api/admin/doctors/:doctorId/slots/batch`) is a future enhancement. v1 admin can script the loop externally.
- **No slot "owner" concept beyond the doctor**: Slots are not owned by individual users. A BLOCKED slot is universally unavailable (e.g. doctor on holiday), not "unavailable to this specific user".
- **Better Auth tables remain untouched**: This feature introduces only two new domain tables. The migration does not touch `User`, `Session`, `Account`, `Verification`, `Doctor`, or `Category`.
- **No new third-party dependencies**: This feature uses the existing Prisma client and NestJS infrastructure. No new libraries required.
- **Slot ↔ appointment 1:1 invariant**: The UNIQUE constraint on `Appointment.slotId` is the database-level enforcement. The application's `prisma.$transaction` is the application-level enforcement. Both are required for the concurrency guarantee.
