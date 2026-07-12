# Data Model: Doctor Search & Discovery (Module 2)

**Feature**: 004-doctor-search
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (the `Doctor` table)

## Overview

This feature introduces **no new database tables or columns**. It
is a public read surface over the existing `Doctor` table
introduced in feature 003. All filtering, sorting, and pagination
is performed at query time via Prisma's `where` and `orderBy`
clauses.

## Entities

### Doctor (inherited, unchanged schema)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| name | String | required, 2-120 chars | Doctor's full name |
| specialty | String | required, max 100 chars | Specialty (free-text) |
| bio | String? | nullable, max 2000 chars | Short biography |
| imageUrl | String? | nullable, valid URL, max 2048 chars | Profile photo URL |
| status | String | default: `"ACTIVE"` | Enum: `"ACTIVE"` or `"DEACTIVATED"` |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**No changes from feature 003.** This feature reads the same
table.

### New derived concept: `PublicDoctorView`

This is a logical read model, not a database table. The public
doctor surface returns objects with the same shape as the
`Doctor` Prisma record — the only difference is the implicit
filter that hides DEACTIVATED doctors. The view is built at
query time.

**Implied fields** (derived from the `Doctor` table):
- All `Doctor` fields are included.
- The `status` field is always `"ACTIVE"` in responses (because
  the query filters to active doctors). Future status values
  (e.g. `"PENDING_REVIEW"`) could be added; for v1, only
  `ACTIVE` is reachable via the public surface.

### New derived concept: `PublicSpecialtyList`

A flat list of strings — the distinct `specialty` values from
doctors with `status = "ACTIVE"`. Built at query time:

```ts
prisma.doctor.findMany({
  where: { status: 'ACTIVE' },
  select: { specialty: true },
  distinct: ['specialty'],
  orderBy: { specialty: 'asc' },
});
```

No new database table. No new index (the `specialty` index from
feature 003 supports the `distinct` operation).

## Query Patterns

### Public Listing

```ts
const where = {
  status: 'ACTIVE',
  ...(query.specialty !== undefined && { specialty: query.specialty }),
  ...(query.search !== undefined && {
    OR: [
      { name: { contains: query.search, mode: 'insensitive' } },
      { specialty: { contains: query.search, mode: 'insensitive' } },
    ],
  }),
};

const [records, total] = await Promise.all([
  prisma.doctor.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  }),
  prisma.doctor.count({ where }),
]);
```

**Index usage**:
- `@@index([status])` from feature 003 — used to filter to
  ACTIVE quickly.
- `@@index([specialty])` from feature 003 — used for the
  exact-match `specialty` filter.
- For `name` substring search: no dedicated index. Postgres
  falls back to a sequential scan filtered by ILIKE. This is
  fine for the current catalog size; if the catalog grows past
  ~10k doctors, a `pg_trgm` GIN index would be a future
  optimization (out of scope for v1).

### Public Profile

```ts
const doctor = await prisma.doctor.findFirst({
  where: { id, status: 'ACTIVE' },
});
if (!doctor) {
  throw new NotFoundException('Doctor not found');
}
```

**Index usage**:
- Primary key lookup on `id` (fast).
- `status: 'ACTIVE'` filter applied to the result.

### Public Specialties

```ts
const records = await prisma.doctor.findMany({
  where: { status: 'ACTIVE' },
  select: { specialty: true },
  distinct: ['specialty'],
  orderBy: { specialty: 'asc' },
});
const specialties = records.map((r) => r.specialty);
```

**Index usage**:
- `@@index([status])` for the status filter.
- `@@index([specialty])` for the `distinct` + `orderBy` on
  `specialty`.

## Validation Rules (consolidated for this feature)

| Query param | Rule | Behavior on violation |
|-------------|------|----------------------|
| `specialty` | String, max 100 chars | 400 if too long |
| `search` | String, max 120 chars | 400 if too long |
| `page` | Integer, >= 1, default 1 | 400 if not a positive integer |
| `pageSize` | Integer, 1-100, default 20 | 400 if out of range |
| Path param `id` | String (cuid shape) | 400 if malformed (handled by NestJS) |

| Entity | Rule |
|--------|------|
| Doctor.status (read) | Only `"ACTIVE"` is reachable via the public surface; `"DEACTIVATED"` returns 404 (profile) or is excluded (listing) |
| Doctor.id (path) | Must reference an existing ACTIVE doctor, else 404 |

## State Transitions (inherited from feature 003)

This feature does not introduce new state transitions. The only
state that matters for this feature is `Doctor.status`:
- `ACTIVE` (default) → DEACTIVATED (admin action): the public
  surface hides the doctor.
- `DEACTIVATED` → `ACTIVE` (admin action): the public surface
  shows the doctor again.

The 5-second freshness target (FR-013) is achieved by reading
the DB on every public request (no in-process cache). The
DB-level state change is visible on the next read.

## Migration Strategy

**No migration required.** This feature reads the existing
`Doctor` table from feature 003. No new columns, no new
indexes, no new tables.

## Caching Strategy

| Endpoint | Cache-Control header | Rationale |
|----------|---------------------|-----------|
| `GET /api/doctors` | `public, max-age=60` | Most volatile (admins can deactivate any time); short TTL |
| `GET /api/doctors/:id` | `public, max-age=300` | More stable than the listing; longer TTL acceptable |
| `GET /api/specialties` | `public, max-age=600` | Rarely changes; longest TTL |

**Important**: these are hints to intermediaries (CDNs, reverse
proxies). The application layer does not cache responses in
process. The 5-second freshness target (FR-013) is achieved
because the application always reads the current state from
the database on every request — even when an intermediary
returns a stale cached response, the next uncached request
will see the new state.

## Rate Limiting (per IP, defaults from FR-014)

| Endpoint | Limit | TTL |
|----------|-------|-----|
| `GET /api/doctors` | 60 requests | 60 seconds (1 minute) |
| `GET /api/doctors/:id` | 120 requests | 60 seconds |
| `GET /api/specialties` | 30 requests | 60 seconds |

These are per-client-IP limits, applied via `@nestjs/throttler`.
The limits are advisory defaults from the spec; the planning
phase can tune them based on expected traffic.

## Entity Relationship (no changes from feature 003)

```
┌─────────────────┐
│     Doctor      │
├─────────────────┤
│ id (PK)         │
│ name            │
│ specialty       │  ← index
│ bio?            │
│ imageUrl?       │
│ status          │  ← index (always "ACTIVE" in public responses)
│ createdAt       │
│ updatedAt       │
└─────────────────┘
```

No new entities, no new relationships. This feature is a
public read surface over a table that already exists.
