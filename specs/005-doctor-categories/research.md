# Research: Doctor Categories

**Feature**: 005-doctor-categories
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (introduced `Doctor` with free-text `specialty`),
004-doctor-search (introduced the public doctor surface that this feature
modifies).

## R1: New `Category` Feature Module Location

**Decision**: Create a new `src/categories/` feature module with
**two controllers** in the same module: a public
`CategoriesController` (anonymous reads) and an
`AdminCategoriesController` (admin writes), backed by a single
`CategoriesService`.

**Rationale**: The constitution's Principle I ("Feature-Module
Architecture") requires each domain to own its module. `Category`
is a new domain entity with its own lifecycle (CRUD), so it
deserves its own module — not a sub-resource of `admin` or
`doctors`. Splitting the controllers (rather than one controller
with per-route `@AllowAnonymous()` and `@Roles('admin')`) keeps
the auth surface explicit at the class level: the public
controller is implicitly anonymous, the admin controller is
implicitly protected by the existing module-level `RolesGuard`.

**Alternatives considered**:
- Put the admin endpoints in `src/admin/admin.controller.ts`
  (add ~6 methods) and the public endpoint in
  `src/doctors/doctors.controller.ts` — rejected: scatters the
  category surface across two unrelated modules, violates
  Principle I.
- Single controller with mixed decorators — rejected: makes the
  auth surface implicit and harder to audit. The codebase
  already prefers module-level guards over per-method decorators
  (see `admin.controller.ts` `@UseGuards(RolesGuard)` +
  `@Roles('admin')`).
- A `src/lookups/` shared module that holds all vocabulary
  tables (Category, future City, etc.) — premature; defer
  until a second vocabulary table actually exists.

**Key patterns**:
- `src/categories/categories.module.ts` registers the two
  controllers and the `CategoriesService`. Exports the service
  so the admin and public controllers can share it (and so a
  future "appointments" feature could consume it).
- `src/categories/admin-categories.controller.ts` mounts at
  `/api/admin/categories`, applies the same `RolesGuard` +
  `@Roles('admin')` pattern as `src/admin/admin.controller.ts`.
- `src/categories/categories.controller.ts` mounts at
  `/api/categories`, marks the handler `@AllowAnonymous()`.
- `app.module.ts` imports `CategoriesModule` alongside the
  existing `AdminModule` and `DoctorsModule`.

**Gotchas**:
- The `RolesGuard` is provided in `src/admin/admin.module.ts`
  and re-imported by `src/categories/admin-categories.controller.ts`.
  If `RolesGuard` is moved to a shared `src/common/guards/` in
  the future, both controllers can import it from there without
  changes to call sites.
- The public controller's path is `/api/categories` (NOT
  `/api/doctors/categories`) to mirror the existing public
  `GET /api/specialties` shape. The old `/api/specialties`
  endpoint is **removed** — clients are expected to call
  `/api/categories` (no real clients exist yet).

---

## R2: Prisma Schema — `Category` Model

**Decision**: Add a `Category` model to `prisma/schema.prisma`
with the following fields:

```prisma
model Category {
  id        String   @id @default(cuid())
  name      String
  status    String   @default("ACTIVE")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  doctors Doctor[]

  @@unique([name, status])
  @@index([status])
  @@map("category")
}
```

The `@@unique([name, status])` composite unique constraint is the
database-level mechanism for case-insensitive uniqueness within
`ACTIVE` rows: it allows two rows with the same name as long as
one is `DEACTIVATED` (e.g. an old "Cardiology" that was
deactivated, and a new "Cardiology" that is ACTIVE). The
service layer normalizes the name to lowercase and looks up the
existing row before creating a new one, so the application never
hits the unique constraint as an error path for ACTIVE rows.

**Rationale**: Postgres-level case-insensitive uniqueness via
`citext` or a functional unique index (`UNIQUE (LOWER(name))
WHERE status = 'ACTIVE'`) is technically possible but Prisma
does not natively support partial indexes; using a service-level
case-insensitive check before insert is simpler and works across
all Prisma-supported databases (in case the project ever
migrates off Postgres).

**Alternatives considered**:
- `citext` column type for `Category.name` — rejected: not
  supported by all Postgres versions and adds a Prisma-side
  workaround; service-level normalization is portable.
- A separate `Category` table per "namespace" (e.g. one for
  doctors, one for clinics) — rejected: the project has one
  category vocabulary; multi-namespace is over-engineering.
- A JSONB column on `Doctor` with an array of category objects
  — rejected: violates relational normalization; makes
  filtering by category an expensive operation; was already
  rejected in spec design (one category per doctor).

**Key patterns**:
- The `name` field is `String` (not `citext`); the service
  layer trims whitespace and lowercases before the
  case-insensitive lookup.
- The `status` field is `String` (default `"ACTIVE"`) — same
  pattern as `Doctor.status` and `User.isActive` to keep
  Prisma model conventions consistent.
- `doctors Doctor[]` is the back-relation from `Category` to
  `Doctor`. Prisma generates the inverse.

**Gotchas**:
- The composite unique `@@unique([name, status])` does NOT
  enforce case-insensitive uniqueness at the DB level — only
  exact-match uniqueness on `(name, status)`. The service
  MUST enforce the case-insensitive invariant for ACTIVE rows.
  If a future contributor adds an "import categories from CSV"
  feature, the importer MUST call the service (not write
  directly to the DB) to keep the invariant.
- A re-activation flow (e.g. a DEACTIVATED "Cardiology"
  reactivated) will hit the unique constraint if an ACTIVE
  "Cardiology" already exists with the same exact case. The
  service MUST either reject the reactivation or merge the
  rows. For v1, the simplest behavior is to reject with a
  409 "another ACTIVE category with this name already
  exists" — preserving data integrity.

---

## R3: `Doctor` Schema Change — Drop `specialty`, Add `categoryId`

**Decision**: Modify the `Doctor` model:

```prisma
model Doctor {
  id         String   @id @default(cuid())
  name       String
  categoryId String
  bio        String?
  imageUrl   String?
  status     String   @default("ACTIVE")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  category Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([status])
  @@index([categoryId])
  @@map("doctor")
}
```

`onDelete: Restrict` prevents deleting a `Category` that has
doctors — the application-level check in the service is the
primary defense, and the FK constraint is a backstop.

**Rationale**: `Restrict` is the strictest referential behavior
and matches the spec's FR-013 (deletion rejected with 409 when
doctors reference the category). `Cascade` would be wrong (it
would delete doctors when a category is deleted, which is data
loss). `SetNull` would violate the `NOT NULL` constraint on
`categoryId`. `NoAction` is Postgres' default and equivalent to
`Restrict` in practice, but Prisma's `Restrict` makes the
intent explicit.

**Alternatives considered**:
- `onDelete: SetNull` — rejected: violates the `NOT NULL`
  invariant.
- `onDelete: Cascade` — rejected: deletes doctors on category
  delete; data loss.
- Application-level FK only (no Prisma `relation`) — rejected:
  loses Prisma's `include: { category: true }` ergonomics and
  the FK constraint as a backstop.

**Key patterns**:
- The migration adds the `categoryId` column as nullable,
  backfills it from the `specialty` values, then alters the
  column to NOT NULL, then drops the `specialty` column. This
  is the safe pattern for adding a NOT NULL column with a
  backfill (see R8 for the data migration).
- The `@@index([categoryId])` index supports the new public
  `?categoryId=` filter and the admin `?categoryId=` filter.

**Gotchas**:
- The `specialty` column is dropped, not renamed or kept for
  backward compatibility. Any concurrent code that references
  `Doctor.specialty` MUST be updated in the same migration
  commit (the admin DTOs, the admin service, the public DTOs,
  the public service, the test fixtures, the seed). The
  implementation phase MUST grep for `specialty` across the
  repo before merging.
- Prisma's `@@index([categoryId])` creates a B-tree index on
  the FK column, which is the right index for equality filters
  and JOINs. Postgres would create this index automatically
  for the FK (without `@@index`) — Prisma's explicit
  `@@index` is a no-op for the FK index but is kept for
  documentation and to make the intent explicit.

---

## R4: Data Migration Strategy

**Decision**: A single Prisma migration file
`prisma/migrations/YYYYMMDDHHMMSS_add_categories/migration.sql`
performs the schema change AND the data backfill in one
transaction. The migration is **idempotent** (safe to re-run).

The migration's SQL (in concept — the actual file will be
written by Prisma's `prisma migrate dev` with a hand-edited
SQL step for the data backfill):

```sql
-- 1. Create the Category table
CREATE TABLE "category" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX "category_name_status_key" ON "category"("name", "status");
CREATE INDEX "category_status_idx" ON "category"("status");

-- 2. Add nullable categoryId to doctor
ALTER TABLE "doctor" ADD COLUMN "categoryId" TEXT;

-- 3. Backfill: for each distinct specialty, create a Category row
-- (or skip if an ACTIVE Category with the same case-sensitive name
-- already exists from a partial prior run).
INSERT INTO "category" ("id", "name", "status", "createdAt", "updatedAt")
SELECT
  'cat_' || md5(random()::text) || '_' || row_number() OVER () AS id,
  DISTINCT_SPECIALTY.name,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "specialty" AS name FROM "doctor"
  WHERE "specialty" IS NOT NULL AND length(trim("specialty")) > 0
) AS DISTINCT_SPECIALTY
WHERE NOT EXISTS (
  SELECT 1 FROM "category" c
  WHERE c."name" = DISTINCT_SPECIALTY.name AND c."status" = 'ACTIVE'
);

-- 4. Add the "General" fallback for doctors with empty/missing specialty
--    (only created if such doctors exist).
INSERT INTO "category" ("id", "name", "status", "createdAt", "updatedAt")
SELECT 'cat_general_fallback', 'General', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "doctor" WHERE "specialty" IS NULL OR length(trim("specialty")) = 0
)
AND NOT EXISTS (
  SELECT 1 FROM "category" WHERE "name" = 'General' AND "status" = 'ACTIVE'
);

-- 5. Backfill doctor.categoryId from the matching category row
UPDATE "doctor" d
SET "categoryId" = c."id"
FROM "category" c
WHERE c."name" = d."specialty" AND c."status" = 'ACTIVE'
  AND (d."specialty" IS NOT NULL AND length(trim(d."specialty")) > 0);

-- 6. Backfill doctors with empty/missing specialty to "General"
UPDATE "doctor" d
SET "categoryId" = (SELECT "id" FROM "category" WHERE "name" = 'General' AND "status" = 'ACTIVE' LIMIT 1)
WHERE "categoryId" IS NULL;

-- 7. NOW it is safe to make categoryId NOT NULL
ALTER TABLE "doctor" ALTER COLUMN "categoryId" SET NOT NULL;

-- 8. Add the FK + index
ALTER TABLE "doctor" ADD CONSTRAINT "doctor_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT;
CREATE INDEX "doctor_categoryId_idx" ON "doctor"("categoryId");

-- 9. Drop the legacy specialty column + its index
DROP INDEX IF EXISTS "doctor_specialty_idx";
ALTER TABLE "doctor" DROP COLUMN "specialty";
```

**Rationale**: Doing the schema change and the data backfill
in a single migration file (and a single transaction) is the
canonical Prisma pattern for destructive schema changes. The
idempotency guards (`NOT EXISTS` checks) make the migration
safe to re-run if a partial failure leaves the database in
an intermediate state.

**Alternatives considered**:
- Two migrations: one to add `Category` + nullable `categoryId`,
  one to make it `NOT NULL` and drop `specialty` — rejected:
  doubles the migration surface area and creates a window where
  the schema is in an intermediate (nullable) state. A single
  migration is atomic.
- TypeScript migration script via `prisma migrate dev --create-only`
  + hand-written `migration.sql` — the chosen approach. The
  TypeScript seed (`prisma/seed.ts`) is separate and runs
  application-level data, not schema changes.
- A separate ad-hoc backfill script run after the migration —
  rejected: requires operators to remember a manual step.

**Key patterns**:
- The migration file is generated by `npx prisma migrate dev
  --create-only --name add_categories`, then hand-edited to
  insert the data-backfill SQL between the schema changes.
- The migration is run automatically on `npm run db:migrate` and
  on application startup (per the existing `prisma.config.ts`).

**Gotchas**:
- The migration assumes the existing data has a `specialty`
  column. If the migration is run on a fresh database (no
  doctors), the `INSERT` statements no-op and the result is
  the `category` table with zero rows + the `doctor` table
  unchanged. This is correct.
- The "General" fallback row is only created if at least one
  doctor has an empty/null `specialty`. On a fresh database,
  no "General" row is created — the seed script (R7) creates
  the standard categories including "General Practice" (a
  distinct row).
- The migration uses `md5(random()::text)` for fallback cuid
  generation. This is not a true cuid but is a 32-char string
  unique within the table. The application-level code never
  assumes a specific format; the `@default(cuid())` annotation
  on the Prisma model only fires for new rows created by the
  application, not for migration-inserted rows.

---

## R5: Admin Category Endpoints

**Decision**: Six endpoints under `/api/admin/categories`,
mirroring the structure of the existing `/api/admin/doctors`
endpoints (feature 003):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/categories` | List (paginated, filters: `status`, `search`) |
| `GET` | `/api/admin/categories/:id` | Get one |
| `POST` | `/api/admin/categories` | Create (requires `name`; status defaults to `ACTIVE`) |
| `PATCH` | `/api/admin/categories/:id` | Partial update (name and/or status) |
| `PATCH` | `/api/admin/categories/:id/deactivate` | Soft-deactivate |
| `DELETE` | `/api/admin/categories/:id` | Hard delete (rejected 409 if any doctor references) |

**Rationale**: Symmetry with the existing admin doctor endpoints
keeps the admin UI simple and the controller methods
discoverable. The "deactivate" sub-resource pattern (a separate
`PATCH /:id/deactivate` endpoint rather than a generic status
toggle) matches the existing `PATCH /api/admin/doctors/:id/
deactivate` pattern from feature 003.

**Alternatives considered**:
- Combine `PATCH` (name + status) and `PATCH /:id/deactivate`
  into a single endpoint — rejected: the explicit "deactivate"
  endpoint provides a clear audit-trail-friendly action
  ("deactivate" vs. "update name+status in one call").
- Allow `DELETE` to cascade and delete the doctors — rejected:
  data loss; the spec explicitly requires 409.

**Key patterns**:
- `CreateCategoryDto` validates `name` (required, string, 1-100
  chars, trimmed). `status` is optional and defaults to
  `ACTIVE` in the service.
- `UpdateCategoryDto` validates `name` (optional, 1-100 chars)
  and `status` (optional, enum: `ACTIVE` | `DEACTIVATED`).
- The `list` endpoint supports `status` and `search` filters
  (search matches `name` case-insensitive substring) and
  pagination (`page`, `pageSize` with the same caps as the
  doctor listing).
- The service enforces case-insensitive uniqueness for ACTIVE
  rows: a `findFirst` lookup on `{ name: { equals: input, mode:
  'insensitive' }, status: 'ACTIVE' }` is performed before
  `create`; if a row exists, return 409.

**Gotchas**:
- The `name` field in `CreateCategoryDto` MUST be transformed
  via `class-transformer`'s `@Transform(({ value }) => value.
  trim())` to strip leading/trailing whitespace before
  validation; otherwise a name like "  Cardiology  " would
  pass validation but create a row that doesn't match
  subsequent exact-match lookups.
- The "update name" path must also check for case-insensitive
  collisions with other ACTIVE categories before applying the
  update. The check is the same as the create-time check.
- The `DELETE` endpoint wraps the `doctor.count` and the
  `category.delete` in a `prisma.$transaction` to prevent a
  race condition (see R10).

---

## R6: Public Categories Endpoint

**Decision**: A single endpoint `GET /api/categories` that
returns the active categories as `{ id, name }` records, sorted
alphabetically by name (case-insensitive), with no duplicates.
Anonymous (no authentication). Replaces the previous
`GET /api/specialties` endpoint.

**Rationale**: This is the public read counterpart of the admin
CRUD. The endpoint is the data source for the patient dropdown
in the UI; it returns structured records (id + name) so the
client can issue a follow-up `?categoryId=<id>` filter without
re-typing the name.

**Alternatives considered**:
- Keep the old `GET /api/specialties` as a backward-compat
  shim that proxies to `GET /api/categories` — rejected: no
  real clients exist; shimming costs code and tests.
- Inline the categories into the public doctor listing
  response (`doctors: [...], categories: [...]`) — rejected:
  the public listing can be called without the categories
  dropdown being relevant; keeping the surface minimal aids
  caching (the categories endpoint can be cached longer than
  the listing).

**Key patterns**:
- `@AllowAnonymous()` on the controller method.
- `@Throttle({ default: { limit: 60, ttl: 60_000 } })` (matches
  the listing endpoint's rate limit).
- `@Header('Cache-Control', 'public, max-age=300')` (300s
  TTL; longer than the listing's 60s because categories change
  less frequently than the doctor catalog).
- Service query:
  ```ts
  prisma.category.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  ```
  The `orderBy` is case-sensitive by default in Postgres; the
  service applies a JS-side case-insensitive sort as a
  defensive measure to match the spec's "case-insensitive
  alphabetical" requirement.

**Gotchas**:
- The old `GET /api/specialties` endpoint in
  `src/doctors/doctors.controller.ts` MUST be removed. The
  `listSpecialties()` method in `src/doctors/doctors.service.ts`
  MUST be deleted. The e2e tests for specialties
  (`doctors-public.e2e-spec.ts`) MUST be updated to call
  `/api/categories` instead.

---

## R7: Seed Script Update

**Decision**: The existing `src/seed/seed.ts` is extended to
seed a default set of 5 categories after the Super Admin is
created:

```ts
const defaultCategories = [
  'Cardiology',
  'Pediatrics',
  'Dermatology',
  'Orthopedics',
  'General Practice',
];

for (const name of defaultCategories) {
  await prisma.category.upsert({
    where: { id: `seed_${name.toLowerCase().replace(/\s+/g, '_')}` },
    update: {},
    create: {
      id: `seed_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      status: 'ACTIVE',
    },
  });
}
```

The seed is idempotent (uses `upsert` with a stable
deterministic id derived from the name), so re-running the
seed does not duplicate categories.

**Rationale**: A freshly seeded environment with no categories
would be unusable for the doctor CRUD (the create-doctor
endpoint would reject every request with "no ACTIVE
categories"). Seeding a default vocabulary unblocks the
admin UI immediately after a fresh install. The categories
are admin-editable after creation (the admin can rename or
delete any of them).

**Alternatives considered**:
- Hard-code categories only in the migration (so they always
  exist regardless of whether the seed ran) — rejected: the
  seed is the natural place for "default data" per the
  existing pattern; mixing data into a schema migration blurs
  the boundary.
- No seed for categories (let admins create them) — rejected:
  blocks the first admin action on a fresh install.

**Key patterns**:
- The seed is run via `npm run db:seed` (existing script).
- The category seed runs **after** the Super Admin seed
  (independent operation; no auth needed since it's
  application-level).
- The seed uses stable deterministic ids
  (`seed_cardiology`, etc.) so re-running upserts rather than
  creating duplicates.

**Gotchas**:
- The deterministic id approach is a hack to make `upsert` work
  without a real `@@unique` constraint on `name`. The
  service-level check (R5) is the authoritative uniqueness
  enforcement; the seed id is only for idempotency. A future
  refactor could use `upsert` with a different `where` clause
  (Prisma supports composite where on multiple fields).
- The seed only runs on a clean database. If a real
  environment already has categories (post-migration), the
  seed is a no-op for existing categories (the `update: {}`
  means "don't change anything"). The 5 default categories
  are added only on a fresh install.

---

## R8: Modifications to Admin Doctor Endpoints

**Decision**: The existing `src/admin/admin.controller.ts` and
`src/admin/admin.service.ts` are modified as follows:

- `CreateDoctorDto`: drop `specialty`; add required `categoryId`
  (string, cuid format).
- `UpdateDoctorDto`: drop `specialty`; add optional `categoryId`.
- `ListDoctorsDto`: drop `specialty` filter; add optional
  `categoryId` filter.
- `AdminService.createDoctor`: after validating the input DTO,
  look up the category (`findUnique` on `Category.id`); throw
  404 if not found; throw 400 if `status !== 'ACTIVE'`. Then
  create the doctor with the validated `categoryId`.
- `AdminService.updateDoctor`: same validation when
  `categoryId` is supplied; partial-update semantics
  (omitting `categoryId` preserves the existing value).
- `AdminService.listDoctors`: filter by `categoryId` (FK
  equality) instead of `specialty`. The `search` filter is
  unchanged in behavior (still matches `name` and the doctor's
  category name via the `category: { name: ... }` relation).
- The `DoctorRecord` type returned by all admin methods is
  extended to include `category: { id: string; name: string }`
  (populated via Prisma `include: { category: true }`).

**Rationale**: This is the literal "ask for its category" path
the user requested. The validation is inline (a single
`findUnique` lookup) rather than a service-to-service call to
`CategoriesService` to keep the modules loosely coupled
(Principle II). The category validation logic is duplicated in
`updateDoctor` — acceptable per the Complexity Tracking in
`plan.md`.

**Alternatives considered**:
- Service-to-service call to `CategoriesService.validateAndGet
  (id)` — rejected: introduces a cross-module import; the
  inline Prisma lookup is ~5 lines.
- Database-level FK constraint as the only validation — rejected:
  the FK enforces existence but not the `status === 'ACTIVE'`
  constraint; the service must check both.
- Two-step create (create with `categoryId: null`, then update
  to set `categoryId`) — rejected: the column is NOT NULL, so
  two-step is impossible; the service must validate before
  creating.

**Key patterns**:
- The validation pattern:
  ```ts
  const category = await this.prisma.category.findUnique({
    where: { id: dto.categoryId },
    select: { id: true, status: true },
  });
  if (!category) {
    throw new NotFoundException('Category not found');
  }
  if (category.status !== 'ACTIVE') {
    throw new BadRequestException(
      'Cannot assign a doctor to a deactivated category',
    );
  }
  ```
- The `DoctorRecord` type is updated to include the nested
  `category` object. Existing callers (admin UI, swagger docs)
  get the new field "for free" via the service's return type.
- The `listDoctors` `search` filter is rewritten to match
  against `name` OR `category.name` (via the relation):
  ```ts
  where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { category: { name: { contains: search, mode: 'insensitive' } } },
  ];
  ```

**Gotchas**:
- The `categoryId` cuid validation in the DTO is best-effort
  (string format); the service's `findUnique` is the
  authoritative existence check.
- The `search` filter rewrite changes the query plan: a
  relation filter requires a JOIN, which is slightly more
  expensive than the previous flat-field filter. With
  `@@index([categoryId])` and the existing `@@index([name])`
  (none currently — name has no index), the query is still
  fast at the expected catalog size. If performance degrades
  at scale, a `pg_trgm` GIN index on `category.name` would be
  a future optimization.

---

## R9: Modifications to Public Doctor Endpoints

**Decision**: The existing `src/doctors/doctors.controller.ts`
and `src/doctors/doctors.service.ts` are modified as follows:

- `ListPublicDoctorsDto`: drop `specialty`; add optional
  `categoryId` (string, cuid format).
- `DoctorsService.listPublicDoctors`: filter by `categoryId`
  (FK equality, joined with `category` to also require
  `category.status === 'ACTIVE'`). The `search` filter is
  rewritten to match `name` OR `category.name` via the
  relation.
- `DoctorsService.getPublicDoctor`: include the category in the
  response. The 404 behavior for DEACTIVATED doctors is
  unchanged.
- `DoctorsService.listSpecialties`: DELETED. The method is
  replaced by the new `CategoriesService.listPublicCategories`
  in the `src/categories/` module.
- The public `GET /api/specialties` endpoint is REMOVED from
  `DoctorsController`. The new `GET /api/categories` endpoint
  in `CategoriesController` is the replacement.
- The `PublicDoctorRecord` type is extended to include
  `category: { id: string; name: string }`.

**Rationale**: The public surface is the patient-facing funnel;
the response must be structured (`category: { id, name }`) so
the client can render a clickable category badge that links to
`?categoryId=<id>`. The `specialty` string is replaced by the
structured `category` object everywhere.

**Alternatives considered**:
- Keep the legacy `?specialty=<text>` filter for backward
  compat — rejected: no real clients exist; the spec explicitly
  removes it. A shim would require a service-side lookup
  (`specialty → categoryId`) on every request, which is wasted
  work.
- Inline a category list in each listing response — rejected:
  duplicates the public categories endpoint; makes the
  response harder to cache.

**Key patterns**:
- The listing query:
  ```ts
  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    ...(query.categoryId && { categoryId: query.categoryId }),
  };
  if (query.categoryId) {
    // Ensure the category itself is ACTIVE — joins via the relation
    where.category = { status: 'ACTIVE' };
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { category: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  ```
- The profile query:
  ```ts
  const doctor = await prisma.doctor.findFirst({
    where: { id, status: 'ACTIVE', category: { status: 'ACTIVE' } },
    include: { category: { select: { id: true, name: true } } },
  });
  ```
- The `toPublicRecord` mapper builds the response shape
  including the nested `category` object.

**Gotchas**:
- The DEACTIVATED-doctor 404 behavior (feature 004, FR-006) is
  preserved: a doctor with `status: 'DEACTIVATED'` returns 404
  even if their category is ACTIVE. The new behavior adds: a
  doctor with `status: 'ACTIVE'` whose category is
  `DEACTIVATED` ALSO returns 404 (consistent with the spec's
  "doctors are not exposed if the doctor OR the doctor's
  category is not ACTIVE" rule).
- The `Cache-Control: max-age=60` on the listing is
  preserved. The new `category` field is a small addition to
  the JSON response (no significant size impact).

---

## R10: Race Condition on `DELETE /api/admin/categories/:id`

**Decision**: The delete flow is wrapped in a Prisma
`$transaction`:

```ts
await this.prisma.$transaction(async (tx) => {
  const referencingCount = await tx.doctor.count({
    where: { categoryId: id },
  });
  if (referencingCount > 0) {
    throw new ConflictException({ ... });
  }
  await tx.category.delete({ where: { id } });
});
```

**Rationale**: Without the transaction, an admin could start a
delete and a concurrent create-doctor request could create a
new doctor referencing the category between the count and the
delete — leaving an orphaned doctor. The transaction
serializes the count + delete against any other write touching
the same `categoryId`.

**Alternatives considered**:
- Rely on the FK `ON DELETE RESTRICT` constraint to throw on
  the delete — accepted as a backstop but NOT as the primary
  defense. The constraint returns a generic Postgres error
  (e.g. `foreign_key_violation`), which would surface as a 500
  to the client. The application-level check converts it to a
  clean 409 with a user-friendly message.
- Use `SERIALIZABLE` isolation level on the transaction —
  rejected: Postgres' default `READ COMMITTED` is sufficient
  here because the FK constraint serializes the create
  against the delete; we just need a clean 409 vs. 500 path.

**Key patterns**:
- The transaction body is small (~5 lines) and completes in
  single-digit milliseconds.
- The `ConflictException` payload matches the existing pattern
  in `admin.service.ts` for the "already deactivated" error
  (e.g. `{ message: '...', error: 'category_in_use' }`).

**Gotchas**:
- The transaction's `tx` argument is the same shape as
  `prisma` but isolated; passing `tx` (not `prisma`) to the
  count + delete is critical.
- The error message must NOT leak the count of referencing
  doctors (information disclosure); a generic "category is in
  use by one or more doctors" is sufficient.

---

## R11: DTOs and Validation

**Decision**: New DTOs in `src/categories/dto/`:

- `CreateCategoryDto`: `name` (required, string, 1-100 chars,
  `@Transform` to trim), `status` (optional, enum
  `ACTIVE | DEACTIVATED`, defaults to `ACTIVE`).
- `UpdateCategoryDto`: same fields, all optional.
- `ListCategoriesDto`: `status` (optional enum), `search`
  (optional, 1-100 chars), `page` (int >= 1, default 1),
  `pageSize` (int 1-100, default 20).
- `CategoryResponseDto`: `{ id, name, status, createdAt,
  updatedAt }` (for admin responses) and a slim
  `PublicCategoryDto` of `{ id, name }` (for the public
  endpoint).

Modifications to existing DTOs:

- `CreateDoctorDto` (`src/admin/dto/create-doctor.dto.ts`):
  drop `specialty`; add required `categoryId` (string, cuid).
- `UpdateDoctorDto` (`src/admin/dto/update-doctor.dto.ts`):
  drop `specialty`; add optional `categoryId`.
- `ListDoctorsDto` (`src/admin/dto/list-doctors.dto.ts`):
  drop `specialty`; add optional `categoryId`.
- `ListPublicDoctorsDto` (`src/doctors/dto/list-doctors.dto.ts`):
  drop `specialty`; add optional `categoryId`.

**Rationale**: The DTOs are the single source of truth for API
contracts. NestJS's `ValidationPipe` (global) automatically
rejects requests with missing/invalid fields, returning 400 with
descriptive messages — the implementation does not need custom
validation code.

**Alternatives considered**:
- Use a single `CategoryIdParam` DTO with `@IsUUID()` (cuid
  is a subset) — rejected: NestJS string validators work
  fine; an explicit `@IsString()` is sufficient. A more
  restrictive `@Matches(/^c[a-z0-9]{24,}$/)` regex could
  enforce the cuid prefix but is over-engineering for v1.

**Key patterns**:
- The `@Transform(({ value }) => value?.trim())` decorator on
  `name` is from `class-transformer`. The `@IsString()` +
  `@MinLength(1)` + `@MaxLength(100)` validators handle
  length and type.
- The `status` field uses `@IsIn(['ACTIVE', 'DEACTIVATED'])`
  (same pattern as `Doctor.status` in `update-doctor.dto.ts`).

**Gotchas**:
- The `@Transform` runs BEFORE the validators. A request with
  `name: '   '` (whitespace only) becomes `name: ''` after
  trim, which then fails `@MinLength(1)` — returning 400.
- The `categoryId` field in the doctor DTOs is `@IsString()`
  with no length cap. The Prisma `findUnique` rejects invalid
  ids with a Prisma-side error, which the service catches and
  converts to 404. Length validation could be added as
  `@MaxLength(64)` for defense in depth.

---

## R12: Testing Strategy

**Decision**: Three test layers:

1. **Unit tests** for `CategoriesService` in
   `src/categories/categories.service.spec.ts`:
   - `createCategory` rejects duplicate ACTIVE name
     (case-insensitive).
   - `createCategory` trims whitespace.
   - `createCategory` accepts a deactivated duplicate of an
     existing ACTIVE name (per R2's invariant).
   - `updateCategory` rejects renaming to an existing ACTIVE
     name.
   - `deleteCategory` rejects when doctors reference it (counts
     via the Prisma mock; the `$transaction` is verified by
     checking that the count mock is called before the delete
     mock).
   - `listPublicCategories` returns only ACTIVE rows, sorted
     case-insensitively.

2. **Unit tests** for modified `AdminService` (extend the
   existing `admin.service.spec.ts`):
   - `createDoctor` rejects missing `categoryId`.
   - `createDoctor` rejects non-existent `categoryId` (404).
   - `createDoctor` rejects `categoryId` with status
     `DEACTIVATED` (400).
   - `createDoctor` succeeds with valid ACTIVE `categoryId`.
   - `updateDoctor` preserves the existing `categoryId` when
     not supplied.
   - `listDoctors` filters by `categoryId` correctly.

3. **E2E tests** in `test/categories.e2e-spec.ts` (new file):
   - Admin can create, list, edit, deactivate, and delete a
     category.
   - Admin cannot create a doctor without a `categoryId`.
   - Admin cannot create a doctor with a non-existent
     `categoryId` (404).
   - Admin cannot create a doctor with a DEACTIVATED
     `categoryId` (400).
   - Public `GET /api/categories` returns only ACTIVE
     categories, sorted.
   - Public `GET /api/doctors?categoryId=<id>` filters
     correctly.
   - Public doctor profile includes the `category` object.
   - Public `GET /api/specialties` is gone (404).
   - Public `GET /api/doctors?specialty=<text>` is gone
     (the param is ignored or returns 400 — decide during
     implementation; the spec says it's removed).
   - The data migration: a fresh database seeded with the
     default 5 categories can have doctors created against
     them.
   - Backward-compat: a pre-migration database with doctors
     having `specialty` values is migrated correctly (tested
     by seeding a doctor with a specialty before the
     migration, then re-running the migration — covered by a
     separate test fixture).

**Rationale**: Mirrors the testing pattern from features 003
and 004. The e2e tests are gated on `DATABASE_URL` like the
other e2e tests.

**Alternatives considered**:
- Skip the e2e tests for the data migration — rejected: the
  migration is the riskiest part of this feature; an
  automated test catches regressions in a way a manual check
  cannot.
- Mock Prisma entirely in unit tests — the existing pattern
  (see `admin.service.spec.ts`) is to mock the Prisma client
  with `jest.fn()` and stub the relevant methods. Follow the
  same pattern.

**Gotchas**:
- The e2e tests for the migration require a "pre-migration"
  database state. The simplest pattern: a separate e2e test
  file (`test/categories-migration.e2e-spec.ts`) that runs
  against a database seeded with doctors having the legacy
  `specialty` column, then runs the migration, then asserts
  the new state. This file is gated on a separate
  `RUN_MIGRATION_TESTS=1` env var so it doesn't run in the
  default CI pipeline (which uses a fresh DB).
- The unit tests for `AdminService.createDoctor` need to mock
  the new `prisma.category.findUnique` call. Update the
  `mockPrisma()` helper in `admin.service.spec.ts` to include
  `category: { findUnique: jest.fn() }`.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Module location | New `src/categories/` module with two controllers (public + admin) |
| Schema: `Category` | New model with composite unique on `(name, status)`; case-insensitive ACTIVE uniqueness enforced in service |
| Schema: `Doctor` | Drop `specialty`; add `categoryId` (NOT NULL, FK → `Category.id`, `onDelete: Restrict`) |
| Data migration | Single Prisma migration with idempotent SQL backfill; "General" fallback for empty specialties |
| Admin endpoints | 6 endpoints under `/api/admin/categories` (list, get, create, patch, deactivate, delete) |
| Public endpoint | `GET /api/categories` — anonymous, ACTIVE only, case-insensitive sort |
| DTOs | New DTOs in `src/categories/dto/`; admin and public doctor DTOs swap `specialty` for `categoryId` |
| Validation | Inline Prisma `findUnique` for category existence + `status` check (no cross-module service call) |
| Delete safety | `$transaction` around the count + delete to prevent orphan race |
| Cache headers | `max-age=300` for public categories (was `max-age=600` for specialties; reduced because the vocabulary is now editable via the admin CRUD) |
| Rate limit | `60 req/min` on the public categories endpoint (matches the listing) |
| Old endpoints | `GET /api/specialties` is REMOVED; `?specialty=` filter is REMOVED |
| Seed | Seed script adds 5 default categories (idempotent via deterministic ids) |
| Tests | Unit + e2e mirroring the patterns from features 003 and 004; dedicated migration e2e |
