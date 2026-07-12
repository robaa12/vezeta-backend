---

description: "Task list for Appointments & Booking (feature 006)"

---

# Tasks: Appointments & Booking (006)

**Input**: Design documents from `/specs/006-appointments-booking/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Constitution §"Code Quality & Delivery" requires every new module to ship with integration tests; the e2e pattern from features 003/004/005 is followed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6, US7, US8)
- Include exact file paths in descriptions

## Path Conventions

This is a single NestJS backend (no frontend). Paths use `src/<feature>/`, `prisma/`, `test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + module skeleton for the new feature.

- [ ] T001 Create and switch to branch `006-appointments-booking` (`git checkout -b 006-appointments-booking`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + additive migration + module skeleton + shared DTOs. **MUST complete before ANY user story** — every story reads or writes the `DoctorSlot` or `Appointment` table.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Add `DoctorSlot` model to `prisma/schema.prisma` — `id` (cuid PK), `doctorId` (String, NOT NULL, FK → `Doctor.id`, `onDelete: Restrict`), `startsAt` (DateTime, NOT NULL), `endsAt` (DateTime, NOT NULL), `status` (String default `"AVAILABLE"`), `createdAt`, `updatedAt`; back-relation `appointment Appointment?`; `@@index([doctorId, startsAt])`, `@@index([status])`, `@@map("doctor_slot")`
- [ ] T003 [P] Add `Appointment` model to `prisma/schema.prisma` — `id` (cuid PK), `userId` (String, NOT NULL, FK → `User.id`, `onDelete: Restrict`), `doctorId` (String, NOT NULL, FK → `Doctor.id`, `onDelete: Restrict`), `slotId` (String, NOT NULL, UNIQUE, FK → `DoctorSlot.id`, `onDelete: Restrict`), `scheduledAt` (DateTime, NOT NULL), `status` (String default `"PENDING"`), `patientNotes` (String?), `adminNotes` (String?), `cancelledAt` (DateTime?), `cancelledBy` (String?), `createdAt`, `updatedAt`; relations to `user`, `doctor`, `slot`; `@@index([userId, scheduledAt])`, `@@index([doctorId, scheduledAt])`, `@@index([status])`, `@@map("appointment")`
- [ ] T004 [P] Add back-relations on existing models: `User` gains `appointments Appointment[]`; `Doctor` gains `slots DoctorSlot[]` and `appointments Appointment[]`. No other changes to existing models.
- [ ] T005 Run `npx prisma migrate dev --create-only --name add_appointments` to scaffold the migration directory at `prisma/migrations/<timestamp>_add_appointments/` (additive — Prisma generates the CREATE TABLE statements for the two new tables + their indexes + the FK constraints; no existing tables are modified)
- [ ] T006 Hand-edit the generated `prisma/migrations/<timestamp>_add_appointments/migration.sql` to (a) wrap the whole migration in a single `BEGIN ... COMMIT` transaction, (b) confirm the CREATE TABLE statements use `IF NOT EXISTS` so the migration is idempotent (defense-in-depth; Prisma's generated SQL does not include this), (c) confirm the FK constraints have `ON DELETE RESTRICT` (per R2/R3)
- [ ] T007 Run `npx prisma migrate dev` to apply the migration locally; verify `prisma db studio` shows the two new tables (`doctor_slot`, `appointment`) and the `user`/`doctor` tables are unchanged
- [ ] T008 Run `npx prisma generate` to regenerate the Prisma client with the new models
- [ ] T009 [P] Create `src/appointments/dto/create-slot.dto.ts` — `startsAt` and `endsAt` (Date, ISO 8601, validated via `@IsDate()` + `@Type(() => Date)` from class-transformer; `endsAt` must be after `startsAt` via `@IsAfter('startsAt')`; `startsAt` future-check at service layer)
- [ ] T010 [P] Create `src/appointments/dto/update-slot.dto.ts` — `status` (optional, `@IsIn(['AVAILABLE', 'BLOCKED'])`); `BOOKED` is NOT settable via this DTO (the booking lifecycle manages that)
- [ ] T011 [P] Create `src/appointments/dto/book-appointment.dto.ts` — `slotId` (String, required, `@IsString() @MinLength(1) @MaxLength(64)`), `patientNotes` (optional, `@IsString() @MaxLength(2000)`)
- [ ] T012 [P] Create `src/appointments/dto/list-my-appointments.dto.ts` — `status` (optional enum), `page` (int >= 1, default 1), `pageSize` (int 1-100, default 20) with class-validator + class-transformer
- [ ] T013 [P] Create `src/appointments/dto/appointment-response.dto.ts` — `@Expose()`-decorated class with the appointment fields visible to patients (omits `adminNotes`; includes `cancelledAt` and `cancelledBy`); add `@ApiProperty` Swagger decorators
- [ ] T014 [P] Create `src/appointments/dto/slot-response.dto.ts` — `{ id, doctorId, startsAt, endsAt, status, createdAt, updatedAt }` shape used by the public + admin slot responses
- [ ] T015 Create `src/appointments/appointments.service.ts` with method signatures (bodies filled in US1/US2/...): `listPublicSlots(doctorId)`, `listAdminSlots(query)`, `getAdminSlot(id)`, `createSlot(doctorId, dto)`, `updateSlot(id, dto)`, `blockSlot(id)`, `deleteSlot(id)`, `bookSlot(userId, dto)` (the conditional updateMany transaction), `listMyAppointments(userId, query)`, `cancelMyAppointment(userId, appointmentId)` (24h cutoff + atomic release), `confirmAppointment(id)`, `cancelAppointment(id, cancelledBy)` (atomic release), `completeAppointment(id)`, `listAdminAppointments(query)`, `getAdminAppointment(id)`. Use `@Injectable()` and inject the global `PrismaService`.
- [ ] T016 Create `src/appointments/appointments.module.ts` — `@Module({ controllers: [SlotsController, AppointmentsController], providers: [AppointmentsService], exports: [AppointmentsService] })` (controllers created in US1/US2/...)
- [ ] T017 Register `AppointmentsModule` in the `imports` array of `src/app.module.ts` (add alongside the existing `CategoriesModule`)
- [ ] T018 Create `src/appointments/appointments.service.spec.ts` skeleton with `describeMaybe` blocks for each method (test bodies added per US)
- [ ] T019 Create skeleton `test/appointments.e2e-spec.ts` with the standard test setup (Supertest app, sign-in helpers for admin + patient, slot fixture helper) — no test cases yet, ready to receive per-story tests

**Checkpoint**: Foundation ready — both new tables exist, the module is registered, the service skeleton is in place. User story implementation can now begin.

---

## Phase 3: User Story 1 - Patient browses available slots (Priority: P1) 🎯 MVP

**Goal**: Anonymous `GET /api/doctors/:doctorId/slots` returns AVAILABLE slots for an ACTIVE doctor in an ACTIVE category, sorted ascending by start time.

**Independent Test**: Hit `GET /api/doctors/<activeDoctorId>/slots` without any auth header; assert 200, `Cache-Control: public, max-age=60`, the response is the slots with `status = 'AVAILABLE'`, sorted ascending. Hit the same URL for a DEACTIVATED doctor or DEACTIVATED category; assert 404.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T020 [P] [US1] Add unit tests in `src/appointments/appointments.service.spec.ts` for `listPublicSlots`: returns only AVAILABLE slots, joins doctor + category (excludes DEACTIVATED doctor or category), sorted ascending by `startsAt`, returns empty array when no slots exist
- [ ] T021 [P] [US1] Add e2e tests in `test/appointments.e2e-spec.ts` for the public slot listing: 200 with no auth header, 404 for non-existent doctor, 404 for DEACTIVATED doctor, 404 for DEACTIVATED category, empty array when no slots, `Cache-Control: public, max-age=60` header, sorted ascending

### Implementation for User Story 1

- [ ] T022 [P] [US1] Create `src/appointments/slots.controller.ts` — `@Controller('api/doctors')`, single `@Get(':doctorId/slots')` method, `@AllowAnonymous()`, `@Throttle({ default: { limit: 60, ttl: 60_000 } })`, `@Header('Cache-Control', 'public, max-age=60')`, `@ApiTags('slots')`, `@ApiOperation`, `@ApiOkResponse`, `@ApiNotFoundResponse`, `@ApiTooManyRequestsResponse`. Delegates to `AppointmentsService.listPublicSlots`
- [ ] T023 [US1] Fill `AppointmentsService.listPublicSlots`: `prisma.doctorSlot.findMany({ where: { doctorId, status: 'AVAILABLE', doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } } }, orderBy: { startsAt: 'asc' } })` — the relation filter enforces the deactivation cascade
- [ ] T024 [US1] Run `npm test -- src/appointments` — confirm new US1 unit tests pass
- [ ] T025 [US1] Run `test/appointments.e2e-spec.ts` against a running dev DB — confirm US1 e2e scenarios pass

**Checkpoint**: US1 fully functional and independently testable. Anonymous users can browse available slots.

---

## Phase 4: User Story 8 - Admin creates and manages doctor slots (Priority: P1)

**Goal**: Super Admin can create, list, get, update, block, and delete slots for any ACTIVE doctor via `/api/admin/slots` and `/api/admin/doctors/:doctorId/slots`.

**Independent Test**: Sign in as Super Admin, `POST /api/admin/doctors/<id>/slots` with future times; assert 201 with `status: 'AVAILABLE'`. Then PATCH the slot to BLOCKED, DELETE it, and assert the lifecycle works.

### Tests for User Story 8 ⚠️

- [ ] T026 [P] [US8] Add unit tests in `src/appointments/appointments.service.spec.ts` for the admin slot CRUD: `createSlot` rejects past-time (400) and `endsAt <= startsAt` (400), `createSlot` rejects non-existent doctor (404) and DEACTIVATED doctor or category (400); `updateSlot` rejects setting `status = 'BOOKED'` (400); `deleteSlot` rejects BOOKED/BLOCKED slots (409); `blockSlot` is idempotent
- [ ] T027 [P] [US8] Add e2e tests in `test/appointments.e2e-spec.ts` for the admin slot CRUD: 201 for valid input, 400 for past-time, 400 for `endsAt <= startsAt`, 404 for non-existent doctor, 400 for DEACTIVATED doctor/category, 200 for list, 200 for get-one, 404 for missing, 200 for patch-status, 200 for block (idempotent), 204 for delete AVAILABLE, 409 for delete BOOKED, 403 for non-admin, 401 for unauthenticated

### Implementation for User Story 8

- [ ] T028 [US8] Create `src/admin/appointments.controller.ts` — `@Controller('api/admin')`, `@UseGuards(RolesGuard)` + `@Roles('admin')` at class level. Mount the slot endpoints: `POST doctors/:doctorId/slots`, `GET slots`, `GET slots/:id`, `PATCH slots/:id`, `PATCH slots/:id/block`, `DELETE slots/:id`. All methods delegate to `AppointmentsService`. Full Swagger blocks
- [ ] T029 [US8] Update `src/admin/admin.module.ts` — add `AppointmentsModule` to the `imports` array so the admin controller can inject `AppointmentsService`
- [ ] T030 [US8] Fill `AppointmentsService` admin slot methods: `createSlot` (validates doctor exists + is ACTIVE, validates category is ACTIVE, validates `startsAt > now`, persists with `status: 'AVAILABLE'`); `updateSlot` (validates the slot exists, rejects `status = 'BOOKED'`, updates the row); `blockSlot` (idempotent, sets `status: 'BLOCKED'` if not already); `deleteSlot` (only `AVAILABLE` slots can be deleted, others 409)
- [ ] T031 [US8] Run `npm test -- src/appointments` and the e2e tests for US8

**Checkpoint**: US8 fully functional. Admin can populate a doctor's schedule.

---

## Phase 5: User Story 2 - Patient books a slot (Priority: P1)

**Goal**: `POST /api/appointments` atomically flips the slot to BOOKED, creates an appointment in PENDING, and returns it with the nested doctor. Concurrent bookings are safe.

**Independent Test**: Sign in as a patient, POST a valid `slotId`; assert 201 with `status: 'PENDING'` and the slot is now BOOKED. Re-POST the same slot; assert 409. Fire 10 simultaneous POSTs; assert exactly 1 × 201 + 9 × 409.

### Tests for User Story 2 ⚠️

- [ ] T032 [P] [US2] Add unit tests in `src/appointments/appointments.service.spec.ts` for `bookSlot`: happy path (creates appointment + sets slot to BOOKED, all inside a transaction), throws 409 when conditional `updateMany` returns count 0 (slot already booked), throws 400 when slot is in the past, throws 404 when slot does not exist, throws 400 when doctor is DEACTIVATED, throws 400 when doctor's category is DEACTIVATED, throws 403 when user is deactivated. Mock `prisma.$transaction` to invoke the callback with a mock `tx` whose `updateMany`, `findUniqueOrThrow`, and `create` are `jest.fn()`s
- [ ] T033 [P] [US2] Add e2e tests in `test/appointments.e2e-spec.ts` for the booking flow: 201 for valid input (slot becomes BOOKED), 409 for already-booked slot, 400 for past-time slot, 404 for invalid `slotId`, 400 for DEACTIVATED doctor/category, 401 for unauthenticated, 403 for deactivated user, **concurrent booking (10 simultaneous) — exactly 1 returns 201 and 9 return 409**

### Implementation for User Story 2

- [ ] T035 [US2] Fill `AppointmentsService.bookSlot`: `prisma.$transaction(async (tx) => { ... })` with the canonical anti-double-booking pattern from `research.md` R3: (1) `tx.doctorSlot.updateMany({ where: { id, status: 'AVAILABLE' }, data: { status: 'BOOKED' } })` — if `count === 0` throw `ConflictException` (409); (2) `tx.doctorSlot.findUniqueOrThrow({ where: { id }, select: { doctorId, startsAt } })`; (3) `tx.appointment.create({ data: { userId, doctorId, slotId, scheduledAt, status: 'PENDING', patientNotes }, include: { doctor: { include: { category: { select: { id, name } } } } } })`. Also validate `user.isActive` (403 if not)
- [ ] T036 [P] [US2] Create `src/appointments/appointments.controller.ts` — `@Controller('api/appointments')`, single `@Post()` method. The class is auth-protected by the global BetterAuth session guard (no `@AllowAnonymous()`); patients are not gated by role (any authenticated active user can book). Delegates to `AppointmentsService.bookSlot`. Full Swagger blocks
- [ ] T037 [US2] Run `npm test -- src/appointments` and the e2e tests for US2 (including the concurrent-booking scenario)

**Checkpoint**: US2 fully functional. Concurrent booking is provably safe (exactly one wins under contention).

---

## Phase 6: User Story 4 - Patient lists their own appointments (Priority: P1)

**Goal**: `GET /api/appointments` returns the requesting patient's own appointments, paginated, with optional `?status=` filter. Cross-patient access is impossible.

**Independent Test**: Sign in as patient A, book 2 slots; sign in as patient B, book 1 slot. Patient A's `GET /api/appointments` returns exactly their 2; patient B's returns exactly their 1.

### Tests for User Story 4 ⚠️

- [ ] T038 [P] [US4] Add unit tests in `src/appointments/appointments.service.spec.ts` for `listMyAppointments`: filters by `userId` (the WHERE clause must include the authenticated user's id), optional `status` filter, paginated, includes the nested `doctor.category`
- [ ] T039 [P] [US4] Add e2e tests in `test/appointments.e2e-spec.ts` for the patient list: 200 scoped to the authenticated user, `?status=CONFIRMED` filter applied, pagination, 401 for unauthenticated, cross-patient privacy (patient B cannot see patient A's appointments in any list query)

### Implementation for User Story 4

- [ ] T040 [US4] Fill `AppointmentsService.listMyAppointments`: `prisma.appointment.findMany({ where: { userId, ...(query.status && { status: query.status }) }, orderBy: { scheduledAt: 'asc' }, skip, take, include: { doctor: { include: { category: { select: { id, name } } } } } })` + `prisma.appointment.count({ where: { userId, ... } })`. The `userId` is sourced from the session, NEVER from the request body or query
- [ ] T041 [US4] Add `GET /api/appointments` to `src/appointments/appointments.controller.ts` — delegates to `AppointmentsService.listMyAppointments`. `@Query() query: ListMyAppointmentsDto`. Full Swagger blocks
- [ ] T042 [US4] Run `npm test -- src/appointments` and the e2e tests for US4

**Checkpoint**: US4 fully functional. Patients can see their own appointments and nothing else.

---

## Phase 7: User Story 3 - Admin confirms a pending appointment (Priority: P1)

**Goal**: `PATCH /api/admin/appointments/:id/confirm` transitions PENDING → CONFIRMED. Idempotency via 409 (not silent no-op).

**Independent Test**: Create a PENDING appointment, admin confirms; assert 200 with `status: 'CONFIRMED'`. Re-confirm; assert 409. Try to confirm a CANCELLED appointment; assert 409.

### Tests for User Story 3 ⚠️

- [ ] T043 [P] [US3] Add unit tests in `src/appointments/appointments.service.spec.ts` for `confirmAppointment`: 200 for PENDING, 404 for non-existent, 409 for CONFIRMED/CANCELLED/COMPLETED
- [ ] T044 [P] [US3] Add e2e tests in `test/appointments.e2e-spec.ts` for admin confirm: 200 for PENDING, 409 for second confirm, 409 for CANCELLED, 404 for missing, 403 for non-admin, 401 for unauthenticated

### Implementation for User Story 3

- [ ] T045 [US3] Fill `AppointmentsService.confirmAppointment`: validate appointment exists (404 if not); validate `status === 'PENDING'` (409 otherwise); update to `CONFIRMED`
- [ ] T046 [US3] Add `PATCH /api/admin/appointments/:id/confirm` to `src/admin/appointments.controller.ts` — delegates to `AppointmentsService.confirmAppointment`. Full Swagger blocks
- [ ] T047 [US3] Run `npm test -- src/appointments` and the e2e tests for US3

**Checkpoint**: US3 fully functional. Admin can confirm pending bookings.

---

## Phase 8: User Story 5 - Patient cancels with 24-hour cutoff (Priority: P2)

**Goal**: `PATCH /api/appointments/:id/cancel` cancels the requesting patient's own appointment, but only if scheduled more than 24h from now. Within 24h: 403. Cross-patient: 404.

**Independent Test**: Book a slot for 48h from now, cancel; assert 200, `status: 'CANCELLED'`, slot is back to AVAILABLE. Book another for 1h from now, cancel; assert 403. Try to cancel another patient's appointment; assert 404.

### Tests for User Story 5 ⚠️

- [ ] T048 [P] [US5] Add unit tests in `src/appointments/appointments.service.spec.ts` for `cancelMyAppointment`: 200 for > 24h CONFIRMED (verifies the slot is released), 403 for < 24h, 404 for non-existent OR another user's appointment (info disclosure), 409 for CANCELLED, 409 for COMPLETED
- [ ] T049 [P] [US5] Add e2e tests in `test/appointments.e2e-spec.ts` for patient self-cancel: 200 + slot released for > 24h, 403 for < 24h, 404 for another patient's appointment, 409 for CANCELLED, 409 for COMPLETED, 401 for unauthenticated

### Implementation for User Story 5

- [ ] T050 [US5] Fill `AppointmentsService.cancelMyAppointment`: (1) `prisma.appointment.findUnique({ where: { id } })` — if null OR `userId !== userId` throw `NotFoundException` (404, info disclosure); (2) if `status === 'CANCELLED' || status === 'COMPLETED'` throw `ConflictException` (409); (3) if `(scheduledAt - now) < 24h` throw `ForbiddenException` (403); (4) `prisma.$transaction(async (tx) => { ... })` per `research.md` R4: update appointment to `CANCELLED` + `cancelledAt = new Date()` + `cancelledBy = 'USER'`; update slot to `AVAILABLE`
- [ ] T051 [US5] Add `PATCH /:id/cancel` to `src/appointments/appointments.controller.ts` — delegates to `AppointmentsService.cancelMyAppointment`. Full Swagger blocks
- [ ] T052 [US5] Run `npm test -- src/appointments` and the e2e tests for US5

**Checkpoint**: US5 fully functional. Patients can release their own slots (with the 24h cutoff).

---

## Phase 9: User Story 6 - Admin cancels any appointment (Priority: P2)

**Goal**: `PATCH /api/admin/appointments/:id/cancel` cancels any appointment, regardless of timing. The slot is released atomically.

**Independent Test**: Patient books a slot 1h from now, admin cancels; assert 200 (no 24h cutoff for admin), slot is released.

### Tests for User Story 6 ⚠️

- [ ] T053 [P] [US6] Add unit tests in `src/appointments/appointments.service.spec.ts` for `cancelAppointment` (admin): 200 for any non-terminal status (PENDING, CONFIRMED, including < 24h), 404 for non-existent, 409 for CANCELLED, 409 for COMPLETED, slot is released atomically
- [ ] T054 [P] [US6] Add e2e tests in `test/appointments.e2e-spec.ts` for admin cancel: 200 for PENDING, 200 for CONFIRMED, 200 for < 24h (no cutoff), 409 for CANCELLED, 409 for COMPLETED, 404 for missing, 403 for non-admin, 401 for unauthenticated

### Implementation for User Story 6

- [ ] T055 [US6] Fill `AppointmentsService.cancelAppointment` (admin variant): `prisma.$transaction(async (tx) => { ... })` per `research.md` R4. No 24h cutoff. Set `cancelledBy = 'ADMIN'`. Throws 404 for missing, 409 for terminal states
- [ ] T056 [US6] Add `PATCH /api/admin/appointments/:id/cancel` to `src/admin/appointments.controller.ts` — delegates to `AppointmentsService.cancelAppointment`. Full Swagger blocks
- [ ] T057 [US6] Run `npm test -- src/appointments` and the e2e tests for US6

**Checkpoint**: US6 fully functional. Admins can cancel any appointment at any time.

---

## Phase 10: User Story 7 - Admin marks a confirmed appointment as completed (Priority: P2)

**Goal**: `PATCH /api/admin/appointments/:id/complete` transitions CONFIRMED → COMPLETED, but only if `scheduledAt` is in the past. This is the terminal "did happen" state.

**Independent Test**: Manually create a CONFIRMED appointment in the past (via direct DB); admin completes; assert 200. Try to complete a PENDING appointment; assert 409. Try to complete a future CONFIRMED; assert 400.

### Tests for User Story 7 ⚠️

- [ ] T058 [P] [US7] Add unit tests in `src/appointments/appointments.service.spec.ts` for `completeAppointment`: 200 for past-time CONFIRMED, 400 for future CONFIRMED, 409 for PENDING, 409 for CANCELLED, 409 for already-COMPLETED, 404 for missing
- [ ] T059 [P] [US7] Add e2e tests in `test/appointments.e2e-spec.ts` for admin complete: 200 for past-time CONFIRMED, 400 for future CONFIRMED, 409 for PENDING, 409 for already-COMPLETED, 404 for missing, 403 for non-admin, 401 for unauthenticated

### Implementation for User Story 7

- [ ] T060 [US7] Fill `AppointmentsService.completeAppointment`: validate appointment exists (404 if not); validate `status === 'CONFIRMED'` (409 otherwise); validate `scheduledAt <= now` (400 otherwise); update to `COMPLETED`
- [ ] T061 [US7] Add `PATCH /api/admin/appointments/:id/complete` to `src/admin/appointments.controller.ts` — delegates to `AppointmentsService.completeAppointment`. Full Swagger blocks
- [ ] T062 [US7] Run `npm test -- src/appointments` and the e2e tests for US7

**Checkpoint**: US7 fully functional. The appointment lifecycle is complete: PENDING → CONFIRMED → COMPLETED, or → CANCELLED.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Admin appointment list/get, README updates, end-to-end validation, legacy sweep.

- [ ] T063 [P] [US3] Add `GET /api/admin/appointments` and `GET /api/admin/appointments/:id` to `src/admin/appointments.controller.ts` (admin list with filters + admin get-one) — both delegate to `AppointmentsService.listAdminAppointments` and `getAdminAppointment`. Fill those service methods. Add e2e tests
- [ ] T064 [P] Update `src/admin/dto/list-doctors.dto.ts` to remove any reference to the legacy `?specialty=` filter that no longer exists (no-op if already clean from 005). Sweep `rg -n "specialty" src/ test/ prisma/schema.prisma` and confirm only historical comments remain
- [ ] T065 [P] Update `README.md`: add the new endpoints to the Public Doctor Endpoints (slot listing), Patient Endpoints (book + list + cancel), and Admin Endpoints (slot CRUD + appointment lifecycle + admin list) tables. Add a short note on the booking transaction's atomicity and the 24h patient self-cancel cutoff
- [ ] T066 Verify Swagger UI (`/api/docs`) renders all new endpoints correctly with the correct schemas
- [ ] T067 Run `npm test` — all unit + e2e suites pass (including the existing 005 + 004 + 003 + admin + auth + social suites)
- [ ] T068 Run `npm run lint` — no new errors introduced
- [ ] T069 Run `npm run build` — TypeScript build succeeds
- [ ] T070 Run the manual quickstart validation scenarios in `specs/006-appointments-booking/quickstart.md` against a running dev stack — confirm every scenario passes end-to-end
- [ ] T071 Commit and push branch `006-appointments-booking` for review (do NOT merge to `main` until user confirms)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phase 3–10)**: All depend on Foundational completion
  - US1 (P1) is the first to land (it's the public read path)
  - US8 (P1) must come before US2 (admin creates slots before patient books)
  - US2 (P1) before US3/US5 (need an appointment to confirm or cancel)
  - US3 (P1) before US7 (need CONFIRMED to complete)
  - US5 (P2) and US6 (P2) are independent of each other
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — independent of other stories
- **US8 (P1)**: Depends on Foundational — independent of US1 (the public read does not require the admin to have created any slots)
- **US2 (P1)**: Depends on US1 + US8 (needs a slot in the DB; the public listing exists for patients to discover it)
- **US3 (P1)**: Depends on US2 (needs a PENDING appointment to confirm)
- **US4 (P1)**: Depends on US2 (needs appointments in the DB to list)
- **US5 (P2)**: Depends on US2 (needs an appointment to cancel)
- **US6 (P2)**: Depends on US2 (same)
- **US7 (P2)**: Depends on US3 (needs a CONFIRMED appointment to complete)

Recommended sequential order for a solo implementation: **US1 → US8 → US2 → US4 → US3 → US5 → US6 → US7 → Polish**.

### Within Each User Story

- Tests (Txxx) are written and FAIL before implementation
- DTOs and service signatures before controllers
- Service bodies before controller wiring
- Story complete (e2e green) before moving to the next priority

### Parallel Opportunities

- All [P] tasks in Phase 2 can run in parallel once T001 is done (different files, no inter-dependencies between DTOs and schema annotations)
- After US1 lands, US8 can run in parallel with US2 (different controllers, different service methods, different test files)
- US3, US4, US5, US6, US7 can run in various parallel combinations after US2 lands
- All e2e additions to `test/appointments.e2e-spec.ts` from US1, US8, US2, US3, US4, US5, US6, US7 are sequential (same file) but each test is a separate `it()` block

---

## Parallel Example: User Story 2

```bash
# After US1 and US8 are complete:

# 1. Write the unit tests first (T032) and confirm they FAIL:
Task: "Add unit tests in src/appointments/appointments.service.spec.ts for bookSlot"

# 2. In parallel: write the e2e tests (T033) and the controller (T036):
Task: "Add e2e tests in test/appointments.e2e-spec.ts for the booking flow (incl. concurrent)"
Task: "Create src/appointments/appointments.controller.ts with POST /api/appointments"

# 3. Then fill the service body (T035 — depends on the unit-test mocks being in place):
Task: "Fill AppointmentsService.bookSlot with the conditional updateMany transaction"

# 4. Run validation:
Task: "Run npm test -- src/appointments"
Task: "Run test/appointments.e2e-spec.ts against dev DB (including the 10-concurrent scenario)"
```

---

## Implementation Strategy

### MVP First (US1 + US8 + US2)

The minimum viable end-to-end demo is **US1 (patient browses slots) + US8 (admin creates slots) + US2 (patient books a slot)**. An admin creates a slot, a patient discovers it via the public listing, and the patient books it — the core booking loop works end-to-end.

Order:
1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T019)
3. Phase 3: US1 (T020–T025)
4. Phase 4: US8 (T026–T031)
5. Phase 5: US2 (T032–T037) — includes the 10-concurrent-booking scenario
6. **STOP and VALIDATE** — admin creates slot, patient discovers + books, exactly 1 of 10 concurrent requests wins

### Incremental Delivery (Recommended)

1. Setup + Foundational → migration live, module registered, skeleton ready
2. US1 → public slot listing works
3. US8 → admin can create slots
4. US2 → patient can book a slot (concurrent-safe)
5. US4 → patient can list their bookings
6. US3 → admin can confirm pending bookings
7. US5 → patient can self-cancel (> 24h cutoff)
8. US6 → admin can cancel any
9. US7 → admin can mark completed
10. Polish → admin list/get, legacy sweep, docs, lint, build, quickstart validation

### Parallel Team Strategy

For a single maintainer, follow the incremental order above. For two or more:
- After Foundational: one developer on US1, one on US8
- After US1 + US8: one on US2, one on US4 (both depend on US2, but US4 is read-only)
- After US2: one on US3 (admin lifecycle), one on US5 (patient cancel) in parallel
- US6 + US7 follow

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Write tests first, confirm they FAIL, then implement
- Commit after each task or logical group (e.g. after a complete story is green)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
- The 10-concurrent-booking e2e scenario is the primary proof of Principle IV compliance; do not skip it
- The migration is purely additive — verify with `prisma db studio` that no existing table's columns are modified
