<!--
  Sync Impact Report
  ==================
  Version change: 1.0.0 → 2.0.0
  Modified principles:
    - V. Credential Security → V. Better Auth Schema Sovereignty (renamed + redefined)
    - VI. Auth & Access Control (major rewrite: JWT → session-based Better Auth)
    - III. Single-Clinic Identity (refined: explicit DoctorProfile 1:1 relation guidance)
  Added sections: None
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md   ✅ No changes needed (generic)
    - .specify/templates/spec-template.md    ✅ No changes needed (generic)
    - .specify/templates/tasks-template.md   ✅ No changes needed (generic)
  Follow-up TODOs:
    - plan.md (root) references JWT, RefreshToken, OtpCode models and JWT-specific
      guards — flagged for manual update to align with Better Auth paradigm.
-->

# Vezeeta Backend Constitution

## Core Principles

### I. Feature-Module Architecture

All code MUST be organized by feature module (auth, users, doctors,
appointments, reviews, payments, notifications, medical-records, admin),
not by technical layer. Each module owns its controller, service, DTOs,
and guards. No shared "services/" or "controllers/" directories.

**Rationale**: Feature modules keep related code co-located, making the
codebase navigable for a solo/small team and allowing features to be
developed, tested, and deployed independently.

### II. Domain-Event Decoupling

Cross-module communication MUST prefer domain events over direct
service-to-service calls, especially for side effects (e.g. sending
notifications after a booking). Modules MUST NOT import services from
other modules for non-read operations.

**Rationale**: Event-driven decoupling prevents cascading coupling as
the application grows and allows new side effects to be added without
modifying existing modules.

### III. Single-Clinic Identity

A clinic is always exactly one doctor's solo practice. There is no
separate "Clinic" entity. Multi-doctor clinic modeling MUST NOT be
introduced unless explicitly instructed.

Doctor-specific data (specialty, schedule, clinic info, approval
status) MUST live in a `DoctorProfile` table with a 1:1 relation to
Better Auth's `User` table, NOT as `additionalFields` on the Better
Auth user config. This keeps Better Auth's core schema clean and
separates identity from domain concerns.

**Rationale**: The Egyptian market target is solo medical practices.
Premature multi-doctor modeling adds schema complexity without current
business need. A separate DoctorProfile table cleanly isolates domain
data from the auth-managed user record.

### IV. Transactional Data Integrity

Any operation that claims a limited resource (e.g. booking an
appointment slot) MUST execute inside a database transaction with a
concurrent-availability check to prevent race conditions.

**Rationale**: Concurrent booking requests are a realistic threat;
without transactional isolation, double-bookings corrupt trust.

### V. Better Auth Schema Sovereignty

Better Auth owns the core identity tables (User, Session, Account,
Verification). These tables MUST be generated and managed via the
Better Auth CLI (`@better-auth/cli generate`) against the Prisma schema.
Developers MUST NOT manually edit Better Auth's generated models.

When Better Auth's config changes, the schema MUST be regenerated via
the CLI. Domain-specific fields (role, doctor approval status, clinic
info) MUST NOT be injected into Better Auth's core models — they belong
in separate domain tables (e.g. `DoctorProfile`).

Custom OTP generation or storage logic MUST NOT be hand-rolled. The
`emailOTP` and `phoneNumber` Better Auth plugins MUST be used for email
and phone verification/sign-in respectively, with delivery hooked in
via their callback functions.

**Rationale**: Treating Better Auth's schema as an external contract
prevents drift between the auth library's expectations and the database,
and ensures upgrades remain safe. Using the plugins' built-in flows
avoids duplicating security-sensitive logic.

### VI. Auth & Access Control

- Authentication MUST use Better Auth's session-based mechanism
  (server-side sessions, HTTP-only cookies) via the
  `@thallesp/nestjs-better-auth` NestJS adapter with the Prisma
  adapter. Manual JWT access/refresh token management MUST NOT be
  implemented.
- Route protection MUST use Better Auth's session/guard primitives
  (`@Session()`, `@AllowAnonymous()`, `@OptionalAuth()` from the NestJS
  adapter) layered with a custom `RolesGuard` and
  `DoctorApprovedGuard`. Session validation MUST NOT be reimplemented
  manually.
- Doctors MUST be approved by a Super Admin before protected routes
  become accessible, even though they can register and verify via OTP
  immediately. Approval status lives on `DoctorProfile`, not on Better
  Auth's core user model.
- Medical record access is restricted to only the treating doctor and
  the patient themselves, with no exceptions. This rule applies from
  day one, unlike general security hardening which may be phased in
  later.
- If a gap is found in what Better Auth provides, it MUST be addressed
  via Better Auth's plugin system first, before writing any custom auth
  code.

**Rationale**: Centralized guard composition keeps authorization logic
auditable and testable. Using Better Auth's session model eliminates
the complexity of manual token rotation, storage, and revocation.
Medical record access is a non-negotiable day-one constraint due to
patient data sensitivity.

### VII. Phased Delivery

Features MUST be built in phases: MVP (auth, doctor profiles, search,
booking) → trust features (reviews, notifications) → monetization
(payments) → operations (admin dashboard, security hardening). Payment
or advanced security features MUST NOT be built before the core booking
loop works end-to-end.

**Rationale**: Shipping a working booking flow first validates the
product before investing in secondary features.

## Technology Stack

The following technology choices are non-negotiable:

| Concern          | Choice                                              |
|------------------|-----------------------------------------------------|
| Framework        | NestJS (TypeScript)                                 |
| ORM              | Prisma                                              |
| Database         | PostgreSQL                                          |
| Authentication   | Better Auth (session-based, HTTP-only cookies) via  |
|                  | `@thallesp/nestjs-better-auth` NestJS adapter with  |
|                  | Prisma adapter                                      |
| Email Verify/OTP | Better Auth `emailOTP` plugin                       |
| Phone Verify/OTP | Better Auth `phoneNumber` plugin                    |

No alternative frameworks, ORMs, databases, or auth libraries may be
introduced without a constitution amendment.

## Code Quality & Delivery

- All input at API boundaries MUST be validated via DTOs with
  class-validator decorators.
- Controllers MUST NOT contain business logic; they handle only
  request/response shape and delegate to services.
- Every new module MUST include integration tests covering its primary
  flow before being considered done.
- Prefer explicit, readable code over clever abstractions. This is a
  solo/small-team project that must stay maintainable as features are
  added incrementally.

## Governance

- This constitution supersedes all other development practices and
  conventions in the repository.
- Amendments require: (1) a pull request modifying this file, (2) a
  rationale for the change, (3) a migration plan if the amendment
  invalidates existing code patterns.
- Versioning follows semantic versioning: MAJOR for backward-incompatible
  principle removals or redefinitions, MINOR for new principles or
  materially expanded guidance, PATCH for clarifications and wording.
- Compliance review: every PR and code review MUST verify adherence to
  the principles above. Violations must be justified in the PR
  description with a rationale and a plan to remediate.

**Version**: 2.0.0 | **Ratified**: 2026-07-11 | **Last Amended**: 2026-07-11
