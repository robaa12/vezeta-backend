---
description: "Task list for auth model simplification (remove doctor role)"
---

# Tasks: Simplify Auth Model (Remove Doctor Role)

**Input**: Design documents from `/specs/003-remove-doctor-role/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md
**Tests**: The constitution's Code Quality section requires integration tests covering new flows. Test tasks are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `test/` at repository root
- This feature touches the existing `src/auth/`, `src/admin/`, `src/common/`, and `prisma/` modules.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level changes that prepare the codebase for the amendment. These tasks touch configuration files and shared modules; no user story work can begin until the schema change is applied.

- [X] T001 Update `prisma/schema.prisma`: change `User.role` default value from `"patient"` to `"user"` and update the inline comment that references the old "patient" default
- [X] T002 Update `prisma/schema.prisma`: drop the `DoctorProfile` model and the `User.doctorProfile` / `User.approvedDoctors` relations (per data-model.md R2)
- [X] T003 [P] Update `prisma/schema.prisma`: add the new standalone `Doctor` model (id, name, specialty, bio, imageUrl, status, timestamps) per data-model.md
- [X] T004 [P] Update `src/auth/auth.ts` `user.additionalFields.role.defaultValue` from `"patient"` to `"user"` (per research.md R1)
- [X] T005 [P] Delete `src/common/guards/doctor-approved.guard.ts` (no more doctor-only routes)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core code and database changes that MUST be complete before any user story can be implemented. The Prisma migration is the keystone — once it's generated and applied, the rest of the work assumes the new schema.

- [X] T006 Run `npx prisma migrate dev --name remove_doctor_role` to generate the migration that drops `DoctorProfile`, adds `Doctor`, and changes `User.role` default
- [X] T007 [P] Update `src/auth/auth.ts` `databaseHooks.user.create.before` callback: reject any `role` value other than `"user"` or `"admin"` (return a validation error rather than coercing; the previous callback silently coerced unknown values to `"patient"`)
- [X] T008 [P] Update `src/auth/auth.ts`: remove the `databaseHooks.user.update.after` callback that auto-creates `DoctorProfile` rows (per research.md R2)
- [X] T009 [P] Update `src/common/interfaces/session.interface.ts`: drop the `DoctorProfileSummary` type and the `doctorProfile` field on `SessionUser`; change the `UserRole` enum from `'patient' | 'doctor' | 'admin'` to `'user' | 'admin'`
- [X] T010 [P] Update `src/auth/auth.service.ts` `enrichSessionUser` to drop the doctor-profile enrichment branch
- [X] T011 [P] Update `src/auth/auth.controller.ts` to remove the `/api/doctors/test-route` endpoint and its `DoctorApprovedGuard` import
- [X] T012 [P] Update `src/auth/dto/register.dto.ts` to drop the `role` field validator (or change it to a strict `IsIn(['user'])` that rejects any other value) per spec assumption
- [X] T013 [P] Update `test/auth.e2e-spec.ts` to remove doctor-related tests and rename `role: 'patient'` to `role: 'user'` in the remaining tests
- [X] T014 [P] Update `test/admin.e2e-spec.ts` to remove the doctor-profile approval flow tests (they are replaced by the new admin doctor CRUD tests in Phase 4)

**Checkpoint**: Prisma migration applied; auth and admin code is in the new shape; old doctor-related code paths are gone. User story implementation can now begin.

---

## Phase 3: User Story 1 - Self-Registration With One of Two Roles (Priority: P1) 🎯 MVP

**Goal**: A new visitor registers and ends up with `role = "user"`. No path produces `role = "doctor"` or `role = "patient"`. The `admin` role is never self-assignable.

**Independent Test**: Sign up with no role → response shows `role: "user"`. Sign up with `role: "doctor"` → 400 rejected. Sign up with `role: "admin"` → 400 rejected. Database shows exactly one new `User` row.

### Implementation for User Story 1

- [X] T015 [US1] Add a unit test for the `databaseHooks.user.create.before` callback in `src/auth/auth.ts` test file (or extract the callback to a helper for testability) — assert that `role: "doctor"`, `role: "patient"`, and any value not in `{user, admin}` is rejected
- [X] T016 [US1] Add an e2e test in `test/auth.e2e-spec.ts` that signs up with no role and asserts the response includes `role: "user"`
- [X] T017 [US1] Add an e2e test that signs up with `role: "doctor"` and asserts a 400 response
- [X] T018 [US1] Add an e2e test that signs up with `role: "admin"` and asserts a 400 response (admin role is never self-assignable)

**Checkpoint**: Self-registration is in the new shape. US1 is independently testable.

---

## Phase 4: User Story 2 - Admin Creates and Manages Doctor Records (Priority: P1)

**Goal**: A Super Admin can create, read, update, soft-deactivate, and hard-delete `Doctor` records through a full CRUD interface. A regular `user` is rejected with 403 on all doctor endpoints.

**Independent Test**: Sign in as the seeded admin, create a doctor, list doctors, get the doctor, update the doctor, deactivate it, and finally delete it. Each step succeeds and persists correctly. Then sign in as a regular `user` and confirm 403 on each doctor endpoint.

### Implementation for User Story 2

- [X] T019 [P] [US2] Create DTO `src/admin/dto/create-doctor.dto.ts` with required `name` (2-120 chars), required `specialty` (max 100 chars), optional `bio` (max 2000 chars), optional `imageUrl` (valid URL, max 2048 chars) validated via class-validator
- [X] T020 [P] [US2] Create DTO `src/admin/dto/update-doctor.dto.ts` with all fields optional, at least one required, same constraints as create
- [X] T021 [P] [US2] Create DTO `src/admin/dto/list-doctors.dto.ts` (or update the existing one) with `status` enum (`"ACTIVE" | "DEACTIVATED"`), `specialty` string, `search` string, `page` int (default 1), `pageSize` int (default 20, max 100)
- [X] T022 [US2] Implement `AdminService.createDoctor(dto)` in `src/admin/admin.service.ts` — validates input, inserts a `Doctor` row with `status: "ACTIVE"`, returns the new doctor (depends on T019)
- [X] T023 [US2] Implement `AdminService.listDoctors(query)` in `src/admin/admin.service.ts` — paginated list with optional `status`, `specialty`, `search` filters, returns `{ doctors, total, page, pageSize }` (depends on T021)
- [X] T024 [US2] Implement `AdminService.getDoctor(id)` in `src/admin/admin.service.ts` — returns the doctor or throws `NotFoundException`
- [X] T025 [US2] Implement `AdminService.updateDoctor(id, dto)` in `src/admin/admin.service.ts` — partial update on the provided fields, throws `NotFoundException` if missing
- [X] T026 [US2] Implement `AdminService.deactivateDoctor(id)` in `src/admin/admin.service.ts` — sets `status: "DEACTIVATED"`, returns 409 with `error: "already_deactivated"` if already deactivated
- [X] T027 [US2] Implement `AdminService.deleteDoctor(id)` in `src/admin/admin.service.ts` — hard-deletes the row; for v1 always allows (the historical-bookings check is a stub for future use)
- [X] T028 [US2] Add `GET /api/admin/doctors`, `POST /api/admin/doctors`, `GET /api/admin/doctors/:id`, `PATCH /api/admin/doctors/:id`, `PATCH /api/admin/doctors/:id/deactivate`, `DELETE /api/admin/doctors/:id` endpoints in `src/admin/admin.controller.ts` — guard with `RolesGuard` + `@Roles('admin')` (depends on T022-T027)
- [X] T029 [US2] Remove the old `GET /api/admin/doctors?status=PENDING|...`, `PATCH /api/admin/doctors/:id/approve`, `PATCH /api/admin/doctors/:id/reject`, `PATCH /api/admin/doctors/:id/suspend` endpoints from `src/admin/admin.controller.ts` (replaced by the new CRUD)
- [X] T030 [US2] Remove the old `listDoctors(status)` and `setDoctorStatus(...)` methods from `src/admin/admin.service.ts` (replaced by the new CRUD)
- [X] T031 [US2] Update the `AdminController` OpenAPI / Swagger annotations to describe the new endpoints (replacing the old approval/reject/suspend docs)

**Checkpoint**: The full Doctor CRUD is in place. Admins can manage the doctor catalog; users cannot. US2 is independently testable.

---

## Phase 5: User Story 3 - Doctor Records Are Not User Accounts (Priority: P1)

**Goal**: A regression test that confirms doctors have no `User` account, no foreign key to `User`, and that `User.role = "doctor"` is rejected at every entry point (registration, role-change, and direct DB).

**Independent Test**: Attempt to create a `User` with `role: "doctor"` via the registration API (400). Attempt to set `User.role: "doctor"` via the role-change endpoint (400). Inspect the `Doctor` table to confirm it has no `userId` column. Confirm the old `/api/doctors/test-route` returns 404.

### Implementation for User Story 3

- [X] T032 [P] [US3] Add a unit test that confirms the `Doctor` Prisma model has no `userId` field (e.g. via reading the generated Prisma client types or the schema file)
- [X] T033 [P] [US3] Add a unit test for `AdminService` confirming the role-change endpoint (T037) rejects any `role` value outside `{user, admin}` with 400
- [X] T034 [US3] Add an e2e test in `test/auth.e2e-spec.ts` (or a new test file) confirming that `GET /api/doctors/test-route` returns 404
- [X] T035 [US3] Add an e2e test confirming that `GET /api/me` does NOT include a `doctorProfile` field on the response (the field is removed)

**Checkpoint**: All regressions against the old doctor-as-a-user concept are guarded. US3 is independently testable.

---

## Phase 6: User Story 4 - Existing Social Signup Behavior Preserved (Priority: P2)

**Goal**: Social signup (Google, Facebook) continues to work and produces `role = "user"` accounts. The auto-link behavior on returning social sign-in is unchanged.

**Independent Test**: Run a social signup via the mock OAuth server (see feature 002's quickstart). Assert the new `User` row has `role: "user"`. Sign out and sign in with the same provider; assert the same user is reused and no new row is created.

### Implementation for User Story 4

- [X] T036 [US4] Verify that `src/auth/auth.ts` social provider config blocks (from feature 002) still work without modification — the role assignment is delegated to `additionalFields.role.defaultValue` which is now `"user"`. No code change required in the social providers config.
- [X] T037 [US4] Update `specs/002-social-oauth-login/spec.md` to replace "PATIENT" wording with "user" where the role default is mentioned (documentation sync; no behavior change)
- [X] T038 [US4] Update `specs/002-social-oauth-login/contracts/social-auth-api.md` to reflect the role value change in any examples that reference the role
- [X] T039 [US4] Add an e2e test in `test/social-auth.e2e-spec.ts` (from feature 002) asserting that a new social signup returns `role: "user"` (not `patient`)

**Checkpoint**: Social signup continues to work in the new role model. US4 is independently testable.

---

## Phase 7: User Story 5 - Super Admin Seeding and Promotion (Priority: P3)

**Goal**: A Super Admin can promote a `user` to `admin` and demote an `admin` back to `user`. The last-admin guard prevents demoting the last active admin. The seed script is unchanged.

**Independent Test**: With only one active admin, attempt to demote that admin → 409 `last_admin`. Promote a second user to admin, then demote the first → succeeds. Run the seed script twice on a fresh database → exactly one Super Admin account.

### Implementation for User Story 5

- [X] T040 [P] [US5] Create DTO `src/admin/dto/role-change.dto.ts` with `role` field validated as `IsIn(['user', 'admin'])`
- [X] T041 [US5] Implement `AdminService.changeUserRole(userId, newRole, adminId)` in `src/admin/admin.service.ts` — rejects with 409 `last_admin` if the change would leave zero active admins (depends on T040)
- [X] T042 [US5] Add `PATCH /api/admin/users/:id/role` endpoint in `src/admin/admin.controller.ts` — guard with `RolesGuard` + `@Roles('admin')` (depends on T041)
- [X] T043 [US5] Verify the seed script `src/seed/seed.ts` is unchanged (it already creates the Super Admin with `role: "admin"`; no change needed)
- [X] T044 [US5] Add a unit test for `changeUserRole` covering: promotion succeeds, demotion succeeds when other admins exist, demotion rejected with 409 when it would leave zero active admins, deactivated admins do NOT count as "active admins" for the guard
- [X] T045 [US5] Add an e2e test in `test/admin.e2e-spec.ts` (or the new admin-doctors spec) for the role-change endpoint covering: promotion, demotion with other admins, last-admin rejection

**Checkpoint**: The last-admin guard is enforced and tested. US5 is independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end tests, validation, and documentation that span all user stories.

- [X] T046 [P] Create `test/admin-doctors.e2e-spec.ts` covering the 10 scenarios from `specs/003-remove-doctor-role/quickstart.md` (self-registration role, admin create, non-admin 403, admin update, admin deactivate, admin delete, role change promotion, last-admin guard, social signup role, DoctorProfile gone)
- [X] T047 [P] Add unit tests for the new `AdminService` doctor CRUD methods (createDoctor, listDoctors with filters, getDoctor, updateDoctor, deactivateDoctor, deleteDoctor) in `src/admin/admin.service.spec.ts`
- [X] T048 [P] Update `README.md` to reflect the simplified role model (`user` + `admin` only), document the new doctor CRUD endpoints, and flag the data-migration prerequisite for production deployment (per research.md R7)
- [X] T049 [P] Update the constitution's Principle III wording to reflect the standalone `Doctor` entity (out of band, but flagged for follow-up)
- [X] T050 Run `npm test` and `npm run test:e2e -- --testPathPattern=admin-doctors` to confirm all new tests pass and no existing tests regress
- [X] T051 Run `npm run lint` and fix any lint issues introduced by the new code
- [X] T052 Run `npm run build` to confirm the TypeScript build succeeds with the new schema and the deleted code paths
- [ ] T053 Run the manual quickstart validation scenarios in `specs/003-remove-doctor-role/quickstart.md` against a running stack to confirm the end-to-end flows

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. The Prisma migration (T006) is the keystone — without it, the TypeScript code won't compile (references to `prisma.doctorProfile` will fail). All Phase 2 tasks must complete before any US work.
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion.
  - US1 (self-registration) and US2 (doctor CRUD) are independent and can be done in parallel.
  - US3 (regression tests) depends on US1, US2, and US5 having landed (so all the entry points exist).
  - US4 (social signup) depends on US1 having landed (so the new role default is in place).
  - US5 (role change) is independent and can be done in parallel with US1, US2, US4.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1, MVP)**: Can start after Foundational (Phase 2). No dependencies on other stories.
- **User Story 2 (P1)**: Can start after Foundational (Phase 2). Independent of US1, US4, US5.
- **User Story 3 (P1)**: Regression tests only. Can start after Foundational + US1 (to test the role rejection in registration) + US5 (to test the role rejection in role-change).
- **User Story 4 (P2)**: Can start after Foundational. The code change is zero (just config inheritance), but the e2e test (T039) requires US1 to have landed so the social signup assertion is meaningful.
- **User Story 5 (P3)**: Can start after Foundational. Independent of US1, US2, US4.

### Within Each User Story

- DTOs before service methods that use them.
- Service methods before controller endpoints that call them.
- The role-change endpoint (T042) depends on its DTO (T040) and service method (T041).
- The deactivation endpoint depends on the deactivation service method (T026).
- Tests come after the implementation tasks they cover.

### Parallel Opportunities

- All Setup tasks marked [P] (T003, T004, T005) can run in parallel with T001-T002 — different files.
- All Foundational tasks marked [P] (T007-T014) can run in parallel with each other — different files.
- US2 implementation tasks T019-T021 (DTOs) can run in parallel with each other — different files.
- US2 service methods T022-T027 can run in parallel (different methods on the same class, but if implemented as separate edits they can be done sequentially by a single contributor).
- All Phase 8 test tasks (T046-T048) can run in parallel — different files.
- US1, US2, US4, US5 (most of their work) can be done in parallel by different contributors once Phase 2 is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

The MVP is **US1 (self-registration with one of two roles)** plus the foundational phase, because:
1. It validates the most critical simplification: the role enum is reduced
   to `{user, admin}` and the application layer rejects all other values.
2. It produces a working end-to-end flow that can be tested
   immediately (no DB schema breakage — the only change is the
   default value).
3. The rest of the work (doctor CRUD, role change, last-admin guard)
   builds on the same auth foundation.

Steps:
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (the keystone is the Prisma migration)
3. Complete Phase 3: US1
4. **STOP and VALIDATE**: Run the e2e tests, confirm registration
   rejects `role: "doctor"` and `role: "patient"`, confirm the default
   is now `role: "user"`
5. Demo the simplified role model end-to-end

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (schema is the new shape)
2. Add US1 (self-registration) → Test independently → Demo
3. Add US2 (doctor CRUD) → Test independently → Demo
4. Add US5 (role change + last-admin guard) → Test independently → Demo
5. Add US3 (regression tests) → All user stories' guarantees are guarded
6. Add US4 (social signup verification) → Demo social signup produces
   `role: "user"`
7. Phase 8 (polish, e2e suite, docs, constitution amendment) → Final
   validation

Each story adds value without breaking previous stories; all changes
are backwards-compatible at the API level for clients that correctly
read `role` as a string (the value space shrinks, but never expands
incompatible ways).

### Parallel Team Strategy

With multiple developers (post-MVP):
1. Team completes Phase 1 + Phase 2 together.
2. After Foundational is done:
   - Developer A: US2 (doctor CRUD) — in parallel with US5
   - Developer B: US5 (role change + last-admin guard) — in parallel with US2
   - Developer C: US3 (regression tests) — in parallel
3. Developer D: US4 (social signup verification) — after US1 lands
4. After all stories: team collectively owns Phase 8 polish + e2e suite.

For the MVP (solo / pair), execute strictly in the order US1 → US2 →
US5 → US3 → US4, stopping after each story for validation.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- The Prisma migration (T006) is the riskiest single task — it
  changes the database schema and drops a table. Run it in a
  development environment first, NOT directly on production.
- The data migration of existing rows is **out of scope** for this
  feature per the spec assumption. Before deploying to a populated
  database, the operator MUST run the manual data migration script
  documented in `data-model.md` (Migrations → Data migration).
- The constitution's Principle III wording is now stale
  (it references the old `DoctorProfile` 1:1 relation). A
  constitution amendment is recommended but out of scope for this
  feature — flagged in T049.
- Verify tests fail before implementing where TDD is desired (the
  unit tests in Phase 2 and Phase 8 can be written first against the
  new helpers, then the implementation tasks verified to make them
  pass).
- Commit after each task or logical group; PR per user story is ideal.
- Stop at any checkpoint to validate a story independently.
