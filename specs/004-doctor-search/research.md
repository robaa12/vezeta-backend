# Research: Doctor Search & Discovery (Module 2)

**Feature**: 004-doctor-search
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (introduced the standalone `Doctor` table + admin CRUD)

## R1: New Feature Module Location

**Decision**: Create a new `src/doctors/` feature module. The public
read-only surface (listing, profile, specialties) is a separate concern
from the admin CRUD in `src/admin/`, and the constitution's
Principle I ("Feature-Module Architecture") calls for each domain to
own its module.

**Rationale**: Mixing public reads with admin writes in the same
controller creates a tangle of guards (anonymous vs admin) and DTOs
(search/filter vs full edit). A separate module gives the public
surface its own clean read API and lets the admin module focus on
write/management.

**Alternatives considered**:
- Add public routes to `src/admin/` — rejected: requires a public-facing
  controller in an admin module, which is confusing; also forces
  per-route `@AllowAnonymous()` instead of module-level control.
- Add public routes to `src/users/` — rejected: `users/` is for shared
  user-facing profile endpoints; doctors are a different domain.
- Use the same `Doctor` controller for both admin and public — rejected:
  the spec explicitly calls out a clear separation.

**Key patterns**:
- `src/doctors/doctors.module.ts` — registers `DoctorsController` and
  `DoctorsService`; imports the global `PrismaService`.
- `src/doctors/doctors.controller.ts` — three public endpoints with
  `@AllowAnonymous()` from `@thallesp/nestjs-better-auth`.
- `src/doctors/doctors.service.ts` — read methods only; no writes.
- `src/doctors/dto/list-doctors.dto.ts` — query DTO for the listing.
- `src/doctors/dto/list-doctors.dto.ts` — also covers the specialties
  response shape (no DTO needed for the profile since it's a 1:1
  Prisma record → response mapping).

**Gotchas**:
- The existing `src/users/` module may want a `getPublicUser` method
  later, but that's out of scope here. The `doctors` module owns the
  public doctor surface.
- Better Auth's `AllowAnonymous` decorator bypasses the global auth
  guard. Use it on the three public endpoints; do NOT use it for the
  admin endpoints (those use `RolesGuard` + `@Roles('admin')`).

---

## R2: Prisma Query Strategy

**Decision**: Use `prisma.doctor.findMany` with a `where` clause
filtered to `status: "ACTIVE"`, and a `mode: "insensitive"` LIKE
search via `contains` for the `search` parameter. Combine filters
with AND (all conditions must match).

**Rationale**: Prisma 7 supports `mode: "insensitive"` for
case-insensitive substring matches natively, and the `where` clause
supports both equality and substring predicates in a single call.
This avoids raw SQL and keeps the query type-safe.

**Alternatives considered**:
- Raw SQL with `ILIKE` — rejected: loses Prisma's type safety and
  introduces a SQL injection risk if not parameterized correctly.
- Two separate queries (specialty filter, then in-memory search) —
  rejected: doesn't scale, and the database is the right place to
  filter.
- Full-text search (Postgres `tsvector`) — rejected: overkill for the
  current catalog size; the simple `contains` query is fast enough
  and avoids a migration to add an index.

**Key patterns**:
- Listing query shape:
  ```ts
  const where = {
    status: 'ACTIVE',
    ...(query.specialty && { specialty: query.specialty }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { specialty: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };
  ```
- Specialties query: `prisma.doctor.findMany({ where: { status: 'ACTIVE' }, select: { specialty: true }, distinct: ['specialty'] })`.
- Profile query: `prisma.doctor.findFirst({ where: { id, status: 'ACTIVE' } })`.

**Gotchas**:
- `findMany` with `distinct: ['specialty']` returns a list of
  `{ specialty: 'X' }` objects, not strings. Map to strings in the
  service.
- Sorting: `orderBy: { createdAt: 'desc' }` is the only supported
  order. Don't add a `sort` query parameter in v1.
- The `search` parameter must be sanitized (parameter binding via
  Prisma) — no manual SQL string concatenation. Length is capped
  at 120 by the DTO.

---

## R3: Pagination

**Decision**: 1-based `page` parameter (default 1), `pageSize`
parameter (default 20, max 100), `skip = (page - 1) * pageSize`,
`take = pageSize`. Response includes `{ doctors, total, page,
pageSize }`.

**Rationale**: Same pagination shape as the admin doctor listing
(feature 003) — consistent UX, same DTO validation, same frontend
handling. 1-based is more user-friendly than 0-based.

**Alternatives considered**:
- Cursor-based pagination (better for very large datasets) —
  rejected: the doctor catalog is small enough that offset
  pagination is fine; cursor pagination adds complexity for no
  current win.
- Returning `nextPage` / `prevPage` URLs — rejected: the client can
  compute these from `page + 1` and `page - 1`.

**Key patterns**:
- Validate `page >= 1` and `1 <= pageSize <= 100` in the DTO
  (class-validator's `@Min` and `@Max`).
- Run the `findMany` and the `count` in `Promise.all` for
  parallelism (one DB round trip in total wall time, but two
  queries in flight).
- If `total === 0`, return an empty array — no special handling.

**Gotchas**:
- `skip` with a very large `page` (e.g. page=1000000) can be slow
  in Postgres. The pageSize cap at 100 keeps the practical upper
  bound manageable; the max page is implicitly `Math.ceil(total /
  pageSize)`.
- The `total` count includes all matching rows regardless of
  pagination — required for the client to render pagination
  controls.

---

## R4: Response Shape

**Decision**: The listing returns the full `Doctor` record for each
entry (id, name, specialty, bio, imageUrl, status, createdAt,
updatedAt). The profile endpoint returns the same shape but wrapped
in `{ doctor: ... }` for symmetry with the admin CRUD (which wraps
in `{ doctor: ... }`).

**Rationale**: Symmetry with the admin CRUD (feature 003) makes the
frontend simpler — the same `Doctor` TypeScript type works for both.
Wrapping the profile in `{ doctor: ... }` matches the admin
contract.

**Alternatives considered**:
- Truncate the bio in the listing to a preview length — rejected:
  the full bio is short (max 2000 chars per feature 003); clients
  can truncate at render time.
- Strip the timestamps in the listing — rejected: clients may want
  "newest" labels, and the field is cheap.

**Key patterns**:
- Service method returns a `DoctorRecord` interface (same shape as
  in `src/admin/admin.service.ts`). Re-use the type via a shared
  common module if duplication becomes painful; for v1, duplicating
  is fine.
- Profile response: `{ doctor: DoctorRecord }`.
- Listing response: `{ doctors: DoctorRecord[], total: number, page: number, pageSize: number }`.
- Specialties response: `{ specialties: string[] }`.

**Gotchas**:
- The `status` field is included in the public response even
  though it is always `"ACTIVE"` for reachable doctors. This is
  intentional — it keeps the response shape consistent with the
  admin CRUD and allows future status values to be exposed if the
  decision changes.

---

## R5: 404 vs 410 for Deactivated Doctors

**Decision**: A public profile request for a DEACTIVATED doctor
returns 404 (not 410 Gone). The public listing simply omits
deactivated doctors.

**Rationale**: The spec (FR-006) explicitly calls for 404 to
prevent information leakage — an attacker probing for deactivated
doctor ids should not be able to distinguish "this id was once
valid but is now deactivated" from "this id never existed". A
410 Gone status would explicitly signal "this used to exist",
which is a minor information leak.

**Alternatives considered**:
- 410 Gone — rejected per the spec's information-leakage concern.
- 200 with a `deactivated: true` flag — rejected: the spec
  explicitly hides deactivated doctors from the public surface.
- Redirect to a "doctor not available" page — rejected: requires
  extra frontend work for an admin-only concern.

**Key patterns**:
- The profile service does `findFirst({ where: { id, status:
  'ACTIVE' } })`. If null, throw `NotFoundException` (NestJS maps
  to 404).
- The listing query filters to `status: 'ACTIVE'` at the DB
  level; no in-memory filter needed.

**Gotchas**:
- The 404 response body should be generic ("Doctor not found") —
  not "Doctor is deactivated" or similar.

---

## R6: Search Behavior — Specialty vs Name

**Decision**: The `search` query parameter matches against BOTH
`name` AND `specialty` (case-insensitive substring). When both
`specialty` and `search` are provided, the `specialty` filter is
applied as an exact match AND, and the `search` is applied as a
substring OR across name/specialty.

**Rationale**: This matches the spec's intent (US3) — "a single
search box doubles as a name and specialty search". Users
typically type a partial specialty ("Cardio") and expect it to
match "Cardiology" doctors; this is the same UX as the admin
listing.

**Alternatives considered**:
- Search only against `name` — rejected: loses the partial-
  specialty search UX.
- Search only against `specialty` — rejected: doesn't help
  patients searching by doctor name.
- Two separate search inputs (name + specialty text) — rejected:
  adds UI complexity for no clear win.

**Key patterns**:
- The Prisma `where` clause with both filters:
  ```ts
  {
    status: 'ACTIVE',
    specialty: 'Cardiology',  // exact match
    OR: [                     // substring across name + specialty
      { name: { contains: search, mode: 'insensitive' } },
      { specialty: { contains: search, mode: 'insensitive' } },
    ],
  }
  ```
  This produces "doctors whose specialty is exactly 'Cardiology'
  AND whose name OR specialty contains the search term".

**Gotchas**:
- If `specialty=Cardiology&search=Cardiology` is passed, the
  result includes all Cardiology doctors (the `OR` matches the
  specialty via substring).
- If `specialty=Cardio` is passed (not an exact match), the
  result is empty — exact-match wins, and the partial is not
  promoted to a substring search.

---

## R7: Cache Headers (FR-015)

**Decision**: Set `Cache-Control: public, max-age=60` on the
listing, `max-age=300` on the profile, `max-age=600` on
specialties. Use NestJS's `@Header('Cache-Control', '...')`
decorator.

**Rationale**: The 5-second freshness target (FR-013) is the
authoritative requirement — intermediaries may cache longer than
60s and that's fine, as long as the application layer also
satisfies the freshness target. Setting a `max-age` is a hint to
intermediaries; the application itself reads from the DB on
every request (no in-process cache), so the worst-case staleness
for a CDN-cached response is `max-age` seconds, not infinite.

**Alternatives considered**:
- No cache headers, always read from DB — fine for development,
  wasteful in production.
- In-process caching with TTL (e.g. via `cache-manager`) — over-
  engineered for v1; the DB queries are fast.
- ETag-based caching — overkill; max-age is sufficient.

**Key patterns**:
- Apply `@Header('Cache-Control', 'public, max-age=60')` to the
  listing controller method.
- The `5-second freshness target` is the upper bound that the
  application itself MUST honor — even with `max-age=60`, a
  request that bypasses the cache (e.g. a hard reload with
  `Cache-Control: no-cache`) must see fresh data.

**Gotchas**:
- The `Cache-Control` header is only a hint. Browser-side caching
  may ignore it. CDNs may cache longer. The application layer
  does not have a separate cache that could go stale.
- When a doctor is deactivated, the next request (within 5
  seconds) must reflect the new status. The `max-age=60` on
  the listing does NOT break this — a patient who hits the
  listing 1 second after deactivation gets fresh data; a
  patient who hits it 60 seconds later may get the stale
  cached response, which is acceptable.

---

## R8: Rate Limiting (FR-014)

**Decision**: Use `@nestjs/throttler` (the standard NestJS rate
limiting module) with per-IP limits:
- Listing: 60 req/min
- Profile: 120 req/min
- Specialties: 30 req/min

**Rationale**: `@nestjs/throttler` is the canonical NestJS rate
limiting package, integrates cleanly with the existing NestJS
modules, and supports per-route configuration. The limits are
generous for normal use but cap automated scraping.

**Alternatives considered**:
- No rate limiting — rejected: spec requires it (FR-014).
- Per-user rate limiting (requires auth) — rejected: the
  endpoints are public; IP-based is the right granularity.
- Reverse-proxy rate limiting (Cloudflare, nginx) — out of
  scope; the application layer is a fallback.

**Key patterns**:
- Add `ThrottlerModule` to `app.module.ts` (already in the
  project's deps? — needs verification in the planning phase).
- Apply `@Throttle({ default: { limit: 60, ttl: 60_000 } })` to
  the listing controller method.
- In production behind a reverse proxy, configure the
  throttler to read the real client IP from `X-Forwarded-For`.

**Gotchas**:
- The throttler counts requests across all endpoints unless
  per-route configuration is applied. The per-route limits
  override the global default.
- 60/120/30 req/min is the spec's suggestion (FR-014 says
  "reasonable default"); the planning phase can tune these.

---

## R9: Public Endpoint Auth (FR-009)

**Decision**: All three endpoints are marked with
`@AllowAnonymous()` from `@thallesp/nestjs-better-auth`. The
admin CRUD endpoints (feature 003) are NOT affected.

**Rationale**: The spec explicitly requires no authentication for
the public doctor surface (FR-009). `@AllowAnonymous()` is the
canonical Better Auth + NestJS escape hatch.

**Alternatives considered**:
- Add a separate "public" NestJS app instance — rejected:
  overkill for three endpoints.
- Use a separate auth-less middleware — rejected: not the
  established pattern in the codebase.

**Key patterns**:
- Import `AllowAnonymous` from `@thallesp/nestjs-better-auth`.
- Decorate the three controller methods.

**Gotchas**:
- The global Better Auth guard is enabled by default. Without
  `@AllowAnonymous()`, the endpoints would require a valid
  session cookie and reject anonymous visitors with 401.
- This module does NOT need the `RolesGuard` or `@Roles()`
  decorator — those are for the admin module.

---

## R10: DTOs and Validation

**Decision**: Create one DTO for the listing query
(`ListPublicDoctorsDto`), no DTO for the profile (path param +
no body), and no DTO for specialties (no query params).

**Rationale**: The listing has filter/pagination parameters
that need validation; the profile only takes a path param
(validated by NestJS as a string); specialties has no
parameters at all. Adding DTOs where they add no value is
over-engineering.

**Alternatives considered**:
- One DTO per endpoint — rejected: the profile and specialties
  endpoints have no body or query parameters.
- Shared DTO between admin and public listings — rejected:
  different validation rules (public is read-only, no `status`
  filter override) and different response shapes (public omits
  nothing, admin wraps in `{ doctors, total, page, pageSize }`).
  Wait — actually, the response shapes are similar. The public
  version could reuse the admin's `ListDoctorsDto` with the
  `status` field restricted to `ACTIVE` only. Trade-off: keeps
  the validation logic in one place, but couples the public
  module to the admin module's DTO. For v1, a separate DTO is
  cleaner.

**Key patterns**:
- `src/doctors/dto/list-doctors.dto.ts`:
  ```ts
  export class ListPublicDoctorsDto {
    @IsOptional() @IsString() @MaxLength(100) specialty?: string;
    @IsOptional() @IsString() @MaxLength(120) search?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
  }
  ```
- No DTO for the profile (path param only).
- No DTO for specialties (no params).

**Gotchas**:
- The `Type(() => Number)` decorator from `class-transformer`
  is required because query parameters arrive as strings. Without
  it, `IsInt` and `@Min` would fail validation on a valid `?page=1`.
- The default values (1, 20) are set in the DTO so the service
  can rely on the values being defined.
- `MaxLength(100)` on `specialty` matches the DB field length.

---

## R11: Doctor Module Structure

**Decision**: The `doctors` module is small and self-contained.
The structure mirrors the other feature modules:

```
src/doctors/
├── doctors.module.ts        # NestJS module definition
├── doctors.controller.ts    # 3 endpoints
├── doctors.service.ts       # 3 read methods
├── doctors.service.spec.ts  # unit tests
└── dto/
    └── list-doctors.dto.ts  # query DTO
```

**Rationale**: Mirrors the structure of `src/admin/` (which
also has a `dto/` subfolder) and `src/auth/`. Consistent
layout makes the codebase easier to navigate.

**Alternatives considered**:
- Single file (`doctors.ts` containing controller + service) —
  rejected: harder to test in isolation; inconsistent with the
  rest of the codebase.
- No separate module (fold into a `users`-adjacent feature) —
  rejected: principle I.

**Key patterns**:
- The module exports `DoctorsService` (in case another module
  wants to consume it in the future, e.g. a "favorite doctors"
  feature in Module 4).
- The module does NOT import `AuthModule` or `AdminModule`.

**Gotchas**:
- `app.module.ts` must register the new `DoctorsModule` for
  the controller to be wired up.

---

## R12: Testing Strategy

**Decision**:
- **Unit tests** for `DoctorsService`:
  - `listPublicDoctors` with various filter combinations
  - `getPublicDoctor` for ACTIVE (returns record) and DEACTIVATED
    (returns null)
  - `listSpecialties` deduplicates and sorts
- **E2E tests** in `test/doctors-public.e2e-spec.ts` (new file
  matching the pattern of the other e2e tests):
  - No auth required for any endpoint
  - Listing returns only ACTIVE doctors
  - Specialty filter works
  - Search works (case-insensitive)
  - Combined filter works
  - Profile returns 200 for ACTIVE, 404 for DEACTIVATED
  - Specialties endpoint returns distinct sorted list
  - Invalid query params return 400

**Rationale**: The unit tests cover the service logic in
isolation; the e2e tests cover the controller + DTO + service
integration. The pattern matches feature 003's admin doctor
tests.

**Alternatives considered**:
- Skip e2e tests — rejected: the spec requires test coverage.
- Mock Prisma entirely in unit tests — fine; the e2e tests
  exercise the real Prisma.

**Gotchas**:
- The e2e tests are gated on `DATABASE_URL` like the other
  e2e tests in the project.
- The unit tests need a Prisma mock that returns the right
  shape for `findMany` / `findFirst` / `count`.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Module location | New `src/doctors/` module (per Principle I) |
| Prisma query | `findMany` with `where` clause; `mode: 'insensitive'` for search |
| Pagination | 1-based `page`, `pageSize` capped at 100, default 20 |
| Response shape | Full `Doctor` record per entry; listing wrapped in `{ doctors, total, page, pageSize }` |
| 404 behavior | 404 (not 410) for deactivated or missing |
| Search behavior | Case-insensitive substring on `name` AND `specialty` |
| Cache headers | `max-age=60/300/600` on listing/profile/specialties |
| Rate limiting | `@nestjs/throttler` per-IP, 60/120/30 req/min |
| Auth | `@AllowAnonymous()` on all three endpoints |
| DTOs | One for listing query; none for profile or specialties |
| Tests | Unit tests for service; e2e tests for full flow |
