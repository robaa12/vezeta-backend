# Implementation Plan: Appointments & Booking

**Branch**: `006-appointments-booking` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-appointments-booking/spec.md`

**Upstream**: 003-remove-doctor-role (introduced standalone
`Doctor`), 004-doctor-search (public doctor surface),
005-doctor-categories (`categoryId` FK, deactivation cascade).

## Summary

Introduce the booking loop: Super Admins create `DoctorSlot`
rows (bookable time windows); patients browse available slots,
book one, list their own bookings, and cancel within a 24-hour
cutoff. Bookings transition through `PENDING → CONFIRMED →
COMPLETED`, or `→ CANCELLED` from `PENDING`/`CONFIRMED`. Two
new domain tables (`doctor_slot`, `appointment`) are added with
an **additive** migration (no existing table is modified). The
core anti-double-booking guarantee is enforced by an atomic
conditional `updateMany` inside a `prisma.$transaction` (per
Constitution Principle IV — Transactional Data Integrity).

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (LTS) — inherited
from features 001–005.

**Primary Dependencies**: NestJS 11, Prisma, Better Auth, class-
validator, class-transformer, `@nestjs/throttler` — all inherited.
**No new third-party dependencies** are required for this feature.

**Storage**: PostgreSQL via Prisma ORM — inherited.
- New table: `doctor_slot` (id, doctorId, startsAt, endsAt,
  status, createdAt, updatedAt).
- New table: `appointment` (id, userId, doctorId, slotId UNIQUE,
  scheduledAt, status, patientNotes, adminNotes, cancelledAt,
  cancelledBy, createdAt, updatedAt).
- `User` and `Doctor` gain back-relations
  (`appointments Appointment[]` and `slots DoctorSlot[]`
  respectively). No other columns are modified.
- One Prisma migration is required; the migration is purely
  additive (no data backfill needed — both tables start empty).

**Testing**: Jest (unit) + Supertest (e2e) — inherited. The
project's e2e tests run against a real PostgreSQL via
`docker-compose.dev.yml`.

**Target Platform**: Linux server (Node.js backend API) —
inherited.

**Project Type**: Web-service (REST API backend) — inherited.

**Performance Goals**:
- `GET /api/doctors/:doctorId/slots` (public): < 200ms p95.
  Indexed query, no joins beyond the doctor/category
  deactivation check.
- `POST /api/appointments` (booking): < 300ms p95. The
  transaction completes in single-digit milliseconds; the rest
  is network and Prisma overhead.
- `GET /api/appointments` (patient list): < 200ms p95. Indexed
  on `[userId, scheduledAt]`.
- `PATCH /api/admin/appointments/:id/{confirm,cancel,complete}`:
  < 200ms p95. Transaction for cancel; single update for the
  others.

**Constraints**:
- Better Auth tables (`User`, `Session`, `Account`,
  `Verification`) MUST NOT be hand-edited (Principle V). The
  migration adds a back-relation on `User` (a Prisma schema-only
  change; no SQL change to the `user` table).
- The booking transaction MUST be atomic. Two patients hitting
  `POST /api/appointments` simultaneously for the same slot must
  result in exactly one 201 and the rest 409 (SC-002).
- The cancellation transaction MUST be atomic. The
  `Appointment.status = 'CANCELLED'` update and the
  `DoctorSlot.status = 'AVAILABLE'` release must succeed or fail
  together.
- The 24-hour patient self-cancel cutoff MUST be enforced at the
  service layer (the DTO cannot reference `Date.now()`).
- Patient endpoints MUST be scoped to the authenticated user;
  cross-patient access returns 404 (information-disclosure
  protection, not 403).
- No in-process caching for appointment endpoints (matches the
  rest of the codebase's "no caching" pattern). The public slot
  listing is the only endpoint with a `Cache-Control` header.
- The migration is **additive** — no changes to existing
  tables' columns, types, or constraints.

**Scale/Scope**:
- 1 new feature module: `src/appointments/` (public slots +
  patient appointments).
- 1 new admin sub-module: `src/admin/appointments.controller.ts`
  (admin slot CRUD + appointment lifecycle).
- 1 new Prisma migration (additive, no data backfill).
- 1 new DTO file group: `src/appointments/dto/`.
- Modifications: `src/admin/admin.module.ts` (import
  `AppointmentsModule`), `src/app.module.ts` (register
  `AppointmentsModule`), `prisma/schema.prisma` (add 2 models
  + 2 back-relations).
- Roughly 1500–2000 LoC of additions (controllers, services,
  DTOs, e2e tests, unit tests).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Module Architecture | PASS | New `src/appointments/` module owns the patient + public surfaces. Admin actions live in `src/admin/appointments.controller.ts` (consistent with the existing admin surface). No cross-module service imports for the patient flow. |
| II. Domain-Event Decoupling | PASS | The booking transaction is the canonical anti-double-booking pattern (Principle IV) and is implemented as a direct method call, not an event. No events are emitted; no notifications are sent. A future feature (Module 6: Notifications) can subscribe to appointment events by introducing a `NotificationsService` that listens — out of scope for v1. The only "shared" code is `AppointmentsService` being exported from `AppointmentsModule` and imported by `AdminModule` — this is a service dependency for admin actions on the same domain entity, not a cross-module side effect. |
| III. Single-Clinic Identity | PASS | A slot is for one doctor. A patient cannot book a single slot for multiple doctors. No multi-doctor modeling introduced. |
| IV. Transactional Data Integrity | PASS | The booking transaction uses a conditional `updateMany WHERE status = 'AVAILABLE'` + count check + appointment create inside `prisma.$transaction`. The cancellation transaction uses a single `prisma.$transaction` that updates the appointment AND releases the slot atomically. This is the canonical "atomic conditional update" pattern. |
| V. Better Auth Schema Sovereignty | PASS | The migration adds a back-relation on `User` (`appointments Appointment[]`) — a Prisma schema annotation that does NOT change the `user` table's SQL. Better Auth's core tables (`User`, `Session`, `Account`, `Verification`) are otherwise untouched. The new `DoctorSlot` and `Appointment` models are domain tables added by hand. |
| VI. Auth & Access Control | PASS | Patient endpoints use Better Auth's session guard (inherited). Admin endpoints use the existing `RolesGuard + @Roles('admin')` pattern. The patient controller does NOT use `RolesGuard` (any authenticated user can book). The 24-hour cutoff is enforced at the service layer, not the guard. Deactivated users are rejected by the `RolesGuard` for admin flows; the booking service additionally checks `user.isActive` and returns 403. |
| VII. Phased Delivery | PASS | This feature completes the booking flow that `plan.md` §13 calls "MVP". No payment, no review, no notification is built — those are Modules 4–6, deliberately deferred. The COMPLETED state exists in the lifecycle so those future features can key off it. |

**Re-evaluation after Phase 1 design**: All gates still pass.
- Principle I: `AppointmentsService` is exported from
  `AppointmentsModule` and imported by `AdminModule` for the
  admin controller's lifecycle + slot CRUD methods. The
  cross-module import is documented in `research.md` R10 with a
  justification (admin needs the same domain methods, no
  duplication).
- Principle II: No events are introduced in v1. The
  cross-module service import is a "admin performs an action
  on a domain entity" pattern, not a side-effect trigger.
- Principle IV: The transaction patterns are documented in
  `data-model.md` and `research.md` R3 + R4.

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/006-appointments-booking/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Schema + concurrency patterns
├── quickstart.md        # Phase 1: Validation guide
├── contracts/           # Phase 1: API contracts
│   ├── patient-appointments-api.md
│   └── admin-appointments-api.md
└── tasks.md             # Phase 2: Task list (NOT created by /speckit-plan)
```

### Source Code (repository root)

This feature adds **one new feature module** (`src/appointments/`)
and **one new admin controller** (`src/admin/appointments.controller.ts`).
The user/prisma schema gains two new models and two back-relations.
No new top-level project; the structure is a single NestJS
backend with feature-module organization (Principle I).

```text
src/
├── appointments/                       # NEW module
│   ├── appointments.module.ts
│   ├── appointments.service.ts         # Patient + admin domain service
│   ├── appointments.service.spec.ts    # Unit tests
│   ├── slots.controller.ts             # Public GET /api/doctors/:id/slots
│   ├── appointments.controller.ts      # Patient POST/GET/PATCH /api/appointments
│   └── dto/
│       ├── create-slot.dto.ts
│       ├── update-slot.dto.ts
│       ├── book-appointment.dto.ts
│       ├── list-my-appointments.dto.ts
│       └── appointment-response.dto.ts
├── admin/                              # MODIFIED
│   ├── admin.module.ts                 # imports AppointmentsModule
│   └── appointments.controller.ts      # NEW: admin slot CRUD + lifecycle
├── app.module.ts                       # MODIFIED: register AppointmentsModule
└── ...

prisma/
├── schema.prisma                       # MODIFIED: add DoctorSlot + Appointment + back-relations
└── migrations/
    └── YYYYMMDDHHMMSS_add_appointments/
        └── migration.sql               # NEW: additive migration

test/
└── appointments.e2e-spec.ts            # NEW: e2e tests for public + patient + admin
```

**Structure Decision**: Option 1 (single project) — this is a
backend-only repository, no separate frontend, no mobile client.
The new `src/appointments/` module follows the established
`categories/` pattern: a public-facing controller, a
patient-facing controller, a single shared service, DTOs in a
`dto/` subfolder, unit tests alongside the service, e2e tests in
`test/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |

All gates pass. The cross-module `AppointmentsService` import
in `AdminModule` is documented in `research.md` R10 as a
justified, intentional choice (admin needs the same domain
methods, no duplication, no events triggered). This does NOT
violate Principle II because the import is a service
dependency for direct admin actions, not a side-effect
trigger.
