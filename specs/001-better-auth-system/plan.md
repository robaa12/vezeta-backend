# Implementation Plan: Authentication System (Better Auth)

**Branch**: `001-better-auth-system` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-better-auth-system/spec.md`

## Summary

Build the authentication system for a doctor appointment booking platform using
Better Auth integrated into NestJS + Prisma + PostgreSQL. The system supports
three roles (PATIENT, DOCTOR, SUPER_ADMIN), session-based auth with HTTP-only
cookies, email and phone OTP verification, doctor approval gating via a
DoctorProfile record, password reset via either channel, and Super Admin
management endpoints. Better Auth's `emailOTP` and `phoneNumber` plugins handle
all OTP flows; no custom JWT or hand-rolled OTP logic.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (LTS)

**Primary Dependencies**: NestJS 11, Better Auth (latest), @thallesp/nestjs-better-auth,
@better-auth/prisma-adapter, Prisma (latest), class-validator, class-transformer

**Storage**: PostgreSQL (via Prisma ORM)

**Testing**: Jest (unit) + Supertest (e2e), via `npm run test` and `npm run test:e2e`

**Target Platform**: Linux server (Node.js backend API)

**Project Type**: Web-service (REST API backend)

**Performance Goals**: Standard web app — auth endpoints respond in <500ms p95

**Constraints**: Session-based (no stateless JWT), HTTP-only cookies, Prisma-managed
migrations

**Scale/Scope**: MVP — single auth module, ~15 API endpoints, 4 database tables
(Better Auth core) + 1 domain table (DoctorProfile)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Module Architecture | PASS | Auth code lives in `src/auth/`, admin in `src/admin/`, shared prisma in `src/prisma/` |
| II. Domain-Event Decoupling | PASS | DoctorProfile creation on registration triggered via event/hook, not direct import |
| III. Single-Clinic Identity | PASS | DoctorProfile is 1:1 with User, no multi-doctor clinic modeling |
| IV. Transactional Data Integrity | PASS | No resource-claiming operations in auth module (booking is later) |
| V. Better Auth Schema Sovereignty | PASS | Schema generated via `npx auth generate`, DoctorProfile is separate model |
| VI. Auth & Access Control | PASS | Session-based via Better Auth, guards composed (RolesGuard, DoctorApprovedGuard) |
| VII. Phased Delivery | PASS | This is Phase 1 MVP — auth only, no payments or advanced security |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-better-auth-system/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Validation guide
├── contracts/           # Phase 1: API contracts
│   └── auth-api.md      # Auth + admin endpoint contracts
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── main.ts                        # NestJS bootstrap (bodyParser: false)
├── app.module.ts                  # Root module
├── auth/                          # Auth feature module
│   ├── auth.module.ts             # Module definition
│   ├── auth.ts                    # Better Auth instance configuration
│   ├── auth.controller.ts         # Auth-related endpoints (whoami, etc.)
│   ├── auth.service.ts            # Auth business logic (wraps Better Auth API)
│   ├── auth.guard.ts              # RolesGuard, DoctorApprovedGuard
│   ├── decorators/
│   │   └── roles.decorator.ts     # @Roles() decorator
│   └── dto/
│       └── register.dto.ts        # Registration input validation
├── admin/                         # Admin feature module
│   ├── admin.module.ts
│   ├── admin.controller.ts        # Admin endpoints (doctor mgmt, user mgmt)
│   ├── admin.service.ts           # Admin business logic
│   └── dto/
│       ├── approve-doctor.dto.ts
│       └── list-doctors.dto.ts
├── users/                         # Shared user module (minimal for auth)
│   ├── users.module.ts
│   └── users.service.ts           # User lookup helpers
├── prisma/                        # Shared Prisma service
│   ├── prisma.module.ts
│   └── prisma.service.ts          # PrismaClient wrapper
├── common/                        # Cross-cutting concerns
│   ├── guards/
│   │   └── doctor-approved.guard.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   └── interfaces/
│       └── session.interface.ts   # Typed session shape
└── seed/                          # Super Admin seed script
    └── seed.ts

prisma/
├── schema.prisma                  # Better Auth generated + DoctorProfile
└── migrations/                    # Prisma migration files

test/
├── jest-e2e.json
├── auth.e2e-spec.ts               # Auth flow e2e tests
└── admin.e2e-spec.ts              # Admin flow e2e tests
```

**Structure Decision**: Single NestJS project with feature-module layout per
Constitution Principle I. Auth and admin are separate feature modules. Prisma is
a shared infrastructure module. Common holds cross-cutting guards/decorators.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
