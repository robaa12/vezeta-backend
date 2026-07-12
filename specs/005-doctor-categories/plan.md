# Implementation Plan: Doctor Categories

**Branch**: `005-doctor-categories` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-doctor-categories/spec.md`

**Upstream**: 003-remove-doctor-role (introduced the standalone `Doctor`
table with a free-text `specialty`), 004-doctor-search (introduced the
public read surface that this feature modifies).

## Summary

Promote the doctor "specialty" from a free-text column to a
first-class controlled-vocabulary entity. A new `Category` table
plus a `Category` feature module give Super Admins a CRUD surface
to manage the vocabulary; the `Doctor` table drops `specialty` and
gains a required `categoryId` foreign key. Existing doctor
records are backfilled by a one-time data migration; the admin
doctor endpoints require and validate `categoryId`; the public
doctor endpoints expose `category: { id, name }` and accept
`?categoryId=<id>` instead of the legacy `?specialty=<text>`
filter; a new public `GET /api/categories` endpoint powers the
patient dropdown. The implementation is a breaking change to the
`Doctor` schema, the admin doctor API, and the public doctor API,
but the project is pre-production (no real clients yet) and the
new shape is strictly more capable.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (LTS) — inherited
from features 001-004.

**Primary Dependencies**: NestJS 11, Prisma, Better Auth, class-
validator, class-transformer, `@nestjs/throttler` — all inherited.
**No new third-party dependencies** are required for this feature.

**Storage**: PostgreSQL via Prisma ORM — inherited.
- New table: `Category` (id, name, status, createdAt, updatedAt).
- `Doctor` is modified: drops `specialty` column, adds
  `categoryId` (cuid, NOT NULL, FK → `Category.id`).
- One Prisma migration is required; the migration includes a
  data-migration step that backfills `Category` rows from the
  existing distinct `specialty` values and updates each doctor's
  `categoryId` before dropping the legacy column.

**Testing**: Jest (unit) + Supertest (e2e) — inherited. The
project's e2e tests run against a real PostgreSQL via
`docker-compose.dev.yml`.

**Target Platform**: Linux server (Node.js backend API) —
inherited.

**Project Type**: Web-service (REST API backend) — inherited.

**Performance Goals**:
- `GET /api/categories` (public): < 100ms p95 (small table,
  one indexed query, no joins).
- `GET /api/doctors` (public, listing): < 300ms p95 (regression
  budget vs. feature 004). The new `categoryId` filter uses a
  B-tree index on the FK column.
- `GET /api/admin/categories` (admin list): < 200ms p95.
- Admin `createCategory` / `updateCategory`: < 200ms p95.

**Constraints**:
- Better Auth tables (`User`, `Session`, `Account`,
  `Verification`) MUST NOT be hand-edited (Principle V). The
  migration touches only the `Doctor` and new `Category` tables.
- The migration MUST be idempotent (running it twice must not
  duplicate categories or break the schema).
- The `?specialty=` query parameter is removed; clients must
  migrate to `?categoryId=`. No backward-compatibility shim is
  required (no real clients yet — see Assumption in spec).
- No in-process caching: every public read goes to the DB
  (matches feature 004's 5-second freshness target).
- The public `GET /api/categories` endpoint replaces the previous
  `GET /api/specialties` endpoint (which is removed).

**Scale/Scope**:
- 1 new feature module: `src/categories/` (admin + public
  surfaces).
- 1 new Prisma model: `Category`.
- 1 modified Prisma model: `Doctor` (drop `specialty`, add
  `categoryId`).
- 1 new migration with data backfill.
- 1 new module file + 1 new service + 1 new controller + ~5
  DTOs + 1 new e2e test file in `src/categories/`.
- Modifications to `src/admin/admin.controller.ts`,
  `src/admin/admin.service.ts`, `src/admin/dto/*`,
  `src/doctors/doctors.controller.ts`, `src/doctors/doctors.service.ts`,
  `src/doctors/dto/list-doctors.dto.ts`, `src/seed/seed.ts`,
  `src/app.module.ts`, and `prisma/schema.prisma`.
- Roughly 800-1200 LoC of additions and edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Module Architecture | PASS | A new `src/categories/` module owns the category CRUD (admin) + the public categories endpoint. The `Doctor` module (feature 004) is the public read surface over `Doctor` and continues to be self-contained. The `Admin` module owns the admin-side doctor CRUD and continues to import only `PrismaService` + the global `RolesGuard`. No cross-module service imports: the admin doctor `create`/`update` methods validate `categoryId` existence and ACTIVE status inline (Prisma query) rather than calling into the `CategoriesService`. This keeps the modules loosely coupled. |
| II. Domain-Event Decoupling | PASS | The feature is primarily synchronous CRUD. The one cross-module concern is the admin doctor `create`/`update` flow validating that a `categoryId` exists and is `ACTIVE`. This is implemented as a direct Prisma `findUnique` lookup (read-only) inside the admin service — NOT a service-to-service call — so it does not violate the principle. No domain events are emitted; no notifications are sent. A future feature that auto-deactivates doctors when their category is deactivated (out of scope here) would be the right place to introduce a `CategoryDeactivated` event. |
| III. Single-Clinic Identity | PASS | No new "clinic" modeling. The relation is `Doctor` (1:N) → `Category`. `Category` is purely a vocabulary table; it has no clinic attributes, no operating hours, no address. A single doctor still has a single category. |
| IV. Transactional Data Integrity | PASS | The `DELETE /api/admin/categories/:id` flow (which checks for referencing doctors before deletion) is wrapped in a Prisma transaction (`$transaction`) so the count and delete are atomic — preventing a race where a doctor is created concurrently with the category delete. The data migration is also wrapped in a single Prisma `$transaction` (or run via `prisma migrate` with a single migration file) so a partial failure rolls back. No booking-style resource claiming is involved; the existing "appointment slot" rule from Principle IV does not apply (no appointments table yet). |
| V. Better Auth Schema Sovereignty | PASS | The migration touches only the `Doctor` and `Category` tables. `User`, `Session`, `Account`, `Verification` are completely untouched. The new `Category` table is a domain table, not a Better Auth table; the `Category` Prisma model is added by hand to `schema.prisma` (not generated via the Better Auth CLI). No `additionalFields` are injected into Better Auth's `User` model. |
| VI. Auth & Access Control | PASS | Admin category endpoints are placed under `/api/admin/categories` and inherit the existing `RolesGuard` + `@Roles('admin')` pattern from `src/admin/admin.controller.ts`. They MUST NOT use `@AllowAnonymous()`. The public categories endpoint uses `@AllowAnonymous()`. Better Auth's `emailOTP` / `phoneNumber` plugins are not touched. The `RolesGuard` and `DoctorApprovedGuard` (the latter deleted in feature 003) are not relevant here. |
| VII. Phased Delivery | PASS | This feature is a refinement of the existing doctor CRUD (feature 003) and the public doctor surface (feature 004), both of which are already shipped. It is a pre-booking refinement per `plan.md` §13 (Phased Build Roadmap) — it improves data integrity for the upcoming booking flow. It is not a new monetization or trust feature, so the Phase 1 booking constraint is unaffected. |

**Re-evaluation after Phase 1 design**: All gates still pass.
The data model document explicitly notes that Better Auth tables
are not modified (Principle V). The `CategoriesService` is
exported from the new module but is not imported by `AdminService`
or `DoctorsService`; the cross-module lookups use direct Prisma
queries, satisfying Principle II. The new `DELETE /api/admin/
categories/:id` is wrapped in `$transaction`, satisfying
Principle IV.

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/005-doctor-categories/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Schema + query patterns
├── quickstart.md        # Phase 1: Validation guide
└── contracts/           # Phase 1: API contracts
    ├── admin-categories-api.md
    └── public-categories-api.md
```

### Source Code (repository root)

This feature adds **one new feature module** (`src/categories/`)
and modifies the existing `admin`, `doctors`, `seed`, and root
`prisma` files. No new top-level project; the structure is a
single NestJS backend with feature-module organization
(Principle I).

```text
src/
├── categories/                       # NEW module
│   ├── categories.module.ts
│   ├── categories.controller.ts      # public GET /api/categories
│   ├── admin-categories.controller.ts # admin /api/admin/categories/*
│   ├── categories.service.ts
│   ├── categories.service.spec.ts    # unit tests
│   └── dto/
│       ├── create-category.dto.ts
│       ├── update-category.dto.ts
│       ├── list-categories.dto.ts
│       └── category-response.dto.ts
├── admin/                            # MODIFIED
│   ├── admin.controller.ts           # add categoryId to create/update doctor
│   ├── admin.service.ts              # validate categoryId, include category in record
│   ├── admin.service.spec.ts         # add cases for categoryId validation
│   └── dto/
│       ├── create-doctor.dto.ts      # require categoryId, drop specialty
│       ├── update-doctor.dto.ts      # optional categoryId, drop specialty
│       └── list-doctors.dto.ts       # drop specialty filter, add categoryId filter
├── doctors/                          # MODIFIED
│   ├── doctors.controller.ts         # switch ?specialty to ?categoryId
│   ├── doctors.service.ts            # include category in response
│   └── dto/
│       └── list-doctors.dto.ts       # switch specialty to categoryId
├── seed/
│   └── seed.ts                       # seed default categories
├── app.module.ts                     # register CategoriesModule
├── prisma/
│   └── prisma.service.ts             # (unchanged)
└── ...

prisma/
├── schema.prisma                     # MODIFIED: add Category, modify Doctor
└── migrations/
    └── YYYYMMDDHHMMSS_add_categories/
        └── migration.sql              # NEW: schema + data migration

test/
└── categories.e2e-spec.ts            # NEW: e2e tests for admin + public
```

**Structure Decision**: Option 1 (single project) — this is a
backend-only repository, no separate frontend, no mobile client.
The new `src/categories/` module follows the established
`admin/doctors` pattern: controller(s), service, DTOs in a `dto/`
subfolder, unit tests alongside the service, e2e tests in
`test/`. The public categories endpoint and the admin categories
endpoints live in **separate controllers** under the same module
so the auth surface (anonymous vs. admin) is enforced at the
controller level rather than per-route — cleaner than mixing
decorators on a single class.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The `CategoriesService` is intentionally not
imported across module boundaries to satisfy Principle II; this
introduces a small amount of duplicated Prisma query code
(category existence + status check appears in `AdminService`
twice, in `CategoriesService` for read paths, and once in
`DoctorsService` for the listing filter), but the duplication is
localized to ~10 lines and keeps the modules independent.
Acceptable for v1; a shared `findActiveCategoryById` helper in
`src/common/` could deduplicate later if more callers appear.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
