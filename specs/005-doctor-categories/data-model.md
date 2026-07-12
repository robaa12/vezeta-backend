# Data Model: Doctor Categories

**Feature**: 005-doctor-categories
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (introduced `Doctor`),
004-doctor-search (introduced the public doctor surface that this
feature modifies).

## Overview

This feature introduces a new `Category` domain table and
modifies the existing `Doctor` table. The free-text `specialty`
column on `Doctor` is replaced by a `categoryId` foreign key
pointing to `Category.id`. A one-time data migration backfills
the `Category` table from the distinct values of the legacy
`Doctor.specialty` column. All doctor read responses (admin,
public, swagger) expose a structured `category: { id, name }`
object instead of the legacy `specialty` string.

## Entities

### Category (new)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| name | String | required, 1-100 chars, trimmed | Display name (e.g. "Cardiology") |
| status | String | default: `"ACTIVE"` | Enum: `"ACTIVE"` or `"DEACTIVATED"` |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Constraints**:
- `@@unique([name, status])` at the DB level — enforces exact-
  match uniqueness on the (name, status) pair. Case-insensitive
  uniqueness for ACTIVE rows is enforced in the service layer
  (R2 in `research.md`).
- `@@index([status])` — supports the public `GET /api/
  categories` query (filter to ACTIVE).
- The `doctors Doctor[]` back-relation is the 1:N edge from
  `Category` to `Doctor` (one category, many doctors).
- `onDelete: Restrict` on the `Doctor.categoryId` FK — a
  category that still has referencing doctors cannot be
  deleted at the DB level. The service's `$transaction` check
  is the application-level defense (see R10 in `research.md`).

**State transitions**:
- Default state on creation: `ACTIVE`.
- `ACTIVE` → `DEACTIVATED` (admin `PATCH /:id/deactivate` or
  `PATCH /:id` with `status: "DEACTIVATED"`). The public
  surfaces (listing, profile, categories endpoint) hide
  doctors assigned to a DEACTIVATED category.
- `DEACTIVATED` → `ACTIVE` (admin `PATCH /:id` with
  `status: "ACTIVE"`). The service must reject the
  reactivation if another ACTIVE category with the same name
  already exists (R2 invariant).
- `DEACTIVATED` (or `ACTIVE` with no referencing doctors) →
  deleted (admin `DELETE /:id`). Deleted rows are gone; this
  is a hard delete.

### Doctor (modified)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier (unchanged) |
| name | String | required, 2-120 chars | Doctor's full name (unchanged) |
| **categoryId** | **String (cuid)** | **NOT NULL, FK → Category.id, onDelete: Restrict** | **NEW** — references the doctor's category |
| ~~specialty~~ | ~~String~~ | ~~DROPPED~~ | ~~Removed in this migration~~ |
| bio | String? | nullable, max 2000 chars | Short biography (unchanged) |
| imageUrl | String? | nullable, valid URL, max 2048 chars | Profile photo URL (unchanged) |
| status | String | default: `"ACTIVE"` | Enum: `"ACTIVE"` or `"DEACTIVATED"` (unchanged) |
| createdAt | DateTime | auto | Creation timestamp (unchanged) |
| updatedAt | DateTime | auto | Last update timestamp (unchanged) |

**New constraint**:
- `@@index([categoryId])` — supports the public and admin
  `?categoryId=` filter and the relation join.

**Net effect on the public response**:
- The `specialty` field is gone; replaced by a nested
  `category` object (see "Public response shape" below).

### New derived concept: `PublicCategory`

A flat list of `{ id, name }` records — the ACTIVE categories
in the database. Built at query time:

```ts
prisma.category.findMany({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});
```

No new database table (the `Category` table is the source of
truth). The `@@index([status])` index supports the filter.

## Entity Relationship

```
┌──────────────────────┐
│      Category        │
├──────────────────────┤
│ id (PK)              │
│ name                 │  ← part of composite unique (name, status)
│ status               │  ← part of composite unique, indexed
│ createdAt            │
│ updatedAt            │
└──────────────────────┘
            ▲
            │ 1
            │
            │ N
            │
┌──────────────────────┐
│       Doctor         │
├──────────────────────┤
│ id (PK)              │
│ name                 │
│ categoryId (FK)      │  ← indexed
│ bio?                 │
│ imageUrl?            │
│ status               │  ← indexed
│ createdAt            │
│ updatedAt            │
└──────────────────────┘
```

**Relationship**: `Category (1) — (N) Doctor`. One category is
referenced by many doctors; each doctor has exactly one
category.

## Public response shape (Doctor)

The public response for a doctor is now:

```json
{
  "id": "clx...",
  "name": "Dr. Jane Smith",
  "category": {
    "id": "cat_abc123",
    "name": "Cardiology"
  },
  "bio": "20 years of experience in interventional cardiology.",
  "imageUrl": "https://cdn.example.com/jane.jpg",
  "status": "ACTIVE",
  "createdAt": "2026-07-11T10:00:00Z",
  "updatedAt": "2026-07-11T10:00:00Z"
}
```

The `specialty` field is gone. The `category` object is
populated via a Prisma `include: { category: { select: { id:
true, name: true } } }` join.

## Query Patterns

### Public Listing (modified from feature 004)

```ts
const where: Record<string, unknown> = {
  status: 'ACTIVE',
};
if (query.categoryId !== undefined) {
  where.categoryId = query.categoryId;
  // Require the category itself to be ACTIVE — filter via the relation
  where.category = { status: 'ACTIVE' };
}
if (query.search !== undefined && query.search.length > 0) {
  where.OR = [
    { name: { contains: query.search, mode: 'insensitive' } },
    { category: { name: { contains: query.search, mode: 'insensitive' } } },
  ];
}

const [records, total] = await Promise.all([
  prisma.doctor.findMany({
    where,
    include: { category: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  }),
  prisma.doctor.count({ where }),
]);
```

**Index usage**:
- `@@index([status])` for the `status: 'ACTIVE'` filter.
- `@@index([categoryId])` for the `categoryId` equality filter
  and the relation join.
- For `name` substring search: no dedicated index. Postgres
  falls back to a sequential scan filtered by ILIKE. This is
  fine for the current catalog size; if the catalog grows past
  ~10k doctors, a `pg_trgm` GIN index on `name` would be a
  future optimization (out of scope for v1).

### Public Profile (modified from feature 004)

```ts
const doctor = await prisma.doctor.findFirst({
  where: {
    id,
    status: 'ACTIVE',
    category: { status: 'ACTIVE' },
  },
  include: { category: { select: { id: true, name: true } } },
});
if (!doctor) {
  throw new NotFoundException('Doctor not found');
}
```

**Index usage**:
- Primary key lookup on `id` (fast).
- `status: 'ACTIVE'` filter on the doctor row.
- `category: { status: 'ACTIVE' }` join via the indexed
  `categoryId` FK.

### Public Categories (new)

```ts
const records = await prisma.category.findMany({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});
// Apply a JS-side case-insensitive sort as a defensive measure
// (Postgres ORDER BY is collation-dependent; the JS sort
// guarantees a consistent client-visible order).
return records.sort((a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
);
```

**Index usage**:
- `@@index([status])` for the status filter.
- No index on `name` — the table is small (one row per
  category, typically < 100 rows in v1), so a sort is cheap.

### Admin Category List (new)

```ts
const where: Record<string, unknown> = {};
if (query.status) where.status = query.status;
if (query.search) {
  where.name = { contains: query.search, mode: 'insensitive' };
}

const [records, total] = await Promise.all([
  prisma.category.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  }),
  prisma.category.count({ where }),
]);
```

### Admin Category Create (new)

```ts
// 1. Service-level uniqueness check (case-insensitive, ACTIVE only)
const existing = await prisma.category.findFirst({
  where: {
    name: { equals: dto.name.trim(), mode: 'insensitive' },
    status: 'ACTIVE',
  },
});
if (existing) {
  throw new ConflictException({ message: 'A category with this name already exists', error: 'duplicate_category' });
}

// 2. Create
const created = await prisma.category.create({
  data: {
    name: dto.name.trim(),
    status: dto.status ?? 'ACTIVE',
  },
});
```

### Admin Doctor Create (modified from feature 003)

```ts
// 1. Validate the category (inline — no cross-module service call)
const category = await prisma.category.findUnique({
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

// 2. Create
const created = await prisma.doctor.create({
  data: {
    name: dto.name,
    categoryId: dto.categoryId,
    bio: dto.bio ?? null,
    imageUrl: dto.imageUrl ?? null,
    status: 'ACTIVE',
  },
  include: { category: { select: { id: true, name: true } } },
});
```

### Admin Category Delete (with $transaction race safety)

```ts
await prisma.$transaction(async (tx) => {
  const referencingCount = await tx.doctor.count({
    where: { categoryId: id },
  });
  if (referencingCount > 0) {
    throw new ConflictException({
      message: 'Cannot delete a category that is still in use by one or more doctors',
      error: 'category_in_use',
    });
  }
  await tx.category.delete({ where: { id } });
});
```

## Validation Rules (consolidated for this feature)

### Category entity

| Operation | Rule | Behavior on violation |
|-----------|------|----------------------|
| `name` (create) | Required, string, 1-100 chars after trim | 400 if invalid |
| `name` (update) | Optional, 1-100 chars after trim | 400 if invalid |
| `status` (create) | Optional, enum: `ACTIVE` \| `DEACTIVATED` (default `ACTIVE`) | 400 if invalid |
| `status` (update) | Optional, same enum | 400 if invalid |
| Uniqueness | Case-insensitive uniqueness for ACTIVE rows | 409 if duplicate |
| Reactivation | Cannot reactivate a `DEACTIVATED` row if another ACTIVE row has the same name | 409 |
| Delete | Cannot delete a row that has any referencing doctors | 409 |
| Re-activation check | When updating status to `ACTIVE`, the service checks for existing ACTIVE rows with the same name | 409 if a collision exists |

### Doctor entity (modified from feature 003)

| Operation | Rule | Behavior on violation |
|-----------|------|----------------------|
| `categoryId` (create) | Required, string (cuid format) | 400 if missing or empty |
| `categoryId` (update) | Optional; same validation if supplied | 400 if supplied but invalid |
| Category exists | The supplied `categoryId` must reference an existing `Category` row | 404 if not found |
| Category active | The supplied `categoryId`'s category must have `status: "ACTIVE"` | 400 if `DEACTIVATED` |
| `specialty` | DROPPED — submitting a `specialty` field in the request body is ignored (DTO no longer declares it) | n/a |
| `status` | Unchanged (default `ACTIVE`, enum `ACTIVE` \| `DEACTIVATED`) | Unchanged |

### Query parameters (modified from feature 004)

| Query param | Rule | Behavior on violation |
|-------------|------|----------------------|
| `categoryId` (listing, profile) | Optional string, max 64 chars (cuid) | 400 if too long |
| `search` (listing) | Optional, max 120 chars, case-insensitive substring on `name` OR `category.name` | 400 if too long |
| `page` (listing) | Integer, >= 1, default 1 | 400 if invalid |
| `pageSize` (listing) | Integer, 1-100, default 20 | 400 if invalid |
| `specialty` (REMOVED) | No longer accepted; the param is ignored or returns 400 — implementation decides during code review | n/a |

## State Transitions (consolidated for this feature)

This feature introduces no new state machines. The two
relevant states are:

### Category.status

- `ACTIVE` (default) → `DEACTIVATED` (admin action): the public
  categories endpoint stops returning the category. Doctors
  assigned to the category are hidden from the public surface
  (the listing filter, the profile endpoint, and the dropdown
  all require the category to be `ACTIVE`).
- `DEACTIVATED` → `ACTIVE` (admin action): the public surfaces
  resume returning the category and its doctors. Rejected if
  another `ACTIVE` category with the same name exists.

### Doctor.status (inherited, unchanged from feature 003)

- `ACTIVE` (default) → `DEACTIVATED` (admin action): the public
  surface hides the doctor.
- `DEACTIVATED` → `ACTIVE` (admin action): the public surface
  shows the doctor again. The doctor remains assigned to
  whatever category they had at deactivation time (the admin
  can change the category via `PATCH /api/admin/doctors/:id`).

The 5-second freshness target (FR-013 from feature 004) is
inherited and applies to all public reads. The implementation
reads from the DB on every request (no in-process cache).

## Migration Strategy

The full migration is described in `research.md` §R4. The
short version:

1. **Create** the `Category` table with the composite unique
   and the `status` index.
2. **Add** `Doctor.categoryId` as a nullable column.
3. **Backfill** `Category` rows from distinct `Doctor.specialty`
   values (case-insensitive dedup, idempotent).
4. **Backfill** a "General" fallback row only if any doctor has
   an empty/null `specialty`.
5. **Backfill** each doctor's `categoryId` to reference the
   matching `Category` row (or "General" for empty/null
   `specialty`).
6. **Set** `Doctor.categoryId` to `NOT NULL`.
7. **Add** the FK constraint with `ON DELETE RESTRICT` and the
   `categoryId` index.
8. **Drop** the legacy `specialty` column and its index.

All steps are wrapped in a single Prisma migration file and a
single transaction (or a single `prisma migrate` execution).
The migration is **idempotent** — `NOT EXISTS` guards in the
backfill `INSERT` statements make the migration safe to re-run
on a partially migrated database.

## Caching Strategy

| Endpoint | Cache-Control header | Rationale |
|----------|---------------------|-----------|
| `GET /api/categories` (new, public) | `public, max-age=300` | Categories change less frequently than doctors but more than specialties did in feature 004 (the admin CRUD is now live); 300s is a middle ground |
| `GET /api/doctors` (modified) | `public, max-age=60` (unchanged from feature 004) | Most volatile; short TTL |
| `GET /api/doctors/:id` (modified) | `public, max-age=300` (unchanged from feature 004) | More stable than the listing |
| `GET /api/admin/categories` (new, admin) | none (admin endpoints are not cacheable) | Admin reads are always fresh |
| `POST` / `PATCH` / `DELETE` (admin) | n/a | Writes bypass cache; the next read sees fresh data |

**Important**: these are hints to intermediaries. The
application layer does not cache responses in process. The
5-second freshness target (FR-013 from feature 004) is
inherited: the application always reads the current state from
the database on every request.

## Rate Limiting (per IP)

| Endpoint | Limit | TTL |
|----------|-------|-----|
| `GET /api/categories` (new) | 60 requests | 60 seconds (1 minute) — matches the listing |
| `GET /api/doctors` (modified) | 60 requests | 60 seconds (unchanged) |
| `GET /api/doctors/:id` (modified) | 120 requests | 60 seconds (unchanged) |
| `GET /api/admin/categories` (new) | none beyond session auth | n/a (admin endpoints are gated by `RolesGuard` + `@Roles('admin')`) |
| Admin `POST` / `PATCH` / `DELETE` (category) | none beyond session auth | n/a |

These are per-client-IP limits, applied via `@nestjs/throttler`
on the public endpoints. The admin endpoints rely on session
auth (the `RolesGuard` rejects unauthenticated requests with
401/403).

## Removed / Out-of-Scope Patterns

| Old pattern | Status |
|-------------|--------|
| `Doctor.specialty` (string column) | DROPPED in the migration |
| `?specialty=<text>` query parameter on public listing | REMOVED (clients must use `?categoryId=<id>`) |
| `?specialty=<text>` query parameter on admin listing | REMOVED (clients must use `?categoryId=<id>`) |
| `GET /api/specialties` (public endpoint) | REMOVED (replaced by `GET /api/categories`) |
| `listSpecialties()` service method | DELETED (replaced by `CategoriesService.listPublicCategories()`) |
| `specialty` field in `CreateDoctorDto` / `UpdateDoctorDto` | REMOVED (replaced by required `categoryId`) |
| `specialty` field in `PublicDoctorRecord` / `DoctorRecord` | REPLACED by nested `category: { id, name }` |
| `specialty` field in swagger docs | REMOVED; the `category` schema is documented instead |

## Summary of Schema Changes

| Table | Operation | Detail |
|-------|-----------|--------|
| `category` (new) | CREATE | id, name, status, createdAt, updatedAt; composite unique on (name, status); index on status |
| `doctor` | ALTER (add column) | `categoryId TEXT` initially nullable |
| `doctor` | UPDATE (backfill) | `categoryId` set to the matching `Category.id` for each row |
| `doctor` | ALTER (set NOT NULL) | `categoryId` becomes NOT NULL |
| `doctor` | ALTER (add FK) | FK constraint to `category(id)` with `ON DELETE RESTRICT` |
| `doctor` | CREATE INDEX | `doctor_categoryId_idx` |
| `doctor` | DROP INDEX | `doctor_specialty_idx` (the legacy index) |
| `doctor` | ALTER (drop column) | `specialty` column removed |

The migration is one Prisma file with hand-edited SQL for the
data-backfill steps (R4 in `research.md`).
