# Research: Simplify Auth Model (Remove Doctor Role)

**Feature**: 003-remove-doctor-role
**Date**: 2026-07-11
**Upstream**: 001-better-auth-system, 002-social-oauth-login

## R1: Role Enum Reduction

**Decision**: Reduce the `User.role` column from a free-form string
(currently `patient | doctor | admin`) to an enum with two values:
`user` and `admin`. The literal strings `patient` and `doctor` are
deprecated and MUST NOT be insertable.

**Rationale**: The user wants doctors removed as a role entirely. The
`patient` concept is collapsed into `user` (per the spec assumption) — every
non-admin user is now simply a `user`. The existing `User.role` column is a
free-form `String` (per `prisma/schema.prisma`), so the cleanup is enforced
in the application layer (Better Auth's `additionalFields` defaults + the
`databaseHooks.user.create.before` callback already in place from feature
001) rather than via a Postgres ENUM type.

**Alternatives considered**:
- Postgres ENUM type with `ALTER TYPE` migration — rejected: requires a
  schema migration (out of scope per the spec assumption that migration of
  existing data is separate), and PostgreSQL ENUM changes are
  notoriously painful (cannot drop a value cleanly).
- Two-column role design (`is_admin BOOLEAN`, `is_user BOOLEAN`) —
  rejected: less expressive and doesn't scale if a third role is ever
  needed.

**Key patterns**:
- `auth.ts` `user.additionalFields.role.defaultValue` changes from
  `"patient"` to `"user"`.
- `auth.ts` `databaseHooks.user.create.before` callback (already exists
  in feature 001) is updated to coerce any non-`user`/non-`admin` value
  to `user`, and to **reject** any attempt to set `role = "doctor"` (the
  feature 001 version coerced `doctor` to `patient`; the new version
  rejects `doctor` outright and also rejects `patient`).
- `SessionUser.role` type changes from `'patient' | 'doctor' | 'admin'`
  to `'user' | 'admin'`.
- All references to `role === 'doctor'` in guards / controllers are
  deleted (the existing `DoctorApprovedGuard` and `doctors/test-route`
  from feature 001 are removed — no doctor-only routes exist anymore).

**Gotchas**:
- Anywhere the codebase, tests, or seed script writes `role: 'patient'`
  or `role: 'doctor'` directly MUST be updated. The seed script
  (`src/seed/seed.ts`) uses the admin role; the credential signup test in
  `test/auth.e2e-spec.ts` writes `role: 'patient'`.
- Feature 002's social signup spec mentions "PATIENT" — this is a
  documentation label only (the spec said social signup defaults to
  `PATIENT`); the actual code never references a PATIENT literal because
  the role is set via the `additionalFields.role.defaultValue` from
  feature 001.

---

## R2: Dropping the DoctorProfile Table

**Decision**: Remove the `DoctorProfile` model from `prisma/schema.prisma`
and the corresponding Prisma client property (`prisma.doctorProfile`).
Drop the foreign key constraint on `User.doctorProfile` and the inverse
relation on `User.approvedDoctors`.

**Rationale**: The user explicitly said "doctors are just CRUD records"
and "Doctor isn't a role in the application". The current `DoctorProfile`
table is tied to a `User` row (1:1) and to the `User.role = "doctor"`
concept — both of which are being removed. A standalone `Doctor` table
(no FK to `User`) is the new shape.

**Alternatives considered**:
- Keep `DoctorProfile` as a 1:1 to `User` but populate it only for users
  with a special flag — rejected: reintroduces the role-coupling that the
  user wants gone.
- Soft-migrate `DoctorProfile` rows into the new `Doctor` table —
  rejected: data migration is explicitly out of scope per the spec.

**Key patterns**:
- A new `Doctor` Prisma model with no relation to `User`:
  ```prisma
  model Doctor {
    id        String   @id @default(cuid())
    name      String
    specialty String
    bio       String?
    imageUrl  String?
    status    String   @default("ACTIVE")  // ACTIVE | DEACTIVATED
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@index([status])
    @@index([specialty])
    @@map("doctor")
  }
  ```
- The `databaseHooks.user.update.after` callback in `auth.ts` that
  auto-creates a `DoctorProfile` on doctor verification is **removed**
  (no more doctor verification, no more doctor auto-profiles).
- The `DoctorApprovedGuard` and its associated test route
  (`/api/doctors/test-route`) are **removed** — no doctor-only routes
  exist.

**Gotchas**:
- Removing `DoctorProfile` from Prisma's schema invalidates the existing
  migration history. A new migration `drop_doctor_profile` is needed
  (the data-model.md marks this as a required migration in the
  implementation phase). For environments with existing data, a separate
  data-migration feature is required before this ships — flagged in the
  spec assumptions.
- The `User.approvedDoctors` reverse relation in Prisma is removed.

---

## R3: Admin Doctor CRUD Endpoints

**Decision**: Replace the existing admin doctor-profile endpoints
(approve / reject / suspend — which operate on the `DoctorProfile` join
table) with a full CRUD interface on the new `Doctor` entity:

| Method | Path                            | Purpose                              |
|--------|---------------------------------|--------------------------------------|
| GET    | `/api/admin/doctors`            | List doctors (filter + paginate)     |
| POST   | `/api/admin/doctors`            | Create a new doctor                  |
| GET    | `/api/admin/doctors/:id`        | Get one doctor                       |
| PATCH  | `/api/admin/doctors/:id`        | Update doctor fields                 |
| PATCH  | `/api/admin/doctors/:id/deactivate` | Soft-deactivate (history preserved) |
| DELETE | `/api/admin/doctors/:id`        | Hard-delete (rejected if has bookings) |

Plus the existing user-management endpoints are extended:

| Method | Path                                  | Purpose                                |
|--------|---------------------------------------|----------------------------------------|
| PATCH  | `/api/admin/users/:id/role`           | Promote/demote a user; last-admin guard |
| GET    | `/api/admin/users/:id`                | Get a user (extended)                  |

**Rationale**: The spec calls for admins to "add doctors manually" and to
manage the doctor catalog. A standard REST CRUD interface is the most
consistent and discoverable shape. The `:id/deactivate` action is
separated from the generic PATCH because deactivation has business rules
(cache-bust, etc.) that are not appropriate for a generic PATCH handler.

**Alternatives considered**:
- A single `POST /api/admin/doctors` with a status field — rejected:
  deactivation is a meaningful state change with cache implications;
  separate verb is clearer.
- RPC-style endpoints (`/api/admin/deactivateDoctor?id=...`) — rejected:
  the codebase uses REST conventions throughout.

**Key patterns**:
- `src/admin/admin.controller.ts`: replace doctor-profile endpoints
  with the CRUD endpoints above.
- `src/admin/admin.service.ts`: replace `listDoctors`, `setDoctorStatus`
  with `listDoctors`, `createDoctor`, `getDoctor`, `updateDoctor`,
  `deactivateDoctor`, `deleteDoctor` (all operating on the new `Doctor`
  table). The `deactivateUser` method is preserved.
- `src/admin/dto/`: add `create-doctor.dto.ts`, `update-doctor.dto.ts`;
  the existing `list-doctors.dto.ts` is updated for the new filter
  shape (status: ACTIVE | DEACTIVATED, plus specialty and pagination).
- `src/admin/dto/role-change.dto.ts`: new DTO for the role-change
  endpoint.

**Gotchas**:
- Hard-delete vs soft-delete: the spec requires rejection of hard-delete
  when historical bookings exist. Until a future "appointments" feature
  lands (with an `Appointment` table that references `Doctor.id`), no
  doctor can have historical bookings, so hard-delete is unconditionally
  allowed. The controller MUST be structured to allow this guard to be
  added later without breaking the API.
- The `User.role` change is audited implicitly by Better Auth's
  `databaseHooks.user.update` — but no explicit audit log is created in
  this feature. The `approvedById`-style audit trail that existed for
  doctor profile approvals does not carry over to role changes.

---

## R4: Role-Change Endpoint + Last-Admin Guard

**Decision**: Add `PATCH /api/admin/users/:id/role` with body
`{ role: "user" | "admin" }`. Enforce a last-admin guard: if the change
would leave the system with zero active admins, the request is rejected
with 409.

**Rationale**: The spec requires admins to promote/demote each other
("An existing Super Admin can promote an existing user to `role = admin`
or demote an admin back to `role = user`") and to prevent demoting the
last admin.

**Key patterns**:
- Service method `changeUserRole(userId, newRole, adminId)`:
  1. Verify the target user exists and is currently active.
  2. If newRole is "user" and the target is currently an active admin:
     count active admins excluding the target. If count is 0, throw 409.
  3. Update `User.role` to newRole.
- "Active admin" = `User.role = "admin"` AND `User.isActive = true`.
- The 409 response carries a `reason: "last_admin"` body.

**Alternatives considered**:
- Enforce the last-admin rule via a Postgres trigger — rejected: less
  visible in the API, harder to test.
- Count admins lazily on every request — fine for v1; if the user table
  grows large, a cached counter or trigger is a future optimization.

**Gotchas**:
- The same admin demoting themselves is the most common last-admin case.
  The check MUST exclude the target user from the "remaining admins"
  count, not just count all admins.
- Deactivated admins do NOT count as "active admins" for the last-admin
  guard (a deactivated admin should not block the demotion of the last
  active one).
- Promotion (`role: "user"` → `role: "admin"`) is always allowed
  (it can never cause a last-admin scenario).

---

## R5: Frontend Terminology Update

**Decision**: The backend API response fields retain their current
semantics (the `User` row has a `role` column that returns one of
`"user" | "admin"`). The frontend (out of scope for this backend
feature) is expected to update its terminology from "patient" to
"user" wherever it surfaces a user-facing label.

**Rationale**: The backend is a pure data-and-API layer. The display
string "patient" vs "user" is a frontend concern. The backend should not
introduce i18n keys or display strings; it returns the raw role value.

**Alternatives considered**:
- A `displayRole` computed field on the API — rejected: duplicates the
  role value and creates a maintenance burden when the display
  vocabulary changes.
- Keeping `role = "patient"` server-side and aliasing to "user" only
  on the frontend — rejected: contradicts the spec's explicit removal
  of the `patient` value from the role enum.

**Key patterns**:
- The spec's assumption section documents this as a frontend-owned
  change.
- The API contract (`contracts/admin-doctors-api.md`) returns
  `role: "user" | "admin"` in all responses. The previous "patient"
  value is gone.

---

## R6: Social Login Compatibility

**Decision**: Social signup (feature 002) continues to work without
modification to its Better Auth config blocks. The new accounts it
creates will have `role = "user"` because that is the
`additionalFields.role.defaultValue` set in `auth.ts` (changed from
`"patient"` in this feature). The social providers, accountLinking
config, link/unlink endpoints, and `/me` extension are unchanged.

**Rationale**: The 002 feature is configuration-driven; the role
assignment is delegated to Better Auth's `additionalFields` defaults.
The only change to 002 is the spec text (the spec said "role PATIENT by
default" — that becomes "role USER by default"). No code changes are
required in 002's `auth.ts` socialProviders blocks or the link/unlink
controller endpoints.

**Alternatives considered**:
- Adding a post-signup hook in feature 002 to rename the role — rejected:
  the role is already correctly assigned by the `additionalFields`
  default. A hook would be a no-op.

**Gotchas**:
- The feature 002 spec, contracts, and quickstart contain
  "PATIENT" wording that is now stale. A follow-up documentation
  sync is needed but is NOT a code change for this feature. Flagged
  in the implementation plan's Phase 8 polish.

---

## R7: Migration of Existing Data

**Decision**: **Out of scope for this feature** per the spec. If a
deployment has existing rows with `role = "patient"` or
`role = "doctor"`, or existing `DoctorProfile` rows, a separate
migration feature must be created and run BEFORE this feature ships.
The implementation here assumes a fresh database (or one that has
already been migrated by an out-of-band script).

**Rationale**: Data migration is a deployment concern that depends on
the existing state of the target environment, which is not knowable
from the spec alone. Splitting the change into "schema change" (this
feature) and "data migration" (separate feature) keeps each diff
reviewable and reversible.

**Alternatives considered**:
- Bundled migration as part of this feature — rejected: hard to test
  in isolation, depends on data shape, increases risk of
  breaking the development environment.
- Auto-migration script embedded in the bootstrap — rejected: not
  idempotent, runs on every boot.

**Key patterns**:
- The Prisma migration `drop_doctor_profile` drops the table and the
  FK from `User`.
- A separate one-time `data-migration.sql` (created by the operator,
  not part of this feature's code) handles the `role` string updates:
  `UPDATE "user" SET role = 'user' WHERE role IN ('patient', 'doctor')`.
- Documentation in `README.md` (updated in this feature) flags the
  migration as a prerequisite for production deployment.

---

## R8: Seed Script Updates

**Decision**: The existing `src/seed/seed.ts` (which creates the
Super Admin) continues to work — it already uses `role: "admin"`
semantics. No change is required. The default `additionalFields.role`
change from `"patient"` to `"user"` does not affect the seed because
the seed explicitly sets `role: "admin"`.

**Rationale**: The seed script is small and explicit. It does not
touch any doctor-related tables (the original implementation only
created the Super Admin user account).

**Gotchas**:
- If the seed script later adds doctor seeding (e.g. creates a default
  doctor record for the demo environment), that addition is out of
  scope here.

---

## R9: Testing Strategy

**Decision**:
- **Unit tests** for the new `AdminService` methods: `createDoctor`,
  `updateDoctor`, `deactivateDoctor`, `deleteDoctor`, `changeUserRole`.
- **Unit test for last-admin guard**: explicit test that demoting the
  last active admin returns 409 and does not mutate the database.
- **Unit test for role coercion**: the `databaseHooks.user.create.before`
  callback rejects `role = "doctor"`, `role = "patient"`, and any other
  non-`user`/non-`admin` value.
- **E2E test** extending `test/admin.e2e-spec.ts` (or a new
  `test/admin-doctors.e2e-spec.ts`) covering the full CRUD lifecycle:
  create → list → get → update → deactivate → delete.

**Rationale**: The last-admin guard and the role coercion are the
two rules that, if regressed, would re-introduce the complexity the
user wants gone. Both deserve dedicated unit tests with high coverage.

**Alternatives considered**:
- Skipping the role coercion test — rejected: the most likely
  regression in a future change.
- Skipping the last-admin test — rejected: same reason.

**Gotchas**:
- The `databaseHooks.user.create.before` callback is in `auth.ts` and
  is wired into the Better Auth handler, not directly testable as a
  pure function. A unit test exercises the callback by calling it
  with a mock Prisma client and asserting the thrown error.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Role enum | Reduce to `{user, admin}`; `patient` and `doctor` are rejected at the boundary |
| DoctorProfile table | Dropped in favor of a new standalone `Doctor` table |
| DoctorProfile auto-creation | Removed (no more doctor verification) |
| DoctorApprovedGuard | Removed (no doctor-only routes) |
| Admin doctor endpoints | Full CRUD: list, create, get, update, deactivate, delete |
| Role-change endpoint | New `PATCH /api/admin/users/:id/role` with last-admin guard |
| Social login | Unchanged in code; spec text updated for terminology |
| Seed script | Unchanged (still creates Super Admin only) |
| Data migration | Out of scope; flagged as a prerequisite for production |
| Tests | Unit tests for new service methods + last-admin guard; e2e CRUD lifecycle |
