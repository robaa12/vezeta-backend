---
description: "Task list for doctor search & discovery (Module 2)"
---

# Tasks: Doctor Search & Discovery (Module 2)

**Input**: Design documents from `/specs/004-doctor-search/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md
**Tests**: The constitution's Code Quality section requires integration tests covering new flows. Test tasks are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `test/` at repository root
- This feature creates a new `src/doctors/` module and one e2e test under `test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new feature module's directory structure and DTO. These tasks touch only new files and have no dependencies on existing code beyond `PrismaService`.

- [X] T001 [P] Create `src/doctors/doctors.module.ts` — empty NestJS module class `DoctorsModule` that registers `DoctorsController` and `DoctorsService`, imports the global `PrismaService` (no need to add to providers since it's `@Global()`)
- [X] T002 [P] Create `src/doctors/dto/list-doctors.dto.ts` with the `ListPublicDoctorsDto` class — optional `specialty` (string, max 100), optional `search` (string, max 120), optional `page` (int, min 1, default 1), optional `pageSize` (int, min 1, max 100, default 20) validated via class-validator and class-transformer

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `DoctorsService` is the building block for all three controller endpoints. No user story work can begin until the service exists with the three read methods.

- [X] T003 Implement `src/doctors/doctors.service.ts` — `DoctorsService` with `listPublicDoctors(query)`, `getPublicDoctor(id)`, and `listSpecialties()` methods. Each method takes the validated DTO / id and returns the data per `data-model.md` (Prisma `where: { status: 'ACTIVE' }` filter, `orderBy: { createdAt: 'desc' }` for listing, `findFirst` for profile, `findMany` with `distinct: ['specialty']` for specialties)

**Checkpoint**: Service is in place. Controller methods can now be added per user story.

---

## Phase 3: User Story 1 - Browse the Doctor Catalog (Priority: P1) 🎯 MVP

**Goal**: An anonymous visitor hits `GET /api/doctors` and gets a paginated list of ACTIVE doctors with no auth required.

**Independent Test**: Hit `GET /api/doctors` with no cookie, no Authorization header. Assert 200, response has `{ doctors, total, page, pageSize }`, all doctors have `status: "ACTIVE"`, sort order is `createdAt DESC`.

### Implementation for User Story 1

- [X] T004 [US1] Implement the `GET /api/doctors` controller method in `src/doctors/doctors.controller.ts` — uses `@AllowAnonymous()`, calls `DoctorsService.listPublicDoctors(query)`, returns the service result with HTTP 200. Decorate the method with `@Header('Cache-Control', 'public, max-age=60')` per FR-015.
- [X] T005 [P] [US1] Add a `GET /api/doctors` Swagger / OpenAPI annotation block in the controller method (operation summary, response shape, 400 / 429 error cases) per `contracts/doctor-search-api.md`
- [X] T006 [US1] Add a unit test in `src/doctors/doctors.service.spec.ts` for `listPublicDoctors` covering: no filter, `specialty` filter, `search` filter, combined `specialty`+`search` (AND), default pagination, custom pagination. Mock Prisma's `findMany` and `count`.

**Checkpoint**: US1 is independently testable. The listing endpoint works with no auth, filters work, pagination works.

---

## Phase 4: User Story 4 - View a Doctor's Public Profile (Priority: P1)

**Goal**: An anonymous visitor hits `GET /api/doctors/:id` for an ACTIVE doctor and gets the full public record. A deactivated or missing doctor returns 404 (indistinguishable).

**Independent Test**: Hit `GET /api/doctors/{id}` for a known ACTIVE doctor → 200 with the doctor's record. Hit the same endpoint for a DEACTIVATED doctor → 404. Hit it for a non-existent id → 404. All without auth.

### Implementation for User Story 4

- [X] T007 [US4] Implement the `GET /api/doctors/:id` controller method in `src/doctors/doctors.controller.ts` — uses `@AllowAnonymous()`, calls `DoctorsService.getPublicDoctor(id)`, returns `{ doctor: ... }` with HTTP 200 on success. Decorate with `@Header('Cache-Control', 'public, max-age=300')` per FR-015. The service throws `NotFoundException` for missing or DEACTIVATED doctors — NestJS maps to 404 automatically.
- [X] T008 [P] [US4] Add the `GET /api/doctors/:id` Swagger / OpenAPI annotation block (operation summary, response shape, 404 / 429 error cases) per `contracts/doctor-search-api.md`
- [X] T009 [P] [US4] Add a unit test in `src/doctors/doctors.service.spec.ts` for `getPublicDoctor` covering: ACTIVE doctor returns the record, DEACTIVATED doctor returns null (the controller throws 404), non-existent id returns null

**Checkpoint**: US4 is independently testable. The profile endpoint works for ACTIVE doctors and hides deactivated ones.

---

## Phase 5: User Story 5 - Browse the Specialties Dropdown (Priority: P2)

**Goal**: An anonymous visitor hits `GET /api/specialties` and gets the distinct list of specialties from ACTIVE doctors, sorted alphabetically.

**Independent Test**: Populate doctors of multiple specialties, hit `GET /api/specialties`. Assert response is a sorted array of distinct specialty strings, no auth required.

### Implementation for User Story 5

- [X] T010 [US5] Implement the `GET /api/specialties` controller method in `src/doctors/doctors.controller.ts` — uses `@AllowAnonymous()`, calls `DoctorsService.listSpecialties()`, returns `{ specialties: [...] }` with HTTP 200. Decorate with `@Header('Cache-Control', 'public, max-age=600')` per FR-015.
- [X] T011 [P] [US5] Add the `GET /api/specialties` Swagger / OpenAPI annotation block (operation summary, response shape, 429 error case) per `contracts/doctor-search-api.md`
- [X] T012 [P] [US5] Add a unit test in `src/doctors/doctors.service.spec.ts` for `listSpecialties` covering: returns distinct values, sorted alphabetically, empty catalog returns `[]`, DEACTIVATED-only specialties are excluded

**Checkpoint**: US5 is independently testable. The specialties dropdown endpoint works without auth.

---

## Phase 6: User Story 6 - Newly Created Doctor Becomes Searchable (Priority: P2)

**Goal**: A doctor created via the admin CRUD (feature 003) appears in the public listing within 5 seconds. A deactivated doctor disappears within 5 seconds.

**Independent Test**: Create a doctor via the admin endpoint. Within 5 seconds, hit the public listing and confirm the new doctor is present. Deactivate the doctor. Within 5 seconds, confirm it's gone from the listing AND the public profile returns 404.

### Implementation for User Story 6

**Note**: US6 is a behavior, not a new endpoint — it is achieved by the application's policy of "no in-process cache; every public request reads the DB" plus the `Cache-Control` headers added in T004, T007, and T010. The verification of US6 happens at runtime, not at code-merge time. No new code is required — but the e2e test in Phase 8 covers it.

- [X] T013 [US6] Verify that the listing, profile, and specialties controller methods DO NOT cache their responses in process (already true by default — the service reads Prisma on every call). Document this in a code comment on each method to prevent a future regression.
- [X] T014 [US6] Add the `Cache-Control: public, max-age=N` headers on all three endpoints (already in T004 / T007 / T010). The 5-second freshness target is met because `max-age` is a hint to intermediaries, not a guarantee; the application itself always reads fresh data from the DB.

**Checkpoint**: US6 is a behavior; the implementation is complete when T013 and T014 are done. Runtime verification happens in the Phase 8 e2e test.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Rate limiting, e2e tests, registration in `app.module.ts`, lint, build, documentation.

- [X] T015 [P] Update `src/app.module.ts` to import and register `DoctorsModule` in the `imports` array
- [X] T016 [P] Add Swagger / OpenAPI tags for the new module in `src/doctors/doctors.controller.ts` (`@ApiTags('doctors')` on the controller class)
- [X] T017 Verify whether `@nestjs/throttler` is in `package.json` dependencies. If not, add it and document the version. If yes, no action needed.
- [X] T018 If `@nestjs/throttler` was added or needs configuration: register `ThrottlerModule.forRoot({...})` in `src/app.module.ts` with sensible defaults
- [X] T019 Add per-route `@Throttle` decorators to the three public endpoints in `src/doctors/doctors.controller.ts`: listing 60 req/min, profile 120 req/min, specialties 30 req/min (per FR-014)
- [X] T020 [P] Create `test/doctors-public.e2e-spec.ts` covering all 11 scenarios from `specs/004-doctor-search/quickstart.md`: list with no filter, filter by specialty, search by name, combined filters, profile for ACTIVE, profile for DEACTIVATED (404), specialties, pagination, cache freshness, invalid query params (400), no auth required
- [X] T021 Run `npm test` to confirm all unit tests pass (the new doctors service tests + the existing auth + admin service tests)
- [X] T022 Run `npm run lint` and fix any lint issues introduced by the new code
- [X] T023 Run `npm run build` to confirm the TypeScript build succeeds with the new module
- [ ] T024 Run the manual quickstart validation scenarios in `specs/004-doctor-search/quickstart.md` against a running stack to confirm the end-to-end flows
- [X] T025 [P] Update `README.md` to add the public doctor endpoints to the "Authentication Endpoints" (or a new "Public Doctor Endpoints") table, with a note that no auth is required

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. The service is the building block for all three user stories.
- **User Stories (Phase 3–6)**: All depend on Phase 2 (the service).
  - US1 (listing), US4 (profile), US5 (specialties) are **independent** — they are three separate controller methods on the same controller class, but they don't depend on each other.
  - US6 (cache freshness) is a behavior that depends on US1, US4, and US5 being implemented.
- **Polish (Phase 7)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1, MVP)**: Can start after Phase 2. Independent of other stories.
- **User Story 4 (P1)**: Can start after Phase 2. Independent of US1.
- **User Story 5 (P2)**: Can start after Phase 2. Independent of US1 and US4.
- **User Story 6 (P2)**: A behavior test, not a separate implementation. Covered by the e2e suite. Can start after US1, US4, US5 are in place.

### Within Each User Story

- DTO before service method that uses it (already in Phase 1).
- Service method before controller method that calls it.
- Controller method before e2e test for that endpoint.
- Unit tests can be written in parallel with the controller method (different files).

### Parallel Opportunities

- T001 and T002 (Setup) — different files, parallel.
- T003 (service) must complete before any user story work.
- T004 + T005 (US1 controller + Swagger) — different parts of the same file, can be done in one pass; T006 (unit test) parallel.
- T007 + T008 + T009 (US4) — T007 and T008 same file, T009 different file; parallel-friendly.
- T010 + T011 + T012 (US5) — same pattern.
- T015 + T016 (Phase 7) — different files, parallel.
- T020 (e2e tests) — single file, sequential within itself, but parallel with Phase 7 lint/build tasks.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

The MVP is **Phase 1 + Phase 2 + Phase 3 (US1)** plus the foundational `app.module.ts` registration. This delivers the listing endpoint — the most important piece of the patient-facing doctor surface. The listing is what powers the "Find a doctor" page; without it, the rest of the feature is invisible to patients.

Steps:
1. Complete Phase 1: Setup (module + DTO)
2. Complete Phase 2: Foundational (service)
3. Complete Phase 3: US1 (listing controller)
4. Complete Phase 7 prerequisites: T015 (register module in app.module.ts)
5. **STOP and VALIDATE**: Run the e2e test for US1, confirm the listing works without auth
6. Demo the listing endpoint

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Add US1 (listing) → Demo the "Find a doctor" list
3. Add US4 (profile) → Demo the doctor detail page
4. Add US5 (specialties) → Demo the dropdown filter
5. Add US6 (cache freshness) — covered by the e2e suite
6. Phase 7 (rate limiting + final e2e + lint + docs) → Production-ready

### Parallel Team Strategy

With multiple developers (post-MVP):
1. Team completes Phase 1 + Phase 2 + T015 (module registration) together.
2. After Phase 2:
   - Developer A: US4 (profile)
   - Developer B: US5 (specialties) + rate limiting (T019)
   - Developer C: e2e test suite (T020) + final polish
3. The three controller methods (US1, US4, US5) all touch the same file (`doctors.controller.ts`) but different methods — they can be done sequentially by a single contributor or split if a team is careful to merge cleanly.

For the MVP (solo / pair), execute strictly in the order US1 → US4 → US5 → US6, stopping after each story for validation.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- US6 is a behavior, not a new endpoint — the implementation is the absence of an in-process cache, which is the default
- The throttler dependency check (T017) is a small risk — if `@nestjs/throttler` is not in the project, T018 / T019 depend on it being added
- Verify tests fail before implementing where TDD is desired (the unit tests in T006, T009, T012 can be written first, then the implementation verified to make them pass)
- Commit after each task or logical group; PR per user story is ideal
- Stop at any checkpoint to validate a story independently
