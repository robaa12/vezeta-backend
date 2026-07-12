---

description: "Task list for Doctor Categories (feature 005)"

---

# Tasks: Doctor Categories (005)

**Input**: Design documents from `/specs/005-doctor-categories/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Constitution §"Code Quality & Delivery" requires every new module to ship with integration tests; the e2e pattern from features 003/004 is followed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Path Conventions

This is a single NestJS backend (no frontend). Paths use `src/<feature>/`, `prisma/`, `test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + module skeleton for the new feature.

- [X] T001 Create and switch to branch `005-doctor-categories` (`git checkout -b 005-doctor-categories`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema change, data migration, module skeleton, and shared DTOs. **MUST complete before ANY user story** — every story reads or writes the `Category` table.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add `Category` model to `prisma/schema.prisma` — `id` (cuid PK), `name` (String 1-100), `status` (String default `"ACTIVE"`), `createdAt`, `updatedAt`; `@@unique([name, status])`, `@@index([status])`, `@@map("category")`, back-relation `doctors Doctor[]`
- [X] T003 [P] Modify `Doctor` model in `prisma/schema.prisma` — drop `specialty` field and its `@@index([specialty])`; add `categoryId` (String, cuid, NOT NULL) with `category Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)` and `@@index([categoryId])`
- [X] T004 Run `npx prisma migrate dev --create-only --name add_categories` to scaffold the migration directory at `prisma/migrations/<timestamp>_add_categories/`
- [X] T005 Hand-edit the generated `prisma/migrations/<timestamp>_add_categories/migration.sql` to insert the data backfill between the schema steps: (a) `CREATE TABLE "category" ...` + `@@unique` + `@@index([status])`; (b) `ALTER TABLE "doctor" ADD COLUMN "categoryId" TEXT`; (c) idempotent `INSERT INTO "category" ... SELECT DISTINCT specialty ... WHERE NOT EXISTS ...`; (d) `INSERT "General"` fallback only if any doctor has empty/null `specialty`; (e) `UPDATE "doctor" SET "categoryId" = ...` from matching category; (f) backfill null `categoryId` to "General"; (g) `ALTER TABLE "doctor" ALTER COLUMN "categoryId" SET NOT NULL`; (h) `FOREIGN KEY ... ON DELETE RESTRICT` + `CREATE INDEX "doctor_categoryId_idx"`; (i) `DROP INDEX "doctor_specialty_idx"` + `DROP COLUMN "specialty"` — all in a single transaction
- [X] T006 Run `npx prisma migrate dev` to apply the migration locally; verify `prisma db studio` shows the new `category` table and that `doctor.specialty` is gone
- [X] T007 [P] Update `src/seed/seed.ts` to seed 5 default categories (Cardiology, Pediatrics, Dermatology, Orthopedics, General Practice) using `prisma.category.upsert` with stable deterministic ids (`seed_cardiology`, `seed_pediatrics`, ...) so re-running the seed is idempotent
- [X] T008 [P] Create `src/categories/dto/create-category.dto.ts` — `name` (string, 1-100 chars, `@Transform(({ value }) => value?.trim())` + `@IsString()` + `@MinLength(1)` + `@MaxLength(100)`); `status` optional (`@IsIn(['ACTIVE', 'DEACTIVATED'])`, defaults to `ACTIVE` in the service)
- [X] T009 [P] Create `src/categories/dto/update-category.dto.ts` — same fields as create, all optional, plus `@ValidateIf` to require at least one of `name`/`status`
- [X] T010 [P] Create `src/categories/dto/list-categories.dto.ts` — `status` (optional enum), `search` (optional, max 100), `page` (int >= 1, default 1), `pageSize` (int 1-100, default 20) with class-validator + class-transformer
- [X] T011 [P] Create `src/categories/dto/category-response.dto.ts` — `@Expose()`-decorated class with `id`, `name`, `status`, `createdAt`, `updatedAt`; add `@ApiProperty` Swagger decorators
- [X] T012 [P] Create `src/categories/dto/public-category.dto.ts` — slim `{ id, name }` shape used by the public endpoint and embedded in doctor records
- [X] T013 Create `src/categories/categories.service.ts` with method signatures (bodies filled in US1/US5): `listCategories(query)`, `getCategory(id)`, `createCategory(dto)`, `updateCategory(id, dto)`, `deactivateCategory(id)`, `deleteCategory(id)` (wraps count + delete in `prisma.$transaction`), `listPublicCategories()`. Use `@Injectable()` and inject the global `PrismaService`
- [X] T014 Create `src/categories/categories.module.ts` — `@Module({ controllers: [CategoriesController, AdminCategoriesController], providers: [CategoriesService], exports: [CategoriesService] })`. Import nothing (uses global `PrismaService`); controller files are created in US1 and US5
- [X] T015 Register `CategoriesModule` in the `imports` array of `src/app.module.ts` (add alongside `AdminModule` and `DoctorsModule`)
- [X] T016 Create skeleton `test/categories.e2e-spec.ts` with the standard test setup (Supertest app, admin sign-in helper, doctor fixture helper) — no test cases yet, ready to receive per-story tests

**Checkpoint**: Foundation ready — `Category` table exists with backfilled data, `Doctor.categoryId` is NOT NULL with FK, module skeleton registered, seed populates default categories. User story implementation can now begin.

---

## Phase 3: User Story 1 - Super Admin Manages the Category Catalog (Priority: P1) 🎯 MVP

**Goal**: Super Admins can create, list, edit, deactivate, and delete categories via `/api/admin/categories`.

**Independent Test**: Sign in as Super Admin, `POST /api/admin/categories` with a unique name, `GET /api/admin/categories` lists it, `PATCH /api/admin/categories/:id` renames it, `DELETE /api/admin/categories/:id` removes it. No doctor record needs to exist.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [X] T017 [P] [US1] Add e2e tests in `test/categories.e2e-spec.ts` covering US1: create-unique-name (200), create-duplicate-case-insensitive (409/400), list-with-pagination, list-with-search, list-with-status-filter, get-one (200), get-missing (404), patch-name, patch-status, patch-deactivate-subresource (200), patch-deactivate-already-deactivated (200 idempotent), delete-unused (204), delete-in-use (409), non-admin-request (403), unauthenticated (401)

### Implementation for User Story 1

- [X] T018 [US1] Create `src/categories/admin-categories.controller.ts` — `@Controller('api/admin/categories')`, `@UseGuards(RolesGuard)` + `@Roles('admin')` (import `RolesGuard` from `src/common/guards/`; if not yet extracted, import from `src/admin/admin.module.ts` per R1's gotcha). Six `@HttpCode`-appropriate methods: `GET` (list) `GET :id`, `POST` (201), `PATCH :id`, `PATCH :id/deactivate`, `DELETE :id` (204). All methods delegate to `CategoriesService`
- [X] T019 [US1] Fill `CategoriesService` methods for US1: `listCategories` (Prisma `findMany` + `count` with `status`/`search` filters and pagination), `getCategory` (`findUnique` → throw `NotFoundException` if null), `createCategory` (case-insensitive `findFirst` for existing ACTIVE name → throw `ConflictException`; trim name; `create`), `updateCategory` (validate existence; same case-insensitive collision check when `name` supplied; `update`), `deactivateCategory` (set `status: 'DEACTIVATED'`), `deleteCategory` (`prisma.$transaction` with `tx.doctor.count({ where: { categoryId: id } })` → throw `ConflictException` if > 0, else `tx.category.delete`)
- [X] T020 [P] [US1] Add unit tests in `src/categories/categories.service.spec.ts`: `createCategory` rejects duplicate ACTIVE name (case-insensitive: "Cardiology" vs "cardiology"), `createCategory` trims whitespace, `createCategory` allows a DEACTIVATED duplicate, `updateCategory` rejects rename collision, `deleteCategory` throws 409 and does not call `delete` when `doctor.count > 0` (verify `$transaction` was used), `listPublicCategories` returns ACTIVE only and sorts case-insensitively
- [X] T021 [US1] Run `npm test -- src/categories` — confirm new unit tests pass and existing tests still green
- [X] T022 [US1] Run `test/categories.e2e-spec.ts` against a running dev DB (`docker compose -f docker-compose.dev.yml up -d postgres` + `npm run db:migrate` + `npm run db:seed`) — confirm all US1 e2e scenarios pass

**Checkpoint**: US1 fully functional and independently testable. Super Admin can manage the category catalog end-to-end.

---

## Phase 4: User Story 2 - Super Admin Creates a Doctor Assigned to a Category (Priority: P1)

**Goal**: `POST /api/admin/doctors` requires `categoryId`; rejects missing / non-existent / DEACTIVATED; returns category in response.

**Independent Test**: With an ACTIVE category, `POST /api/admin/doctors` with its `categoryId` returns 201 with the nested `category` object. Without `categoryId` → 400. With a bogus `categoryId` → 404. With a DEACTIVATED `categoryId` → 400.

### Tests for User Story 2 ⚠️

- [X] T023 [P] [US2] Add unit tests in `src/admin/admin.service.spec.ts` for `createDoctor`: missing `categoryId` is rejected by the DTO layer (validation test), non-existent `categoryId` returns 404, DEACTIVATED `categoryId` returns 400, valid ACTIVE `categoryId` succeeds and the returned record includes `category: { id, name }`. Mock `prisma.category.findUnique` to return the appropriate row
- [X] T024 [P] [US2] Add e2e tests in `test/categories.e2e-spec.ts` for the create-doctor flow: 201-with-category for valid input, 400-missing for omitted `categoryId`, 404 for bogus `categoryId`, 400 for DEACTIVATED `categoryId`

### Implementation for User Story 2

- [X] T025 [P] [US2] Update `src/admin/dto/create-doctor.dto.ts` — remove `specialty` field; add required `categoryId` (`@IsString()`, `@IsNotEmpty()`)
- [X] T026 [P] [US2] Update `src/admin/dto/list-doctors.dto.ts` — remove `specialty` filter; add optional `categoryId` (`@IsString()`, `@IsOptional()`)
- [X] T027 [US2] Update `src/admin/admin.service.ts` `createDoctor`: after the DTO passes, call `prisma.category.findUnique({ where: { id: dto.categoryId }, select: { id: true, status: true } })` — throw `NotFoundException` if null, `BadRequestException` if `status !== 'ACTIVE'`. Then create the doctor with `prisma.doctor.create({ data: { ...dto, categoryId: dto.categoryId }, include: { category: { select: { id: true, name: true } } } })` and return the `DoctorRecord` with nested `category`
- [X] T028 [US2] Update `src/admin/admin.service.ts` `listDoctors`: accept the new `categoryId` filter; build the Prisma `where` accordingly. Rewrite the `search` clause to match `name` OR `category.name` (via the relation). Include `category: { select: { id, name } }` in the result
- [X] T029 [US2] Run `npm test` and the new e2e tests for US2 — confirm pass

**Checkpoint**: US2 functional. Admins can create doctors only with valid ACTIVE categoryIds. Listing filters by category.

---

## Phase 5: User Story 3 - Super Admin Updates a Doctor's Category (Priority: P2)

**Goal**: `PATCH /api/admin/doctors/:id` accepts optional `categoryId`; preserves the existing category if omitted; validates like US2 if supplied.

**Independent Test**: Create a doctor under category A, `PATCH` to category B → doctor's `categoryId` is now B. `PATCH` with no body / no `categoryId` → unchanged.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] Add unit tests in `src/admin/admin.service.spec.ts` for `updateDoctor`: omit `categoryId` → existing value preserved (Prisma `update` called without `categoryId` in data), supply valid `categoryId` → updated, supply DEACTIVATED `categoryId` → 400, supply bogus `categoryId` → 404

### Implementation for User Story 3

- [X] T031 [P] [US3] Update `src/admin/dto/update-doctor.dto.ts` — remove `specialty`; add optional `categoryId` (`@IsString()`, `@IsOptional()`); ensure at-least-one-field validation still holds
- [X] T032 [US3] Update `src/admin/admin.service.ts` `updateDoctor`: when `dto.categoryId` is supplied, run the same `findUnique` + status check as US2; then call `prisma.doctor.update({ where: { id }, data: { ...rest, categoryId: dto.categoryId }, include: { category: { select: { id, name } } } })`
- [X] T033 [US3] Run `npm test` and the e2e tests for US3 — confirm pass

**Checkpoint**: US3 functional. Admins can re-categorize a doctor.

---

## Phase 6: User Story 4 - Patients Filter the Doctor Catalog by Category (Priority: P1)

**Goal**: `GET /api/doctors?categoryId=<id>` filters to doctors in that ACTIVE category; combined with `?search=<term>`; legacy `?specialty=` removed.

**Independent Test**: Seed doctors under categories A and B. `?categoryId=<A>` returns only category A doctors (count matches). `?categoryId=<DEACTIVATED>` returns empty array. `?categoryId=<A>&search=<term-A-only>` returns AND result.

### Tests for User Story 4 ⚠️

- [X] T034 [P] [US4] Add e2e tests in `test/categories.e2e-spec.ts` for the public listing with `categoryId`: no filter (regression), `?categoryId=<A>` returns only A doctors, `?categoryId=<A>` + `?search=<A-specific-term>` returns the AND intersection, `?categoryId=<DEACTIVATED>` returns empty array, `?specialty=<text>` is ignored / rejected (verify the legacy param is removed)

### Implementation for User Story 4

- [X] T035 [P] [US4] Update `src/doctors/dto/list-doctors.dto.ts` — remove `specialty`; add optional `categoryId` (`@IsString()`, `@IsOptional()`)
- [X] T036 [US4] Update `src/doctors/doctors.service.ts` `listPublicDoctors`: build the `where` clause with `status: 'ACTIVE'`; if `query.categoryId`, set `categoryId: query.categoryId` AND `category: { status: 'ACTIVE' }`; if `query.search`, set `OR: [{ name: { contains: search, mode: 'insensitive' } }, { category: { name: { contains: search, mode: 'insensitive' } } }]`. Add `include: { category: { select: { id: true, name: true } } }` to the Prisma call. Update the mapper to produce `category: { id, name }` in each record
- [X] T037 [P] [US4] Update unit tests in `src/doctors/doctors.service.spec.ts`: replace the `specialty` filter cases with `categoryId` cases; add a case for the `search` OR-clause now hitting `category.name`; add a case for `categoryId` + DEACTIVATED category → empty
- [X] T038 [US4] Run `npm test` and the e2e tests for US4 — confirm pass; verify the existing public-listing regression cases still pass

**Checkpoint**: US4 functional. Public catalog filterable by category.

---

## Phase 7: User Story 5 - Patients Browse the Category Dropdown (Priority: P1)

**Goal**: `GET /api/categories` returns active categories as `{ id, name }`, sorted alphabetically (case-insensitive); anonymous; cached.

**Independent Test**: Seed multiple ACTIVE categories (and a DEACTIVATED one). `GET /api/categories` returns only ACTIVE rows, sorted, each with `id` + `name`. No auth required (no cookie). Response includes `Cache-Control: public, max-age=300`.

### Tests for User Story 5 ⚠️

- [X] T039 [P] [US5] Add e2e tests in `test/categories.e2e-spec.ts` for the public categories endpoint: returns 200 with `{ categories: [{ id, name }, ...] }`, only ACTIVE rows present, sorted case-insensitively (e.g. "Dermatology" before "cardiology"), empty array when no categories exist, no authentication required (200 without cookie), `Cache-Control: public, max-age=300` header present, rate-limited via `@nestjs/throttler`

### Implementation for User Story 5

- [X] T040 [P] [US5] Create `src/categories/categories.controller.ts` — `@Controller('api/categories')`, single `@Get()` method `list()` returning `{ categories: PublicCategoryDto[] }`. Decorate with `@AllowAnonymous()`, `@Throttle({ default: { limit: 60, ttl: 60_000 } })`, `@Header('Cache-Control', 'public, max-age=300')`, and `@ApiOperation`/`@ApiResponse` Swagger blocks
- [X] T041 [US5] Fill `CategoriesService.listPublicCategories`: `prisma.category.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })` then apply a JS-side `localeCompare(undefined, { sensitivity: 'base' })` as a defensive case-insensitive sort; map to `PublicCategoryDto[]`
- [X] T042 [US5] Run `npm test` and the e2e tests for US5 — confirm pass

**Checkpoint**: US5 functional. Public dropdown is populated.

---

## Phase 8: User Story 6 - Public Doctor Profile Exposes the Category (Priority: P2)

**Goal**: `GET /api/doctors/:id` includes a `category: { id, name }` object; 404 if the doctor OR the doctor's category is DEACTIVATED.

**Independent Test**: Create an ACTIVE doctor under an ACTIVE category → public profile includes `category`. Deactivate the category → public profile returns 404 (consistent with FR-006).

### Tests for User Story 6 ⚠️

- [X] T043 [P] [US6] Add e2e tests in `test/categories.e2e-spec.ts` for the public profile: ACTIVE doctor + ACTIVE category → 200 with `category: { id, name }`; DEACTIVATED doctor → 404 (regression); ACTIVE doctor with DEACTIVATED category → 404 (new)

### Implementation for User Story 6

- [X] T044 [US6] Update `src/doctors/doctors.service.ts` `getPublicDoctor`: `prisma.doctor.findFirst({ where: { id, status: 'ACTIVE', category: { status: 'ACTIVE' } }, include: { category: { select: { id: true, name: true } } } })`; if null, return null (the controller throws 404). Add `category` to the `PublicDoctorRecord` mapper
- [X] T045 [P] [US6] Update unit tests in `src/doctors/doctors.service.spec.ts`: add a case asserting `category: { id, name }` is included for ACTIVE doctor + ACTIVE category; add a case asserting null when the category is DEACTIVATED even if the doctor is ACTIVE
- [X] T046 [US6] Run `npm test` and the e2e tests for US6 — confirm pass

**Checkpoint**: US6 functional. Public profile carries category.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup of legacy `specialty` surface, docs, and end-to-end validation.

- [X] T047 [P] Remove `listSpecialties()` method from `src/doctors/doctors.service.ts` (no longer used)
- [X] T048 [P] Remove the `GET /api/specialties` controller method (and its Swagger block) from `src/doctors/doctors.controller.ts`
- [X] T049 [P] Update `test/doctors-public.e2e-spec.ts`: remove the `specialty`-related test cases and the `specialties` endpoint tests; switch any references to `/api/categories` for the dropdown coverage
- [X] T050 [P] Search the repo for any remaining `specialty` references (`rg -n "specialty" src/ test/ prisma/`) and remove or migrate each one (no source-of-truth references should remain)
- [X] T051 Update `README.md`: add the `Public Categories Endpoint` table (`GET /api/categories`); add the `Admin Categories Endpoints` table under the admin section; replace the `Public Doctor Endpoints` table's `?specialty=` row with `?categoryId=<id>`; add a short note on the `Category` model
- [X] T052 [P] Verify Swagger UI (`/api/docs`) renders all new endpoints correctly and the schemas show `category: { id, name }` (not `specialty`)
- [X] T053 Run `npm test` — all unit + e2e suites pass
- [X] T054 Run `npm run lint` — no new errors introduced
- [X] T055 Run `npm run build` — TypeScript build succeeds
- [X] T056 Run the manual quickstart validation scenarios in `specs/005-doctor-categories/quickstart.md` against a running dev stack (`docker compose -f docker-compose.dev.yml up -d postgres` + `npm run db:migrate` + `npm run db:seed` + `npm run start:dev`) — confirm every scenario passes end-to-end
- [X] T057 Commit and push branch `005-doctor-categories` for review (do NOT merge to `main` until user confirms)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phase 3–8)**: All depend on Foundational completion
  - US1, US2, US4, US5 are P1 (MVP)
  - US3, US6 are P2
  - Stories can be implemented in parallel (different files) but US1 → US2/US3 ordering is recommended (categories must exist before assigning to a doctor)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — independent of other stories
- **US2 (P1)**: Depends on US1 service being functional (uses `Category` table; admin tests for create-doctor need a real category in the DB)
- **US3 (P2)**: Depends on US2 (must be able to create a doctor with a category before testing re-categorization)
- **US4 (P1)**: Depends on US1 + US2 (needs categories and doctors in the DB to filter)
- **US5 (P1)**: Depends on US1 only (reads the category table)
- **US6 (P2)**: Depends on US1 + US2 (needs a doctor with a category)

Recommended sequential order for a solo implementation: **US1 → US5 → US2 → US4 → US3 → US6 → Polish**.

### Within Each User Story

- Tests (T0xx) are written and FAIL before implementation (the [P] marker assumes the test file is the only file touched in that task — fail-then-pass is the expected flow)
- DTOs and service signatures before controllers
- Service bodies before controller wiring
- Story complete (e2e green) before moving to the next priority

### Parallel Opportunities

- All [P] tasks in Phase 2 can run in parallel once T001 is done
- After US1 is complete, US5 can be picked up in parallel with US2 (different controllers, different service methods, different test files)
- US3 can be picked up once US2 is complete; US4 and US6 once US1 + US2 are complete
- All e2e additions to `test/categories.e2e-spec.ts` from US1, US2, US3, US4, US5, US6 are sequential (same file) but each test is a separate `it()` block
- All `npm test` runs in Polish are sequential (same project state)

---

## Parallel Example: User Story 1

```bash
# After Foundational phase is complete:

# 1. Write the e2e test file first (T017) and confirm it FAILS:
Task: "Add e2e tests in test/categories.e2e-spec.ts covering US1"

# 2. In parallel: write the controller (T018) and the unit tests (T020):
Task: "Create src/categories/admin-categories.controller.ts (6 endpoints)"
Task: "Add unit tests in src/categories/categories.service.spec.ts"

# 3. Then fill the service bodies (T019 — depends on T018 controller wiring
#    to compile; can also be done alongside if confident):
Task: "Fill CategoriesService methods for US1 (createCategory, updateCategory, deleteCategory with $transaction, etc.)"

# 4. Run validation:
Task: "Run npm test -- src/categories"
Task: "Run test/categories.e2e-spec.ts against dev DB"
```

---

## Implementation Strategy

### MVP First (US1 + US5)

The minimum viable end-to-end demo is **US1 (admin category CRUD) + US5 (public categories dropdown)**. A Super Admin can sign in, create categories, and an anonymous user can see them in the dropdown — without yet wiring the doctor side.

Order:
1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T016)
3. Phase 3: US1 (T017–T022) — admin CRUD
4. Phase 7: US5 (T039–T042) — public dropdown
5. **STOP and VALIDATE** — admin can manage categories, public dropdown is live

### Incremental Delivery (Recommended)

1. Setup + Foundational → migration live, seed populated, skeleton registered
2. US1 → admin can manage categories
3. US5 → public dropdown live (reads the same table)
4. US2 → admin can create doctors with categories
5. US4 → patients can filter the doctor catalog
6. US3 → admin can re-categorize doctors
7. US6 → public profile includes category
8. Polish → legacy `specialty` removed, docs, lint, build, quickstart validation

### Parallel Team Strategy

For a single maintainer, follow the incremental order above. For two or more:
- After Foundational: one developer on US1, one on the migration validation + seed
- After US1: one on US5 (public controller), one on US2 (admin doctor create) in parallel
- After US2: one on US4 (public filter), one on US3 (admin update) in parallel
- US6 is small enough to fold into US4's PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Write tests first, confirm they FAIL, then implement
- Commit after each task or logical group (e.g. after a complete story is green)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
- Run `rg -n "specialty" src/ test/ prisma/` after Phase 9 to confirm no source-of-truth references remain
