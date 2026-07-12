# Implementation Plan: Doctor Search & Discovery (Module 2)

**Branch**: `004-doctor-search` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-doctor-search/spec.md`

**Upstream**: 003-remove-doctor-role (the `Doctor` table + admin CRUD).
This feature is the public read surface over the same table.

## Summary

Add the patient-facing public doctor surface per `plan.md` §5
"Module 2 — Doctors (Profile, Search, Filtering)". A new
`src/doctors/` feature module exposes three anonymous endpoints:
a paginated/filterable listing, a public profile by id, and a
specialties dropdown endpoint. Doctors are read from the
existing `Doctor` table (populated by admins via feature 003).
No new database tables, no schema changes, no new third-party
dependencies beyond the optional `@nestjs/throttler` (for
rate limiting per FR-014 — confirm dependency status during
implementation).

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (LTS) — inherited.

**Primary Dependencies**: NestJS 11, Prisma, Better Auth —
inherited. **Possibly new**: `@nestjs/throttler` (rate
limiting). To be confirmed in the implementation phase —
may already be in the dependency tree or may need to be
added.

**Storage**: PostgreSQL (via Prisma ORM) — inherited.
**No schema changes.** The `Doctor` table from feature 003 is
read-only here.

**Testing**: Jest (unit) + Supertest (e2e) — inherited.

**Target Platform**: Linux server (Node.js backend API) —
inherited.

**Project Type**: Web-service (REST API backend) — inherited.

**Performance Goals**:
- Listing endpoint: < 300ms p95 (read query, indexed
  `status` and `specialty`)
- Profile endpoint: < 100ms p95 (single-row PK lookup)
- Specialties endpoint: < 200ms p95 (small distinct query)

**Constraints**:
- Session-based auth is inherited; this feature is anonymous
  on top of that auth layer.
- Prisma-managed migrations are inherited; no migration
  needed.
- The 5-second freshness target (FR-013) means no in-process
  cache; every public request reads the DB.
- Cache-Control headers are advisory; intermediaries may
  cache longer than the spec's `max-age`.

**Scale/Scope**:
- 1 new feature module: `src/doctors/`
- 3 controller endpoints, 3 service methods
- 1 query DTO
- 1 new e2e test file
- ~300-400 LoC of additions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Module Architecture | PASS | The public doctor surface lives in a new `src/doctors/` module, separate from `src/admin/` (write side) and `src/auth/` (auth). Mirrors the established pattern. |
| II. Domain-Event Decoupling | PASS | This feature is read-only. No cross-module side effects. No event emission. |
| III. Single-Clinic Identity | PASS | No change to the doctor-as-data-record model from feature 003. No new entities, no multi-clinic modeling. |
| IV. Transactional Data Integrity | PASS | All queries are read-only (`findMany`, `findFirst`, `count`). No resource-claiming operations. No transactions needed. |
| V. Better Auth Schema Sovereignty | PASS | This feature does NOT touch Better Auth's schema. It reads the standalone `Doctor` table (which is a domain table, not a Better Auth table). |
| VI. Auth & Access Control | PASS | All three endpoints are `@AllowAnonymous()`. The `RolesGuard` and `DoctorApprovedGuard` (deleted in feature 003) are not used. No re-implementation of Better Auth primitives. |
| VII. Phased Delivery | PASS | This is a planned Phase 2 module per `plan.md` §13 (Phased Build Roadmap). It depends on feature 003 (doctor CRUD), which has shipped. |

**Re-evaluation after Phase 1 design**: All gates still pass.
The data model document explicitly notes that no new tables or
indexes are needed, satisfying Principle V. The module is
self-contained and does not import any other feature module.

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/004-doctor-search/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Read patterns + caching strategy
├── quickstart.md        # Phase 1: Validation guide
├── contracts/           # Phase 1: API contracts
│   └── doctor-search-api.md
├── checklists/
│   └── requirements.md  # Quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — additions

This feature introduces a new top-level module. No existing
files are modified (except `src/app.module.ts` to register the
new module, and possibly `package.json` to add
`@nestjs/throttler` if not already present).

```text
src/
├── doctors/                          # NEW feature module
│   ├── doctors.module.ts             # Module definition
│   ├── doctors.controller.ts         # 3 public endpoints
│   ├── doctors.service.ts            # 3 read methods
│   ├── doctors.service.spec.ts       # Unit tests
│   └── dto/
│       └── list-doctors.dto.ts       # Query DTO
├── app.module.ts                     # MODIFIED: register DoctorsModule
└── ... (other modules unchanged)

test/
├── doctors-public.e2e-spec.ts        # NEW: 11 e2e scenarios
```

**Structure Decision**: A new `src/doctors/` module is added
per Constitution Principle I. The admin CRUD in `src/admin/`
and the public surface in `src/doctors/` are separate concerns
with separate auth requirements (admin vs anonymous). The
`Doctor` Prisma model is shared between them (read-write on
admin, read-only on doctors).

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
