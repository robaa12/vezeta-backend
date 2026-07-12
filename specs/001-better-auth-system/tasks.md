---
description: "Task list for Better Auth authentication system"
---

# Tasks: Authentication System (Better Auth)

**Input**: Design documents from `/specs/001-better-auth-system/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: Integration tests are required per project constitution (Principle: Code Quality & Delivery). Test tasks are interleaved with implementation per user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `test/` at repository root
- This is a NestJS backend (REST API), all paths are under `src/` and `test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, directory structure

- [x] T001 Install Better Auth, Prisma, and adapter dependencies in package.json
- [x] T002 [P] Create .env.example with all required environment variables in .env.example
- [x] T003 [P] Create .gitignore entries for prisma generated files and .env in .gitignore
- [x] T004 [P] Create feature-module directory structure under src/ (auth, admin, users, prisma, common, seed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Initialize Prisma in prisma/ with `npx prisma init` and PostgreSQL datasource
- [x] T006 Generate Better Auth core schema (User, Session, Account, Verification) via `npx @better-auth/cli generate` into prisma/schema.prisma
- [x] T007 Add DoctorProfile model with 1:1 User relation to prisma/schema.prisma
- [x] T008 [P] Create initial Prisma migration with `npx prisma migrate dev --name init_auth`
- [x] T009 Create PrismaService wrapping PrismaClient in src/prisma/prisma.service.ts
- [x] T010 Create PrismaModule exporting PrismaService as global in src/prisma/prisma.module.ts
- [x] T011 Create Better Auth instance config with emailOTP and phoneNumber plugins in src/auth/auth.ts
- [x] T012 Create AuthModule using `AuthModule.forRoot({ auth })` from @thallesp/nestjs-better-auth in src/auth/auth.module.ts
- [x] T013 [P] Create Session interface with user, session, and doctorProfile fields in src/common/interfaces/session.interface.ts
- [x] T014 [P] Create @CurrentUser decorator extracting session.user in src/common/decorators/current-user.decorator.ts
- [x] T015 [P] Create @Roles decorator accepting role array in src/common/decorators/roles.decorator.ts
- [x] T016 [P] Create RolesGuard validating user role against @Roles metadata in src/common/guards/roles.guard.ts
- [x] T017 [P] Create DoctorApprovedGuard checking DoctorProfile.status === "APPROVED" in src/common/guards/doctor-approved.guard.ts
- [x] T018 Create UsersModule with UsersService (user lookup helpers) in src/users/users.module.ts
- [x] T019 Update main.ts to disable bodyParser and enable cookie parser in src/main.ts
- [x] T020 Update AppModule to import PrismaModule, AuthModule, UsersModule in src/app.module.ts
- [x] T021 Configure global validation pipe (class-validator) in src/main.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Patient Registration & Verification (Priority: P1) 🎯 MVP

**Goal**: A new patient registers with email/phone/password, verifies both channels via OTP, then can log in and access protected routes.

**Independent Test**: Register a new patient with `role: "patient"`, send and verify email OTP, send and verify phone OTP, log in, then call `GET /api/auth/me` with session cookie and receive the fully verified profile.

### Implementation for User Story 1

- [x] T022 [P] [US1] Create RegisterDto with class-validator decorators (email, password min length, phone E.164, name, role enum) in src/auth/dto/register.dto.ts
- [x] T023 [US1] Wire sign-up endpoint with role whitelist (patient | doctor, reject admin) in src/auth/auth.ts
- [x] T024 [US1] Configure emailOTP plugin with sendVerificationOTP callback (logs OTP in dev, dispatches via email provider in prod) in src/auth/auth.ts
- [x] T025 [US1] Configure phoneNumber plugin with sendOTP callback (logs code in dev, dispatches via SMS provider in prod) in src/auth/auth.ts
- [x] T026 [US1] Add `phoneNumber` field to additionalFields on user config so sign-up accepts phone in src/auth/auth.ts
- [x] T027 [US1] Add isActive field to additionalFields (default true) on user config in src/auth/auth.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently — a patient can register, verify both channels, and access protected routes.

---

## Phase 4: User Story 2 - Doctor Registration, Verification & Approval Gate (Priority: P1)

**Goal**: A doctor registers, verifies both channels, DoctorProfile is auto-created with PENDING status, doctor can log in but is blocked from doctor-only routes until a Super Admin approves.

**Independent Test**: Register a doctor, verify both channels, confirm DoctorProfile created with PENDING, log in, confirm /me shows pending status, confirm doctor-only route returns 403, then have admin approve, confirm route becomes accessible.

### Implementation for User Story 2

- [x] T030 [US2] Add database hook to create DoctorProfile with PENDING status when both email and phone are verified AND role=doctor in src/auth/auth.ts
- [x] T031 [US2] Update sign-in response hook to attach `doctorProfile.status` to user object in src/auth/auth.ts
- [x] T032 [P] [US2] Create test doctor-only route guarded by DoctorApprovedGuard returning 200 in src/auth/auth.controller.ts
- [x] T033 [P] [US2] Add e2e test for doctor registration + DoctorProfile PENDING creation in test/auth.e2e-spec.ts
- [x] T034 [P] [US2] Add e2e test for doctor-only route 403 when PENDING/REJECTED/SUSPENDED in test/auth.e2e-spec.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently — patients flow freely, doctors are gated until approval.

---

## Phase 5: User Story 3 - Login & Session Management (Priority: P1)

**Goal**: Verified users (patient or doctor) can log in via email or phone, sessions are HTTP-only cookies, /me returns the full profile, sign-out destroys the session.

**Independent Test**: Log in with valid credentials, confirm session cookie set and HttpOnly, call /me to receive profile, call sign-out, confirm cookie cleared and /me returns 401.

### Implementation for User Story 3

- [x] T035 [US3] Configure emailAndPassword with revokeSessionsOnPasswordReset flag in src/auth/auth.ts
- [x] T036 [US3] Configure session cookie settings (httpOnly, secure in prod, sameSite, 7-day expiry) in src/auth/auth.ts
- [x] T037 [US3] Create AuthController with GET /api/auth/me returning typed session user (id, name, email, phone, role, verification flags, doctorProfile if applicable) in src/auth/auth.controller.ts
- [x] T038 [P] [US3] Add e2e test for email login + /me + sign-out flow in test/auth.e2e-spec.ts
- [x] T039 [P] [US3] Add e2e test for phone login flow in test/auth.e2e-spec.ts
- [x] T040 [P] [US3] Add e2e test for invalid credentials returns generic error in test/auth.e2e-spec.ts
- [x] T041 [P] [US3] Add e2e test for /me returns 401 when no session cookie in test/auth.e2e-spec.ts

**Checkpoint**: All P1 user stories (US1, US2, US3) are now functional — full registration, verification, login, and approval gate.

---

## Phase 6: User Story 4 - Password Reset (Priority: P2)

**Goal**: User can request password reset via email or phone OTP, submit new password with valid code, all existing sessions are revoked.

**Independent Test**: Request reset via email, submit OTP with new password, confirm old password fails login and new password succeeds; same for phone channel.

### Implementation for User Story 4

- [x] T042 [US4] Confirm emailOTP plugin exposes request-password-reset and reset-password endpoints (no custom code) in src/auth/auth.ts
- [x] T043 [US4] Confirm phoneNumber plugin exposes request-password-reset and reset-password endpoints (no custom code) in src/auth/auth.ts
- [x] T044 [P] [US4] Add e2e test for password reset via email OTP and session revocation in test/auth.e2e-spec.ts
- [x] T045 [P] [US4] Add e2e test for password reset via phone OTP in test/auth.e2e-spec.ts
- [x] T046 [P] [US4] Add e2e test for invalid/expired reset OTP rejection in test/auth.e2e-spec.ts

**Checkpoint**: User Story 4 complete — both reset channels work and invalidate existing sessions.

---

## Phase 7: User Story 6 - Super Admin Seeding (Priority: P3) *[must precede US5]*

**Goal**: A seed script creates a single Super Admin account idempotently using env-var credentials; running it multiple times produces no duplicates.

**Independent Test**: Run seed on empty DB, confirm admin created; run again, confirm no duplicate; log in as admin, confirm role=admin.

> **Note**: This is P3 by user value but is a technical prerequisite for US5 (admin endpoints). Implementing it first unblocks admin testing.

### Implementation for User Story 6

- [x] T047 [P] [US6] Add SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME env vars to .env.example
- [x] T048 [US6] Create idempotent seed script checking for existing admin before creating via auth.api.signUpEmail with role override in src/seed/seed.ts
- [x] T049 [US6] Add seed npm script `db:seed` invoking `ts-node src/seed/seed.ts` in package.json
- [x] T050 [P] [US6] Add e2e test for seed script idempotency (run twice, assert single admin) in test/admin.e2e-spec.ts
- [x] T051 [P] [US6] Add e2e test for seeded admin login + role=admin confirmation in test/admin.e2e-spec.ts

**Checkpoint**: Super Admin can be seeded and used to log in; US5 admin endpoints can now be tested.

---

## Phase 8: User Story 5 - Admin Doctor Management (Priority: P2)

**Goal**: Super Admin can list doctors filtered by status, approve/reject/suspend doctors, and deactivate any user.

**Independent Test**: Seed admin, log in, list PENDING doctors, approve one, confirm that doctor gains doctor-only access; suspend another, confirm loss of access; deactivate a user, confirm login rejection.

### Implementation for User Story 5

- [x] T052 [US5] Create AdminService with listDoctors(status), approveDoctor(id, adminId), rejectDoctor(id, adminId), suspendDoctor(id, adminId), deactivateUser(id) methods in src/admin/admin.service.ts
- [x] T053 [P] [US5] Create ListDoctorsDto with optional status enum query param in src/admin/dto/list-doctors.dto.ts
- [x] T054 [P] [US5] Create ApproveDoctorDto (currently empty, reserved for future notes/reason) in src/admin/dto/approve-doctor.dto.ts
- [x] T055 [US5] Create AdminController with GET /api/admin/doctors guarded by @Roles(["admin"]) in src/admin/admin.controller.ts
- [x] T056 [US5] Add PATCH /api/admin/doctors/:id/approve endpoint in src/admin/admin.controller.ts
- [x] T057 [US5] Add PATCH /api/admin/doctors/:id/reject endpoint in src/admin/admin.controller.ts
- [x] T058 [US5] Add PATCH /api/admin/doctors/:id/suspend endpoint in src/admin/admin.controller.ts
- [x] T059 [US5] Add PATCH /api/admin/users/:id/deactivate endpoint (sets isActive=false) in src/admin/admin.controller.ts
- [x] T060 [US5] Create AdminModule importing PrismaModule and registering AdminController/AdminService in src/admin/admin.module.ts
- [x] T061 [US5] Register AdminModule in AppModule imports in src/app.module.ts
- [x] T062 [P] [US5] Add e2e test for admin login + list PENDING doctors in test/admin.e2e-spec.ts
- [x] T063 [P] [US5] Add e2e test for admin approve → doctor gains doctor-only access in test/admin.e2e-spec.ts
- [x] T064 [P] [US5] Add e2e test for admin reject → doctor blocked in test/admin.e2e-spec.ts
- [x] T065 [P] [US5] Add e2e test for admin suspend → previously approved doctor blocked in test/admin.e2e-spec.ts
- [x] T066 [P] [US5] Add e2e test for admin deactivate user → login rejected in test/admin.e2e-spec.ts
- [x] T067 [P] [US5] Add e2e test for non-admin gets 403 on admin endpoints in test/admin.e2e-spec.ts

**Checkpoint**: All user stories are now functional — complete auth + admin management loop.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T068 [P] Add structured logging (request id, user id, action) across auth and admin modules
- [x] T069 [P] Add global exception filter returning consistent error response format in src/common/filters/http-exception.filter.ts
- [x] T070 [P] Add CORS configuration in src/main.ts
- [x] T071 [P] Add rate limiting middleware on auth endpoints (sign-in, OTP send, password reset)
- [x] T072 [P] Add unit tests for RolesGuard logic in src/common/guards/roles.guard.spec.ts
- [x] T073 [P] Add unit tests for DoctorApprovedGuard logic in src/common/guards/doctor-approved.guard.spec.ts
- [x] T074 Run quickstart.md validation scenarios end-to-end and capture results
- [x] T075 [P] Update README with auth setup, env vars, and seed instructions
- [x] T076 [P] Add npm scripts for prisma operations (db:migrate, db:generate, db:reset) in package.json
- [x] T077 Verify all lint and typecheck commands pass (`npm run lint`, `npm run build`)
- [x] T078 Security review: confirm no secrets logged, cookies HttpOnly+Secure in prod, OTP not in response body

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1, US2, US3 (P1) can proceed in parallel after foundation
  - US4 (P2) requires US1/US3 (sign-in, sessions exist)
  - US6 (P3) requires foundation only, must precede US5
  - US5 (P2) requires US6 (seeded admin) to test
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Shares sign-up code with US1, but DoctorProfile hook is independent
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories (login/me/sign-out)
- **User Story 4 (P2)**: Can start after US3 (uses session/cookie infra); can run in parallel with US1/US2
- **User Story 6 (P3)**: Can start after Foundational (Phase 2) - Must complete before US5 testing
- **User Story 5 (P2)**: Can start after US6 (seeded admin) - depends on US1/US2 (registered doctors to manage)

### Within Each User Story

- DTOs and config before endpoints
- Hooks/config (auth.ts) before controller endpoints
- Endpoints before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002, T003, T004)
- All Foundational DTO/decorator/guard files marked [P] can run in parallel (T013-T017)
- US1, US2, US3 can be developed in parallel by separate developers after Foundation
- US4 and US6 can run in parallel after Foundation
- All e2e test files within a user story marked [P] can be written in parallel
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch DTO and test creation in parallel:
Task: "Create RegisterDto in src/auth/dto/register.dto.ts"
Task: "Add e2e test for patient sign-up flow in test/auth.e2e-spec.ts"
Task: "Add e2e test for duplicate registration rejection in test/auth.e2e-spec.ts"

# Launch auth config additions in parallel (same file, but logically separable edits):
Task: "Configure emailOTP plugin sendVerificationOTP callback in src/auth/auth.ts"
Task: "Configure phoneNumber plugin sendOTP callback in src/auth/auth.ts"
```

---

## Parallel Example: User Story 5

```bash
# Launch DTO and module file creation in parallel:
Task: "Create ListDoctorsDto in src/admin/dto/list-doctors.dto.ts"
Task: "Create ApproveDoctorDto in src/admin/dto/approve-doctor.dto.ts"

# Launch all e2e tests in parallel (different describe blocks in same file):
Task: "Add e2e test for admin list PENDING doctors in test/admin.e2e-spec.ts"
Task: "Add e2e test for admin approve flow in test/admin.e2e-spec.ts"
Task: "Add e2e test for admin reject flow in test/admin.e2e-spec.ts"
Task: "Add e2e test for admin suspend flow in test/admin.e2e-spec.ts"
Task: "Add e2e test for admin deactivate user in test/admin.e2e-spec.ts"
Task: "Add e2e test for non-admin 403 in test/admin.e2e-spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently via quickstart Scenario 1
5. Deploy/demo if ready — a fully working patient auth flow

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test → Deploy (MVP: patient auth works)
3. Add User Story 2 → Test → Deploy (doctor registration + approval gate)
4. Add User Story 3 → Test → Deploy (login + session management)
5. Add User Story 6 → Test → Deploy (seed script)
6. Add User Story 5 → Test → Deploy (admin endpoints)
7. Add User Story 4 → Test → Deploy (password reset)
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers (solo project, but available if scaling):

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (patient flow)
   - Developer B: User Story 2 (doctor gate)
   - Developer C: User Story 3 (login/session) + US4 (password reset)
3. After US1, US2, US3 complete:
   - Developer A: User Story 6 (seed)
   - Developer B: User Story 5 (admin endpoints)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files (or logically independent edits to same file), no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Better Auth manages most auth flows — custom code is for hooks, /me, guards, admin, and seed
- DoctorProfile creation MUST occur only when both email AND phone are verified AND role=doctor
- Never log OTP codes, passwords, or session tokens
- Session cookies MUST be HttpOnly; Secure flag in production
- Verify the constitution's gates (Feature-Module Architecture, Better Auth Schema Sovereignty, Auth & Access Control) at code review
