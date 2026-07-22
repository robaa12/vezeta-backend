# Research: Appointments & Booking

**Feature**: 006-appointments-booking
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (introduced standalone `Doctor`),
004-doctor-search (public doctor surface), 005-doctor-categories
(`categoryId` FK, `Category.status = ACTIVE` deactivation cascade).

## R1: New `Appointments` Feature Module Location

**Decision**: Create a new `src/appointments/` feature module with
**two controllers** in the same module: a public
`SlotsController` (anonymous reads of a doctor's available slots) and
a patient-authenticated `AppointmentsController` (book, list mine,
cancel mine). Admin slot + appointment management lives in
`src/admin/` and `src/admin/appointments.controller.ts` — consistent
with how admin category CRUD is split today (admin controller lives
in `src/admin/`, public + admin-category controllers live in
`src/categories/`). The split for THIS feature, however, follows a
**slightly different rule**: slots and appointments are tightly
coupled (a slot IS a precondition for an appointment), so they live
together in `src/appointments/`. Admin actions on either entity are
exposed through the existing `src/admin/admin.controller.ts` (or a
new `src/admin/appointments.controller.ts`) so the admin surface
stays single-tenant.

Final structure:
- `src/appointments/` — patient-facing + public-facing: `slots` (public
  read) + `appointments` (patient book/list/cancel)
- `src/admin/appointments.controller.ts` — admin actions: slot CRUD
  + appointment lifecycle
- `src/admin/admin.module.ts` — registers the admin appointments
  controller

**Rationale**: Constitution's Principle I ("Feature-Module
Architecture") requires each domain to own its module. The booking
loop is its own domain (slots + appointments are not a sub-resource
of `doctor` or `category`). Splitting the controllers (rather than
one controller with per-route `@AllowAnonymous()` and
`@Roles('admin')`) keeps the auth surface explicit at the class
level.

**Alternatives considered**:
- Put both patient + admin + public endpoints in
  `src/appointments/appointments.controller.ts` with per-method
  decorators — rejected: mixes auth surfaces; harder to audit; the
  codebase already prefers module-level guards (see
  `categories.controller.ts` vs `admin-categories.controller.ts`).
- Put admin endpoints in `src/admin/admin.controller.ts` (add ~6
  methods) and patient + public endpoints in
  `src/appointments/` — chosen. Keeps the admin surface single-tenant
  and avoids splitting slot CRUD across two unrelated modules.

**Key patterns**:
- `src/appointments/appointments.module.ts` registers the two
  controllers and the `AppointmentsService`. Exports the service so
  the admin module can use it.
- `src/appointments/slots.controller.ts` mounts at
  `/api/doctors/:doctorId/slots`, marks the handler
  `@AllowAnonymous()`.
- `src/appointments/appointments.controller.ts` mounts at
  `/api/appointments`, requires an authenticated session.
- `src/admin/appointments.controller.ts` mounts at
  `/api/admin/...` and applies the existing `RolesGuard` +
  `@Roles('admin')` pattern.
- `app.module.ts` imports `AppointmentsModule` alongside the
  existing `AdminModule`.

**Gotchas**:
- The `RolesGuard` rejects deactivated users with 403. The booking
  flow must additionally reject deactivated users with 403 (same
  outcome, but the rejection comes from the booking service's
  `user.isActive` check inside the transaction — not from the
  guard). Either way, the response is 403, so the client experience
  is the same.
- The `RolesGuard` is provided in `src/admin/admin.module.ts`. The
  admin appointments controller imports it from there. The patient
  controller does NOT use `RolesGuard` (it requires authentication
  but not a specific role — patients are `user`, but admins can
  also book on behalf of a patient via the admin flow if needed).
  Per the spec, the patient endpoint is accessible to any
  authenticated active user.

---

## R2: Prisma Schema — `DoctorSlot` and `Appointment`

**Decision**: Add two new models to `prisma/schema.prisma`:

```prisma
model DoctorSlot {
  id        String   @id @default(cuid())
  doctorId  String
  startsAt  DateTime
  endsAt    DateTime
  status    String   @default("AVAILABLE")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  doctor      Doctor       @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  appointment Appointment?

  @@index([doctorId, startsAt])
  @@index([status])
  @@map("doctor_slot")
}

model Appointment {
  id           String    @id @default(cuid())
  userId       String
  doctorId     String
  slotId       String    @unique
  scheduledAt  DateTime
  status       String    @default("PENDING")
  patientNotes String?
  adminNotes   String?
  cancelledAt  DateTime?
  cancelledBy  String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user   User        @relation(fields: [userId], references: [id], onDelete: Restrict)
  doctor Doctor      @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  slot   DoctorSlot  @relation(fields: [slotId], references: [id], onDelete: Restrict)

  @@index([userId, scheduledAt])
  @@index([doctorId, scheduledAt])
  @@index([status])
  @@map("appointment")
}
```

**Rationale**:
- `DoctorSlot` and `Appointment` are 1:1 (one slot results in at
  most one appointment). The UNIQUE constraint on `Appointment.slotId`
  is the database-level enforcement. The application's
  `prisma.$transaction` is the application-level enforcement.
- `Appointment.userId`, `Appointment.doctorId`, and
  `Appointment.scheduledAt` are denormalized from the slot and the
  doctor for query speed (avoiding a JOIN on every list query).
- `onDelete: Restrict` on every FK prevents accidental cascading
  deletes that would orphan appointments. The admin must cancel
  appointments before deleting a doctor/slot.
- `@@index([doctorId, startsAt])` on DoctorSlot supports the public
  listing (filter by doctor, sort by start time).
- `@@index([status])` on both supports status-filtered admin
  queries.
- `@@index([userId, scheduledAt])` on Appointment supports the
  patient listing (filter by user, sort by scheduled time).
- `@@index([doctorId, scheduledAt])` on Appointment supports the
  future "doctor schedule" admin view.

**Alternatives considered**:
- Use `DoctorSchedule` (a weekly recurring template) and
  `DoctorSlot` (a concrete instance) — rejected: out of scope for
  v1. v1 has one-off slots only.
- Use `Appointment.status` as a Prisma `enum` — rejected: matches
  the existing convention (`Doctor.status` is a `String`, not an
  enum) to keep the migration small.
- Embed `slotId` as a `cuid` string with no FK — rejected: loses
  Prisma's `include: { slot: true }` ergonomics and the FK
  constraint as a backstop.

**Key patterns**:
- The migration creates the two tables + indexes + FKs in a single
  transaction.
- The migration is **additive** — no changes to existing tables
  (per FR-023).
- The `User` and `Doctor` models gain back-relations
  (`appointments Appointment[]`) but their existing fields are not
  modified.

**Gotchas**:
- The `@@unique([slotId])` constraint on Appointment means a
  Prisma `appointment.create` will throw a unique-violation error
  if the slot is already booked. The application code MUST catch
  this in a transaction (see R4) — otherwise concurrent bookings
  could double-create appointments before the slot update is
  committed.
- The `cancelledBy` field is `String?` (not an enum) for the same
  reason — consistency with the project's `String` convention.
  Valid values: `'USER'`, `'ADMIN'`.

---

## R3: Concurrent Booking — The `prisma.$transaction` Pattern

**Decision**: Booking executes inside a `prisma.$transaction` that
performs a conditional update on the slot and creates the
appointment atomically.

```ts
async bookSlot(userId: string, slotId: string, patientNotes?: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Conditional update: only succeeds if slot is AVAILABLE
    const updated = await tx.doctorSlot.updateMany({
      where: { id: slotId, status: 'AVAILABLE' },
      data: { status: 'BOOKED' },
    });
    if (updated.count === 0) {
      throw new ConflictException({
        message: 'Slot is no longer available',
        error: 'slot_unavailable',
      });
    }

    // 2. Fetch the slot to denormalize doctorId + scheduledAt
    const slot = await tx.doctorSlot.findUniqueOrThrow({
      where: { id: slotId },
      select: { doctorId: true, startsAt: true },
    });

    // 3. Create the appointment
    return tx.appointment.create({
      data: {
        userId,
        doctorId: slot.doctorId,
        slotId,
        scheduledAt: slot.startsAt,
        status: 'PENDING',
        patientNotes: patientNotes ?? null,
      },
      include: {
        doctor: { include: { category: { select: { id: true, name: true } } } },
      },
    });
  });
}
```

**Rationale**: This is the canonical anti-double-booking pattern
(Constitution Principle IV). The `updateMany` with a `WHERE` clause
on the `status` field is atomic at the database level: two
concurrent transactions both attempt the update, but only one can
succeed because the row's status changes from `AVAILABLE` to
`BOOKED` after the first commit. The second transaction's
`updateMany` returns `count: 0` and we throw 409.

**Alternatives considered**:
- `SELECT ... FOR UPDATE` (pessimistic locking) — rejected: requires
  raw SQL or a Prisma extension; the conditional update is simpler
  and database-agnostic.
- Optimistic locking with a `version` column on `DoctorSlot` —
  rejected: adds a column for no real benefit; the conditional
  update achieves the same result.
- Two separate queries (check availability, then update) wrapped in
  a transaction — rejected: the `check` is a read, which is
  racy. The `updateMany ... WHERE status = 'AVAILABLE'` is
  atomic; the count check is the read that returns 0 or 1.

**Key patterns**:
- The transaction is small (~10 lines) and completes in
  single-digit milliseconds.
- The `ConflictException` payload matches the existing pattern in
  `admin.service.ts` for the "already deactivated" error (e.g.
  `{ message: '...', error: '...' }`).
- The `findUniqueOrThrow` after the `updateMany` is a redundant
  read but is necessary to get the `doctorId` and `startsAt` for
  the appointment. An optimization is to inline these into the
  `updateMany` returning clause (`updateMany` doesn't return data
  in Prisma), so a follow-up read is required.

**Gotchas**:
- The transaction's `tx` argument is the same shape as `prisma` but
  isolated; passing `tx` (not `prisma`) to every query inside the
  transaction is critical.
- The Prisma `updateMany` returns `{ count: number }` — NOT the
  updated record. This is different from `update` which returns the
  record. The conditional-update pattern requires `updateMany` for
  the atomicity, so we do a follow-up `findUniqueOrThrow`.

---

## R4: Cancellation — Atomic Slot Release

**Decision**: Cancellation (both patient-side and admin-side)
executes inside a `prisma.$transaction` that atomically sets the
appointment status to `CANCELLED` and the slot status back to
`AVAILABLE`.

```ts
async cancelAppointment(appointmentId: string, cancelledBy: 'USER' | 'ADMIN') {
  return this.prisma.$transaction(async (tx) => {
    // 1. Fetch and validate the appointment
    const appt = await tx.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appt) {
      throw new NotFoundException('Appointment not found');
    }
    if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') {
      throw new ConflictException({
        message: 'Appointment cannot be cancelled',
        error: 'invalid_state_transition',
      });
    }

    // 2. Update the appointment
    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy,
      },
      include: { slot: true, doctor: { include: { category: true } } },
    });

    // 3. Release the slot
    await tx.doctorSlot.update({
      where: { id: updated.slotId },
      data: { status: 'AVAILABLE' },
    });

    return updated;
  });
}
```

**Rationale**: Without the transaction, an admin could cancel an
appointment and a concurrent patient could attempt to book the same
slot between the appointment update and the slot update — leaving
the slot in a stale `BOOKED` state. The transaction serializes the
two updates against any other write touching the same `slotId`.

**Alternatives considered**:
- Use the `DoctorSlot.status` change as the trigger via a Prisma
  middleware or a database trigger — rejected: the application code
  is the right place for this business logic; a trigger would
  duplicate it and make it harder to test.
- Two separate non-transactional queries — rejected: racy (see
  rationale above).

**Key patterns**:
- The transaction body is small (~20 lines) and completes in
  single-digit milliseconds.
- The `ConflictException` payload is consistent with the rest of
  the codebase.
- The `cancelledBy` field is `'USER'` or `'ADMIN'`.

**Gotchas**:
- The `findUnique` inside the transaction is a read that can race
  with another cancellation. Postgres' default `READ COMMITTED`
  isolation is sufficient here because the subsequent `update`
  with the `WHERE id = $1` clause is atomic — the second
  transaction will see the `CANCELLED` state and return a 409
  instead of overwriting it.
- A more defensive approach is to use a conditional update on the
  appointment (`updateMany WHERE status NOT IN ('CANCELLED',
  'COMPLETED')`) and check the count, similar to R3. This is
  overkill for the cancellation case (cancellation is rare and
  has lower contention) but is an option if contention is observed
  in production.

---

## R5: Patient 24-Hour Self-Cancel Cutoff

**Decision**: The patient-side cancel endpoint enforces a 24-hour
cutoff: appointments scheduled less than 24 hours from now cannot
be cancelled by the patient (returns 403). Admin-side cancel has
no such cutoff.

```ts
async cancelMyAppointment(userId: string, appointmentId: string) {
  const appt = await this.prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appt || appt.userId !== userId) {
    // 404 (not 403) for information-disclosure protection
    throw new NotFoundException('Appointment not found');
  }
  const hoursUntil = (appt.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil < 24) {
    throw new ForbiddenException({
      message: 'Cannot cancel within 24 hours of the appointment; please contact support',
      error: 'too_late_to_cancel',
    });
  }
  // ... proceed with the transaction in R4
}
```

**Rationale**: Returns 404 (not 403) when the appointment does not
belong to the requesting user. This is the "information disclosure
protection" pattern — a malicious user cannot probe the
appointment-id space to discover other users' appointments. A
404 is indistinguishable from a non-existent id.

The 24-hour cutoff is enforced at the service layer (not the DTO
or guard) because the cutoff depends on the appointment's
`scheduledAt`, which is dynamic.

**Alternatives considered**:
- Enforce the cutoff in the controller via a custom guard —
  rejected: requires the guard to load the appointment from the
  database, duplicating the fetch.
- Allow patient to cancel any time (no cutoff) — rejected: the
  user explicitly chose "24-hour cutoff" in clarifying questions.
- Use a different cutoff (12h, 48h, 1h) — rejected: the user
  explicitly chose 24h.

**Key patterns**:
- The check happens BEFORE the transaction in R4 — there's no
  reason to enter a transaction for an appointment we already
  know is past the cutoff.
- The `ForbiddenException` is appropriate here because the user
  is authenticated and authorized to access the resource, but is
  not allowed to perform the action at this time.

**Gotchas**:
- The cutoff is computed in the server's local time. If the
  server is in a different time zone than the patient, the
  cutoff is still 24 hours from the slot's start, but the patient
  may perceive it differently. v1 doesn't address this — a future
  enhancement could let the client pass a time zone.
- The clock is the server's `Date.now()`. If the server's clock
  is wrong (e.g. NTP drift), the cutoff is wrong. This is
  accepted as a system-level risk; production deployments should
  use NTP.

---

## R6: Slot Listing — Public Read

**Decision**: A single endpoint `GET /api/doctors/:doctorId/slots`
that returns the AVAILABLE slots for an ACTIVE doctor in an ACTIVE
category, sorted ascending by `startsAt`. Anonymous. Rate-limited.
Cached.

**Rationale**: This is the public read counterpart of admin slot
CRUD. The endpoint is the data source for the patient slot picker
in the UI; it returns structured records (id + times + status) so
the client can issue a follow-up `POST /api/appointments` without
re-querying.

**Alternatives considered**:
- Keep the slot listing behind authentication (e.g. require
  sign-in) — rejected: the spec requires anonymous access (FR-009).
  Authentication adds friction; patients may want to browse slots
  before signing up.
- Inline the slots into the public doctor profile response
  (`doctors: [...], slots: [...]`) — rejected: makes the doctor
  profile response bigger and harder to cache; slots are
  time-sensitive and change more often than doctor attributes.
  Separate endpoints with separate cache TTLs.

**Key patterns**:
- `@AllowAnonymous()` on the controller method.
- `@Throttle({ default: { limit: 60, ttl: 60_000 } })` (matches the
  listing endpoint's rate limit from feature 004).
- `@Header('Cache-Control', 'public, max-age=60')` (60s TTL;
  shorter than the categories endpoint because slots are more
  time-sensitive).
- Service query:
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
  The `doctor` join enforces the deactivation cascade from feature
  005 (DEACTIVATED doctor or category → slots hidden).

**Gotchas**:
- The endpoint is at `/api/doctors/:doctorId/slots`, NOT
  `/api/slots?doctorId=...`. The path-based shape is consistent
  with the existing public `GET /api/doctors/:id` profile and
  makes the doctor-slot relationship explicit in the URL.
- Past-time AVAILABLE slots are not filtered out at the query
  level. The admin is responsible for not creating past-time
  slots. If a past-time slot exists, it appears in the listing —
  the patient booking attempt will then be rejected with 400
  (per FR-018). A future enhancement could add a `startsAt > now()`
  filter to the public listing.
- The `startsAt > now()` filter would also have the side effect of
  "magically" hiding slots that just passed. For v1, we keep the
  listing pure (every AVAILABLE slot is listed) and let the
  booking endpoint enforce the past-time guard. This is more
  consistent (admin can see past-time slots in the admin list
  too) and avoids the magic filter.

---

## R7: Appointment Listing — Patient-Scoped

**Decision**: A patient-authenticated `GET /api/appointments`
endpoint that returns the requesting patient's own appointments,
paginated, with optional `?status=` filter.

```ts
async listMyAppointments(userId: string, query: ListAppointmentsDto) {
  const where: Record<string, unknown> = { userId };
  if (query.status) where.status = query.status;
  const [records, total] = await Promise.all([
    this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        doctor: { include: { category: { select: { id: true, name: true } } } },
      },
    }),
    this.prisma.appointment.count({ where }),
  ]);
  return { appointments: records, total, page: query.page, pageSize: query.pageSize };
}
```

**Rationale**: `where: { userId }` is the privacy guarantee — the
service does not accept a `userId` from the request; it uses the
authenticated user's id. Cross-patient access is impossible at the
service level (the WHERE clause filters them out).

**Alternatives considered**:
- Trust the client to pass `userId` in the query — rejected: a
  malicious user could pass any userId and see other patients'
  appointments.
- Add an admin endpoint that lists ALL appointments with an
  optional `?userId=` filter — this is FR-014, separate from the
  patient listing.

**Key patterns**:
- `@UseGuards(BetterAuthGuard)` (or whatever the session guard is
  named) on the controller class.
- The `userId` comes from the session, NOT from the request body
  or query.
- DTO: `status` (optional enum), `page` (default 1), `pageSize`
  (default 20, max 100).

**Gotchas**:
- The patient list does NOT include `cancelledBy` or `cancelledAt`
  in the response — these are internal/admin-only fields for v1.
  A future enhancement could include them so patients can see
  "Cancelled by support" vs "Cancelled by you".
- Pagination uses the same pattern as the doctor listing
  (skip/take + total count). No cursor pagination in v1.

---

## R8: Slot Creation — Admin-Only

**Decision**: A Super Admin creates slots via
`POST /api/admin/doctors/:doctorId/slots`. The DTO validates
`startsAt` and `endsAt` (endsAt > startsAt, both in the future,
not more than N months out — say 12).

**Rationale**: Consistent with the existing admin pattern. The
admin is the only party who can create slots because doctors are
not platform users (per feature 003).

**Alternatives considered**:
- Bulk create (one request, multiple slots) — rejected: out of
  scope for v1. The admin can script the loop externally.
- Allow the admin to create past-time slots (e.g. for backfilling
  historical data) — rejected: v1 has no use case for this.

**Key patterns**:
- `@UseGuards(RolesGuard) @Roles('admin')` at the controller
  class level.
- DTO: `startsAt: Date` (ISO 8601, must be > now), `endsAt: Date`
  (ISO 8601, must be > startsAt).
- Service: create the slot, return the record.

**Gotchas**:
- The DTO uses `class-transformer`'s `@Type(() => Date)` to
  convert ISO 8601 strings to `Date` objects. The `@IsDate()`
  validator ensures the conversion happened.
- The "endsAt > startsAt" check is at the DTO layer
  (`@IsAfter('startsAt')`) — NestJS validation pipes return 400
  for violations.
- The "startsAt > now" check is at the service layer (not the
  DTO) because the DTO can't reference `Date.now()`. The service
  throws 400.

---

## R9: Admin Appointment Lifecycle

**Decision**: Admin actions on appointments live in
`src/admin/appointments.controller.ts`:
- `GET /api/admin/appointments` — list all (filterable by
  `?status=`, `?userId=`, `?doctorId=`, paginated)
- `GET /api/admin/appointments/:id` — fetch one
- `PATCH /api/admin/appointments/:id/confirm` — PENDING → CONFIRMED
- `PATCH /api/admin/appointments/:id/cancel` — * → CANCELLED
- `PATCH /api/admin/appointments/:id/complete` — CONFIRMED →
  COMPLETED (must be past `scheduledAt`)

**Rationale**: These are pure admin actions. The patient has their
own confirm-equivalent? No — the patient can only cancel. Confirm
and complete are admin-only because doctors are not platform
users.

**Alternatives considered**:
- Combine confirm + complete into a single status-update endpoint
  (e.g. `PATCH /:id/status` with `{ status: 'CONFIRMED' | 'COMPLETED' }`)
  — rejected: the explicit sub-resource pattern (consistent with
  the admin deactivate sub-resource from feature 003) is
  audit-friendly and prevents accidental status changes.
- Patient can confirm their own booking — rejected: doctors are
  not users; there's no "doctor accepted" event to trigger a
  confirm.

**Key patterns**:
- Each lifecycle endpoint is a separate `@Patch()` method with a
  `@HttpCode(200)` decorator.
- State transitions are validated: confirm rejects
  if already CONFIRMED, CANCELLED, or COMPLETED (409).
  Complete rejects if PENDING (409) or if scheduledAt is in the
  future (400).
- The cancel action follows R4 (atomic slot release).

**Gotchas**:
- The `complete` endpoint's past-time check is at the service
  layer. The DTO doesn't have access to the appointment's
  `scheduledAt` at validation time.
- The admin's "list all" endpoint paginates the same way as the
  patient list (default 20, max 100, skip/take).

---

## R10: Cross-Module Service Sharing — `AppointmentsService`

**Decision**: `AppointmentsService` is exported from
`src/appointments/appointments.module.ts` and imported by
`src/admin/admin.module.ts`. The admin controller uses the SAME
service for slot CRUD, appointment lifecycle, and admin appointment
listing.

**Rationale**: This violates Constitution Principle II ("Domain-
Event Decoupling") at first glance — admin imports a service from
a different module. But the violation is intentional and justified
because:
1. The admin is the only party that performs cross-module writes
   (slot CRUD, appointment lifecycle). Putting the admin endpoints
   in `src/appointments/` would split the admin surface across two
   unrelated modules — violating Principle I.
2. The admin flow is purely a "perform an action on an existing
   entity" pattern (e.g. "create a slot for doctor X", "confirm
   appointment Y"). It does not emit events or call into the
   patient flow. There is no coupling beyond "admin needs the
   same domain methods".
3. The shared service is `AppointmentsService`. The admin module
   imports it via `imports: [AppointmentsModule]`. The admin
   controller injects it. No circular dependency.

**Alternatives considered**:
- Duplicate the service in `src/admin/` — rejected: violates
  DRY and creates two sources of truth for the booking logic. A
  bug fix would have to be applied twice.
- Emit events from the patient flow that the admin flow listens
  to — rejected: there are no patient → admin flows to support
  (the admin does not react to patient actions in v1).
- Move ALL appointment + slot logic to `src/admin/` — rejected:
  the patient-facing surface is the primary user of the booking
  loop; the admin is a secondary consumer. The patient flow
  should own the module.

**Key patterns**:
- `AppointmentsModule` exports `AppointmentsService`.
- `AdminModule` imports `AppointmentsModule` and gets the service
  in the admin controller's constructor.
- No new events are introduced. The admin's actions are direct
  method calls.

**Gotchas**:
- If a future feature introduces a `NotificationsService` that
  listens to appointment events, the admin's lifecycle actions
  should also fire events. This is a future enhancement and is
  out of scope for v1.

---

## R11: DTOs and Validation

**Decision**: New DTOs in `src/appointments/dto/`:

- `CreateSlotDto`: `startsAt: Date`, `endsAt: Date` (validated as
  ISO 8601 + `@IsAfter('startsAt')` + service-layer past-time
  check).
- `UpdateSlotDto`: optional `status: 'AVAILABLE' | 'BLOCKED'`.
  Confirming a slot back from BLOCKED to AVAILABLE is allowed.
- `ListMyAppointmentsDto`: `status` (optional enum), `page` (int
  >= 1, default 1), `pageSize` (int 1-100, default 20).
- `BookAppointmentDto`: `slotId: string` (cuid), `patientNotes?:
  string` (max 2000 chars).

Modifications: none (no existing DTOs need changes).

**Rationale**: The DTOs are the single source of truth for API
contracts. NestJS's `ValidationPipe` (global) automatically rejects
requests with missing/invalid fields, returning 400 with a
descriptive message.

**Alternatives considered**:
- A single `AppointmentIdParam` DTO with `@IsUUID()` (cuid is a
  subset) — rejected: NestJS string validators work fine; an
  explicit `@IsString()` is sufficient.

**Key patterns**:
- `@IsDate()` from class-validator ensures the value is a valid
  Date object.
- `@Type(() => Date)` from class-transformer converts ISO 8601
  strings to Date objects before validation.
- `@MaxLength(2000)` on `patientNotes` matches the existing doctor
  `bio` field cap.

**Gotchas**:
- The `@IsAfter('startsAt')` decorator validates that `endsAt` is
  after `startsAt`. This requires `@ValidateNested` and
  `@Type(() => CreateSlotDto)` to be applied if the DTOs are
  nested. For a flat DTO with `startsAt` and `endsAt` as siblings,
  the decorator works as expected.
- The past-time check (`startsAt > now`) is at the SERVICE layer
  because the DTO can't reference `Date.now()`. The service
  throws 400.

---

## R12: Testing Strategy

**Decision**: Three test layers, mirroring the pattern from
features 003/004/005:

1. **Unit tests** for `AppointmentsService` in
   `src/appointments/appointments.service.spec.ts`:
   - `bookSlot` creates an appointment + sets slot to BOOKED
     (verify $transaction call)
   - `bookSlot` throws 409 if the conditional update returns
     count: 0 (slot already booked)
   - `bookSlot` throws 400 if the slot is in the past
   - `bookSlot` throws 404 if the slot does not exist
   - `bookSlot` throws 400 if the doctor is DEACTIVATED
   - `bookSlot` throws 400 if the doctor's category is DEACTIVATED
   - `bookSlot` throws 403 if the user is deactivated
   - `cancelMyAppointment` throws 404 for a different user's
     appointment (info disclosure)
   - `cancelMyAppointment` throws 403 for an appointment within
     24h
   - `cancelMyAppointment` throws 409 for CANCELLED or COMPLETED
   - `cancelMyAppointment` succeeds for > 24h CONFIRMED,
     atomically releases the slot
   - `listMyAppointments` filters by `userId` and optional
     `status`
   - `listPublicSlots` returns only AVAILABLE slots for ACTIVE
     doctors in ACTIVE categories, sorted ascending
   - `confirmAppointment` (admin) throws 409 for non-PENDING
   - `cancelAppointment` (admin) succeeds for any status (except
     CANCELLED/COMPLETED) and atomically releases the slot
   - `completeAppointment` (admin) throws 400 for future
     `scheduledAt`
   - `completeAppointment` (admin) throws 409 for non-CONFIRMED

2. **Unit tests** for the admin service additions
   (extend `src/admin/admin.service.spec.ts` if the admin
   appointment logic is co-located, OR create a new
   `src/admin/appointments.service.spec.ts` if it's split):
   - admin slot CRUD
   - admin appointment lifecycle

3. **E2E tests** in `test/appointments.e2e-spec.ts`:
   - Public slot listing: returns AVAILABLE slots, sorted,
     excludes DEACTIVATED doctor/category
   - Public slot listing: returns 404 for non-existent doctor
   - Public slot listing: 401 (or no auth required — verify)
   - Patient books a slot: 201, slot becomes BOOKED, appointment
     created in PENDING
   - Patient books already-booked slot: 409
   - Patient books past-time slot: 400
   - Patient books with invalid slotId: 404
   - Patient books while deactivated: 403
   - Patient lists own appointments: 200, scoped to user
   - Patient lists with `?status=CONFIRMED`: filter applied
   - Patient cancels > 24h: 200, slot released
   - Patient cancels < 24h: 403
   - Patient cancels other user's appointment: 404
   - Patient cancels CANCELLED appointment: 409
   - Patient cancels COMPLETED appointment: 409
   - Admin creates slot: 201
   - Admin creates past-time slot: 400
   - Admin creates slot for DEACTIVATED doctor: 400
   - Admin creates slot for DEACTIVATED category: 400
   - Admin blocks a slot: 200, slot is now BLOCKED, patient
     cannot book it
   - Admin deletes AVAILABLE slot: 204
   - Admin deletes BOOKED slot: 409
   - Admin confirms PENDING: 200, status is CONFIRMED
   - Admin confirms CONFIRMED: 409
   - Admin confirms CANCELLED: 409
   - Admin cancels any: 200, slot released
   - Admin completes past-time CONFIRMED: 200, status is
     COMPLETED
   - Admin completes future CONFIRMED: 400
   - Admin completes PENDING: 409
   - Admin lists all appointments: 200, paginated
   - Cross-patient privacy: patient A cannot see patient B's
     appointment via any endpoint
   - Concurrent booking: 10 simultaneous POSTs to the same
     slot, exactly 1 returns 201, 9 return 409

**Rationale**: Mirrors the testing pattern from features 003,
004, and 005. The e2e tests are gated on `DATABASE_URL` like the
other e2e tests.

**Alternatives considered**:
- Skip the e2e tests for the data migration (additive only) —
  accepted: the migration is purely additive, so a manual check
  is sufficient. The e2e tests cover the application behavior,
  not the migration itself.
- Mock Prisma entirely in unit tests — the existing pattern is
  to mock the Prisma client with `jest.fn()` and stub the
  relevant methods. Follow the same pattern. The `$transaction`
  mock is more complex (see R3): pass a mock `tx` object whose
  `updateMany`, `findUniqueOrThrow`, and `create` methods are
  `jest.fn()`s.

**Gotchas**:
- The e2e tests for concurrent booking (10 simultaneous POSTs)
  requires `Promise.all` to fire all 10 requests in parallel.
  The test must NOT await each request individually; the test
  must fire all 10 first, then await all results.
- The `findUniqueOrThrow` in the booking transaction throws if
  the slot is not found AFTER the update. This is a rare race
  (slot is deleted between update and read) — the test doesn't
  need to cover it explicitly but the production code should
  handle the throw gracefully (the transaction rolls back the
  appointment creation? No — the appointment hasn't been created
  yet. The `updateMany` succeeded; the `findUniqueOrThrow` is
  the only query that can fail; if it does, the transaction is
  in an inconsistent state — the slot is BOOKED but no
  appointment exists). A defensive fix: catch the throw and
  revert the slot back to AVAILABLE. This is a low-probability
  edge case; v1 accepts the risk.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Module location | New `src/appointments/` (patient + public) + admin endpoints in `src/admin/appointments.controller.ts` |
| Schema: `DoctorSlot` | New model with status `AVAILABLE`/`BOOKED`/`BLOCKED`, FK to Doctor with `onDelete: Restrict` |
| Schema: `Appointment` | New model with 4-state status, UNIQUE on `slotId`, denormalized `doctorId` + `scheduledAt` |
| Booking concurrency | `prisma.$transaction` with conditional `updateMany WHERE status = 'AVAILABLE'` + count check + appointment create |
| Cancellation | `prisma.$transaction` that atomically updates appointment (CANCELLED + cancelledAt + cancelledBy) and slot (AVAILABLE) |
| Patient 24h cutoff | Service-layer check before the transaction; 403 if within 24h |
| Public slot listing | `/api/doctors/:doctorId/slots` anonymous, sorted, joins doctor for deactivation cascade, `Cache-Control: max-age=60`, rate-limited 60/min |
| Patient list | `GET /api/appointments` scoped to session userId, paginated, `?status=` filter |
| Admin slot CRUD | `POST /api/admin/doctors/:doctorId/slots` + `PATCH /api/admin/slots/:id` + `DELETE /api/admin/slots/:id` + `PATCH /:id/block` |
| Admin appointment lifecycle | `PATCH /api/admin/appointments/:id/{confirm,cancel,complete}` |
| Cross-module sharing | `AppointmentsService` exported from `AppointmentsModule`; `AdminModule` imports it |
| Past-time guards | At service layer (DTO can't reference `Date.now()`) |
| Tests | Unit + e2e mirroring the 003/004/005 pattern; includes concurrent-booking e2e (10 simultaneous requests) |
