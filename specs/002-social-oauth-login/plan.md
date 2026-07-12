# Implementation Plan: Social Login (Google & Facebook via Better Auth)

**Branch**: `002-social-oauth-login` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-social-oauth-login/spec.md`

## Summary

Add Google and Facebook social login to the Vezeeta backend by configuring
Better Auth's social providers in the existing `src/auth/auth.ts` instance
(from feature 001) and adding two thin custom controller endpoints
(`POST /api/auth/link-social` and `DELETE /api/auth/social-accounts/:provider`)
to enforce the business rules that Better Auth does not enforce on its own
(max-one-per-provider, last-method protection, email-match for explicit link,
deactivated-user block). The `Account` table from feature 001 already supports
OAuth provider rows, so **no database migration is required**. The existing
`/me` endpoint is extended (additive) with a `linkedSocialProviders` array.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (LTS) — inherited from feature 001

**Primary Dependencies**: NestJS 11, Better Auth (latest),
`@thallesp/nestjs-better-auth`, `@better-auth/prisma-adapter`, Prisma (latest),
class-validator, class-transformer — all inherited from feature 001; **no new
runtime dependencies** for this feature. The social provider functionality is
built into Better Auth core.

**Storage**: PostgreSQL (via Prisma ORM) — inherited from feature 001.
**No schema changes**; the existing `Account` table is used for OAuth provider
links.

**Testing**: Jest (unit) + Supertest (e2e) — inherited from feature 001.
A test-only mock OAuth server (described in `research.md` R9) emulates Google
and Facebook endpoints so the e2e tests can exercise the full callback path
without real provider credentials.

**Target Platform**: Linux server (Node.js backend API) — inherited from
feature 001.

**Project Type**: Web-service (REST API backend) — inherited from feature 001.

**Performance Goals**: Social sign-in round trip < 3s p95 (dominated by the
provider's OAuth flow + Better Auth's DB writes). Identical to feature 001's
<500ms p95 budget for non-OAuth routes.

**Constraints**:
- Session-based (no stateless JWT) — inherited
- HTTP-only cookies — inherited
- Prisma-managed migrations — inherited
- **No new database tables** for this feature
- The Account table's `providerId` column accepts `"google"` and `"facebook"`
  (no schema change needed; the column is already a free-form String)

**Scale/Scope**:
- 2 new OAuth providers (Google, Facebook) on top of the existing credential flow
- 2 new custom controller endpoints + 1 extended existing endpoint
- ~150 LoC of additions in `src/auth/auth.ts` (social provider config +
  accountLinking hook) and `src/auth/auth.controller.ts` (link/unlink wrappers)
- No new database tables, no new migrations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Module Architecture | PASS | All changes live in the existing `src/auth/` feature module. No new module. |
| II. Domain-Event Decoupling | PASS | No new cross-module side effects. The `accountLinking` hook is internal to the auth module. |
| III. Single-Clinic Identity | PASS | No doctor / clinic modeling changes. Social signup is PATIENT-only (per spec clarification). |
| IV. Transactional Data Integrity | PASS | No resource-claiming operations. The link/unlink endpoints each touch at most one Account row + one user state check; both are safe without explicit transactions. |
| V. Better Auth Schema Sovereignty | PASS | The existing `Account` table is reused for OAuth providers; no manual schema edits; `accountLinking` config is owned by Better Auth. No new domain fields injected into Better Auth's User model. |
| VI. Auth & Access Control | PASS | Reuses Better Auth's session-based auth, `@Session()` decorator, and `@AllowAnonymous()` for the public sign-in endpoint. The link/unlink endpoints require an active session. The `account.accountLinking` hook enforces deactivated-user blocking. |
| VII. Phased Delivery | PASS | This is an additive feature on top of the Phase 1 auth MVP. No payments, no advanced security, no new doctor flows. |

**Re-evaluation after Phase 1 design**: All gates still pass. The design
introduces no new architectural choices that would violate any principle.
The data model document explicitly notes that the `Account` table is reused
as-is (no manual schema edits), satisfying Principle V.

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-social-oauth-login/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Entity behavior + business rules
├── quickstart.md        # Phase 1: Validation guide
├── contracts/           # Phase 1: API contracts
│   └── social-auth-api.md
├── checklists/
│   └── requirements.md  # Quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — changes

This feature touches the existing `src/auth/` module. No new files at the
top level; no new directories.

```text
src/auth/
├── auth.ts                 # MODIFIED: add socialProviders + accountLinking config
├── auth.module.ts          # unchanged
├── auth.controller.ts      # MODIFIED: add POST /link-social and DELETE /social-accounts/:provider
├── auth.service.ts         # MODIFIED (small): add helper for "last sign-in method" count
├── auth.guard.ts           # unchanged
├── decorators/
│   └── roles.decorator.ts  # unchanged
└── dto/
    ├── register.dto.ts     # unchanged
    ├── link-social.dto.ts  # NEW: input validation for POST /link-social
    └── unlink-social.dto.ts # NEW: input validation for DELETE /social-accounts/:provider

prisma/
├── schema.prisma           # unchanged (Account table already supports OAuth)
└── migrations/             # no new migration

test/
└── auth/
    └── social-auth.e2e-spec.ts  # NEW: e2e tests for all 9 quickstart scenarios
```

**Structure Decision**: All work is localized to the existing
`src/auth/` feature module (per Constitution Principle I). The `Account`
table from feature 001 is reused without modification (per Principle V).
A small DTO file is added for each new endpoint to keep input validation
co-located with its controller (per the existing pattern in feature 001).

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
