# Research: Authentication System (Better Auth)

**Feature**: 001-better-auth-system
**Date**: 2026-07-11

## R1: NestJS + Better Auth Integration

**Decision**: Use `@thallesp/nestjs-better-auth` as the integration layer.

**Rationale**: Community-maintained adapter that provides a global `AuthGuard`,
`@Session()` decorator, `@AllowAnonymous()`, `@OptionalAuth()`, and full DI
integration. Handles body parser quirks (NestJS must disable its own body parser
so Better Auth can handle its own routes).

**Alternatives considered**:
- Custom middleware wrapping Better Auth handler — rejected: would need to
  replicate guard logic, CORS handling, and cookie parsing manually.
- Passport.js — rejected: constitution mandates Better Auth.

**Key patterns**:
- `NestFactory.create(AppModule, { bodyParser: false })` is required
- `AuthModule.forRoot({ auth })` registers the Better Auth instance globally
- `@Session()` injects `{ user, session }` into controller methods
- Global auth guard is on by default; use `@AllowAnonymous()` to skip

**Gotchas**:
- Must disable NestJS body parser or Better Auth routes will fail
- For hooks/decorators: must set `hooks: {}` in `betterAuth()` config
- For database hooks: must set `databaseHooks: {}` in config

---

## R2: Better Auth Core + Prisma Adapter

**Decision**: Better Auth v1.6+ with `@better-auth/prisma-adapter`.

**Rationale**: Framework-agnostic auth library with built-in session management,
password hashing (scrypt), plugin ecosystem, and native Prisma support. HTTP-only
cookie sessions match the constitution's requirement.

**Alternatives considered**:
- NextAuth.js — rejected: tied to Next.js ecosystem
- Custom session implementation — rejected: constitution forbids hand-rolled auth

**Key patterns**:
- `prismaAdapter(prisma, { provider: "pg" })` connects Better Auth to PostgreSQL
- `emailAndPassword.enabled: true` is required for credential-based auth
- Passwords stored in `Account` table with `providerId: "credential"`
- `npx auth generate` scaffolds Prisma schema for all Better Auth tables

**Gotchas**:
- `npx auth generate` does NOT run migrations — use `npx prisma migrate dev` after
- Re-running `npx auth generate` after plugin changes may overwrite manual edits
- Passwords are in `Account`, not `User` table

---

## R3: emailOTP Plugin

**Decision**: Use `emailOTP` plugin for email verification and email-based
password reset.

**Rationale**: Built-in plugin that handles OTP generation, storage, expiry, and
verification. Provides `sendVerificationOTP` callback for email delivery. Replaces
the default link-based email verification with OTP codes.

**Alternatives considered**:
- Custom OTP generation + storage — rejected: constitution forbids hand-rolled OTP
- Link-based verification — rejected: spec requires OTP codes for both channels

**Key patterns**:
- `sendVerificationOTP({ email, otp, type })` callback for delivery
- `type` is `"sign-in" | "email-verification" | "forget-password"`
- `overrideDefaultEmailVerification: true` switches from link to OTP
- Endpoints: `/email-otp/send-verification-otp`, `/email-otp/check-verification-otp`

**Gotchas**:
- Don't await the `sendVerificationOTP` callback (timing attack prevention)
- Default OTP length: 6 digits, expiry: 5 minutes, attempts: 3

---

## R4: phoneNumber Plugin

**Decision**: Use `phoneNumber` plugin for phone verification and phone-based
sign-in and phone-based password reset.

**Rationale**: Built-in plugin for SMS OTP flows. Adds `phoneNumber` and
`phoneNumberVerified` fields to the User model. Provides phone-based sign-in
with password.

**Alternatives considered**:
- Custom SMS OTP — rejected: constitution forbids hand-rolled OTP
- Phone-only auth (no password) — rejected: spec requires password-based auth

**Key patterns**:
- `sendOTP({ phoneNumber, code })` callback for SMS delivery
- Adds `phoneNumber` and `phoneNumberVerified` to User schema
- Endpoints: `/phone-number/send-otp`, `/phone-number/verify`,
  `/sign-in/phone-number`

**Gotchas**:
- Phone sign-in with password requires `account` record with
  `providerId: "credential"` — sign-up must create this
- `signUpOnVerification` config needed if phone-only registration is desired
  (not needed for our case — we always require email + phone)

---

## R5: Password Reset Flow

**Decision**: Use emailOTP plugin for email-based reset and phoneNumber plugin
for phone-based reset. Both use OTP codes (not links).

**Rationale**: Consistent UX — all verification uses OTP codes. No redirect URLs
needed (better for mobile). Both plugins provide reset endpoints out of the box.

**Alternatives considered**:
- Link-based email reset + OTP phone reset — rejected: inconsistent UX
- Custom reset flow — rejected: plugins already provide this

**Key patterns**:
- Email reset: `/email-otp/request-password-reset` → `/email-otp/reset-password`
- Phone reset: `/phone-number/request-password-reset` → `/phone-number/reset-password`
- `revokeSessionsOnPasswordReset: true` in `emailAndPassword` config

**Gotchas**:
- `revokeSessionsOnPasswordReset` defaults to `false` — must be explicitly set
- Both channels must work independently per spec

---

## R6: Session Management

**Decision**: Better Auth's default cookie-based sessions. 7-day expiry, 1-day
refresh window.

**Rationale**: Matches constitution requirement for server-side sessions with
HTTP-only cookies. No custom token management needed.

**Key patterns**:
- `@Session()` decorator injects `{ user, session }` in controllers
- `auth.api.signOut({ headers })` destroys current session
- `auth.api.revokeSessions()` revokes all sessions for a user
- Session data available via `req.session` and `req.user`

**Gotchas**:
- Cookie cache (default 5 min) means revoked sessions may stay active briefly
  on other devices — acceptable for MVP
- `freshAge` controls "fresh" session window for sensitive operations

---

## R7: Prisma Schema Generation

**Decision**: Use `npx auth generate` to scaffold Better Auth tables, then add
DoctorProfile manually alongside.

**Rationale**: Keeps Better Auth's schema in sync with its internal expectations.
DoctorProfile is a separate model with 1:1 relation to User, per constitution.

**Workflow**:
1. `npx prisma init` — create initial schema
2. `npx auth generate` — add Better Auth tables
3. Add `DoctorProfile` model manually
4. `npx prisma migrate dev --name init` — create initial migration

**Generated tables**: User, Session, Account, Verification
**Custom tables**: DoctorProfile

**Gotchas**:
- Back up `schema.prisma` before re-running `npx auth generate`
- `npx auth generate` only generates schema, not migrations
- For Prisma 7+, ensure `output` path is set in `schema.prisma`

---

## R8: Doctor Approval Gate Implementation

**Decision**: DoctorProfile.status field (PENDING/APPROVED/REJECTED/SUSPENDED)
checked by a `DoctorApprovedGuard`. Login succeeds regardless of status, but
the response includes the approval status so the frontend can show a message.

**Rationale**: Separates authentication (who you are) from authorization (what
you can do). Login should never be blocked for verified users — the gate is on
route access, not session creation.

**Key patterns**:
- `DoctorApprovedGuard` checks `DoctorProfile.status === "APPROVED"`
- Applied to doctor-only routes via `@UseGuards(DoctorApprovedGuard)`
- "Who am I" endpoint returns `doctorProfile.status` if user is a doctor
- DoctorProfile created via Better Auth `after` hook on sign-up (when role=doctor)

**Alternatives considered**:
- Blocking login for PENDING doctors — rejected: spec says login succeeds
- Checking approval in every controller method — rejected: guard composition is
  cleaner per constitution

---

## R9: Super Admin Seeding

**Decision**: Standalone TypeScript script (`src/seed/seed.ts`) that creates a
Super Admin user via Better Auth's API if one doesn't exist. Run via
`npx ts-node src/seed/seed.ts`.

**Rationale**: Idempotent, uses the same auth API as regular sign-up, credentials
from environment variables. No special "admin registration" endpoint needed.

**Key patterns**:
- Check if user with `SUPER_ADMIN` role exists
- If not, create via `auth.api.signUpEmail()` with role override
- Credentials from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PHONE`, `SEED_ADMIN_PASSWORD`,
  `SEED_ADMIN_NAME` env vars

**Alternatives considered**:
- SQL insert directly — rejected: bypasses Better Auth's password hashing
- Dedicated admin creation endpoint — rejected: unnecessary surface area

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Auth library | Better Auth with Prisma adapter |
| NestJS integration | @thallesp/nestjs-better-auth |
| Email verification | emailOTP plugin (OTP, not link) |
| Phone verification | phoneNumber plugin |
| Password reset | Both plugins (email OTP + phone OTP) |
| Sessions | Cookie-based, 7-day expiry |
| Schema management | `npx auth generate` + manual DoctorProfile |
| Doctor gate | DoctorApprovedGuard on routes, not login |
| Admin seeding | Standalone script via Better Auth API |
