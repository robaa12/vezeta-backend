# Quickstart: Social Login (Google & Facebook via Better Auth)

**Feature**: 002-social-oauth-login
**Date**: 2026-07-11

This document describes the runnable validation scenarios that prove the
social login feature works end-to-end. Each scenario is a sequence of
shell commands + manual steps + expected outcomes. Refer to
[`data-model.md`](./data-model.md) and
[`contracts/social-auth-api.md`](./contracts/social-auth-api.md) for the
underlying data and contract details.

## Prerequisites

1. **PostgreSQL running** (Docker Compose from the project root works):
   ```bash
   docker compose -f docker-compose.dev.yml up -d postgres
   ```

2. **Environment variables** in `.env` (sample values for a local mock
   OAuth server — see R9 in `research.md`):
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/vezeeta
   BETTER_AUTH_SECRET=replace-with-32-byte-secret
   BETTER_AUTH_URL=http://localhost:3000

   # Google — values from Google Cloud Console OAuth client
   GOOGLE_CLIENT_ID=mock-google-client-id
   GOOGLE_CLIENT_SECRET=mock-google-client-secret

   # Facebook — values from Facebook App Dashboard
   FACEBOOK_CLIENT_ID=mock-facebook-app-id
   FACEBOOK_CLIENT_SECRET=mock-facebook-app-secret
   ```

3. **Migrations applied** (inherited from feature 001 — the schema is
   unchanged but the migrations must be present):
   ```bash
   npx prisma migrate dev
   ```

4. **Mock OAuth server running** (test-only, not in production):
   ```bash
   # A test fixture that emulates Google's and Facebook's OAuth endpoints
   # on http://localhost:4001. The .env above points Better Auth at it.
   npm run mock:oauth
   ```

5. **API server running**:
   ```bash
   npm run start:dev
   ```

---

## Scenario 1: New user signs up via Google (US1)

**Acceptance criterion**: A new visitor can complete signup via Google in
under 60 seconds, ends up with a verified email and role PATIENT.

### Steps

```bash
# 1. Open browser to the Google sign-in flow (Better Auth initiates)
open "http://localhost:3000/api/auth/sign-in/social?provider=google&callbackURL=/patient/dashboard"

# 2. On the mock OAuth consent screen, click "Allow".
# 3. You should be redirected to /patient/dashboard with a session cookie set.
```

### Verification via API

```bash
# Read the session cookie from the browser, then call /me:
curl -s --cookie "better-auth.session_token=<paste-cookie>" \
  http://localhost:3000/api/auth/me | jq
```

**Expected**:
- HTTP 200
- `user.emailVerified === true`
- `user.role === "patient"`
- `user.image` is the URL from the mock Google profile
- `linkedSocialProviders` contains `[{ "provider": "google", "linkedAt": "..." }]`

### Database check

```bash
npx prisma studio
# → user table: 1 new row, emailVerified = true
# → account table: 1 new row, providerId = "google"
```

**Pass / Fail**:
- ✅ Pass: New user row + new account row, both as expected.
- ❌ Fail: Duplicate user, missing account row, or `role = "doctor"` (FR-004 violation).

---

## Scenario 2: New user signs up via Facebook (US2)

**Acceptance criterion**: Same as Scenario 1, but with Facebook.

### Steps

```bash
open "http://localhost:3000/api/auth/sign-in/social?provider=facebook&callbackURL=/patient/dashboard"
# Click "Allow" on the mock Facebook consent screen (which asks for email + public_profile).
```

### Verification via API

```bash
curl -s --cookie "better-auth.session_token=<cookie>" \
  http://localhost:3000/api/auth/me | jq '.user | {email, emailVerified, role, linkedSocialProviders}'
```

**Expected**:
- `emailVerified === true`
- `role === "patient"`
- `linkedSocialProviders` contains `[{ "provider": "facebook", "linkedAt": "..." }]`

**Pass / Fail**:
- ✅ Pass: New user + new Facebook account, role patient, email verified.
- ❌ Fail: User not created, or `emailVerified` is false (FR-003 violation).

---

## Scenario 3: Returning user signs in with Google (US3)

**Acceptance criterion**: Signing in with the same provider as signup does
NOT create a new user.

### Steps

```bash
# 1. Sign out (clear cookie)
curl -s -X POST http://localhost:3000/api/auth/sign-out --cookie "better-auth.session_token=<cookie>"

# 2. Sign in again with Google using the same mock profile as Scenario 1
open "http://localhost:3000/api/auth/sign-in/social?provider=google&callbackURL=/"
```

### Verification

```bash
# Database: still exactly 1 user row, 1 google account row.
# The userId in the google Account row matches the same user as in Scenario 1.
npx prisma studio
```

**Pass / Fail**:
- ✅ Pass: Same user id; no duplicate user or account.
- ❌ Fail: A new user was created, or the account row's `userId` changed.

---

## Scenario 4: Auto-link on email match (FR-007)

**Acceptance criterion**: A user who signed up via email/password can later
sign in with Google (using a Google account with the same verified email)
and the Google account is linked to the existing user.

### Steps

```bash
# 1. Sign up with email/password (from feature 001)
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@example.com","password":"hunter22!!","role":"patient"}'

# 2. Verify the email (OTP flow from feature 001) — assume cookie set after verify
# 3. Sign out
# 4. Sign in via Google, where the mock Google profile returns email=jane@example.com
open "http://localhost:3000/api/auth/sign-in/social?provider=google&callbackURL=/"
```

### Verification

```bash
# /me should show the SAME user id as step 1, with a Google account now linked.
curl -s --cookie "better-auth.session_token=<new-cookie>" http://localhost:3000/api/auth/me | jq
```

**Expected**:
- `user.id` matches step 1's user id.
- `linkedSocialProviders` contains `google`.
- The `account` table now has 2 rows for this user: one `credential`, one `google`.

**Pass / Fail**:
- ✅ Pass: Existing user id reused; Google account added.
- ❌ Fail: A new user with the same email was created (would fail DB unique
  constraint, but if it somehow succeeded, this is a critical bug).

---

## Scenario 5: Explicit link from profile settings (US5 / FR-009)

**Acceptance criterion**: An authenticated user can link Google via the
explicit link endpoint, and a mismatched email is rejected.

### Steps (happy path)

```bash
# Assume we are signed in as jane@example.com (credential account) and
# have a verified email.
curl -s -X POST http://localhost:3000/api/auth/link-social \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<jane-cookie>" \
  -d '{"provider":"google","callbackURL":"/profile"}'
```

**Expected** (200):
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

The frontend navigates to `url`. After consent, the callback runs and the
Google account is linked to Jane's existing user. `/me` then shows
`linkedSocialProviders: [{ provider: "google" }]`.

### Steps (mismatch)

```bash
# Same call but the mock Google profile returns email=other@example.com
# (different from the current session's user).
curl -s -X POST http://localhost:3000/api/auth/link-social \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<jane-cookie>" \
  -d '{"provider":"google"}'
# (The mock OAuth server is configured to return other@example.com)
```

**Expected** (422):
```json
{ "error": "email_mismatch" }
```

**Pass / Fail**:
- ✅ Pass: Happy path links the account; mismatch returns 422.
- ❌ Fail: Happy path fails or mismatch creates a new user.

---

## Scenario 6: Unlink with last-method protection (US6 / FR-013)

**Acceptance criterion**: A user cannot unlink their only sign-in method.

### Steps (success — user has password + Google)

```bash
curl -s -X DELETE http://localhost:3000/api/auth/social-accounts/google \
  -H "Cookie: better-auth.session_token=<jane-cookie>"
```

**Expected** (200):
```json
{ "provider": "google", "unlinkedAt": "2026-07-11T..." }
```

After this, Jane can no longer sign in with Google but can still sign in
with email/password. `/me` shows `linkedSocialProviders: []`.

### Steps (failure — Google-only user)

```bash
# 1. Sign in via Google (creates a Google-only user — no password).
# 2. Try to unlink Google:
curl -s -X DELETE http://localhost:3000/api/auth/social-accounts/google \
  -H "Cookie: better-auth.session_token=<google-only-user-cookie>"
```

**Expected** (422):
```json
{ "error": "cannot_unlink_last_method" }
```

**Pass / Fail**:
- ✅ Pass: Happy path unlinks; last-method unlink is rejected.
- ❌ Fail: User is locked out (the bug we are guarding against).

---

## Scenario 7: Deactivated user blocked from social sign-in (FR-014)

**Acceptance criterion**: A user with `isActive = false` cannot sign in via
a social provider.

### Steps

```bash
# 1. Sign up via Google (creates user as in Scenario 1).
# 2. Deactivate the user via Super Admin endpoint (from feature 001):
npx prisma studio
# → user table: set isActive = false for the test user

# 3. Sign out, then try to sign in with the same Google account:
open "http://localhost:3000/api/auth/sign-in/social?provider=google&callbackURL=/"
```

**Expected**:
- Redirect to `/?error=account_deactivated` (or equivalent error code).
- No new session is created.
- The user remains deactivated (isActive unchanged).

**Pass / Fail**:
- ✅ Pass: Sign-in rejected, no session issued.
- ❌ Fail: Sign-in succeeds and a session is issued for a deactivated user.

---

## Scenario 8: Deactivated user blocked from explicit link

**Acceptance criterion**: A deactivated user (somehow still has a session)
cannot link a new social provider.

### Steps

```bash
# 1. As an active user, sign in via credential.
# 2. While still signed in, an admin deactivates the user.
# 3. Try to link a new social provider:
curl -s -X POST http://localhost:3000/api/auth/link-social \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<stale-cookie>" \
  -d '{"provider":"facebook"}'
```

**Expected**: 403 with `{ error: "account_deactivated" }`.

**Pass / Fail**:
- ✅ Pass: Link rejected.
- ❌ Fail: Link succeeds.

---

## Scenario 9: Max one account per provider (FR-010)

**Acceptance criterion**: A user cannot link two different Google accounts.

### Steps

```bash
# 1. Sign in as a user with no linked Google account.
# 2. Link a Google account (Scenario 5 happy path).
# 3. Try to link a different Google account:
curl -s -X POST http://localhost:3000/api/auth/link-social \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<cookie>" \
  -d '{"provider":"google"}'
```

**Expected** (409):
```json
{ "error": "provider_already_linked" }
```

**Pass / Fail**:
- ✅ Pass: Second link is rejected.
- ❌ Fail: Second link succeeds, creating two Google accounts for the same user.

---

## Test Suite (npm)

The integration tests cover all of the above scenarios hermetically using
a mock OAuth server. Run them with:

```bash
npm run test:e2e -- --testPathPattern=social-auth
```

Expected output:
```
PASS test/auth/social-auth.e2e-spec.ts
  Social Login (Google & Facebook)
    ✓ New user signs up via Google
    ✓ New user signs up via Facebook
    ✓ Returning user signs in with Google
    ✓ Auto-link on email match (FR-007)
    ✓ Explicit link from profile settings (FR-009)
    ✓ Unlink with last-method protection (FR-013)
    ✓ Deactivated user blocked from social sign-in (FR-014)
    ✓ Deactivated user blocked from explicit link
    ✓ Max one account per provider (FR-010)

Tests: 9 passed
```

---

## Cleanup

```bash
# Stop the mock OAuth server
# Stop the API server (Ctrl+C)
# Drop the test database
docker compose -f docker-compose.dev.yml down -v
```

---

## Reference

- Spec: [`spec.md`](./spec.md)
- Plan: [`plan.md`](./plan.md)
- Research: [`research.md`](./research.md)
- Data model: [`data-model.md`](./data-model.md)
- API contracts: [`contracts/social-auth-api.md`](./contracts/social-auth-api.md)
- Upstream auth contracts: [`../001-better-auth-system/contracts/auth-api.md`](../001-better-auth-system/contracts/auth-api.md)
