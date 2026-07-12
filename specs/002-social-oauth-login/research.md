# Research: Social Login (Google & Facebook via Better Auth)

**Feature**: 002-social-oauth-login
**Date**: 2026-07-11
**Upstream**: 001-better-auth-system (NestJS + Better Auth + Prisma + PostgreSQL)

## R1: Better Auth Social Provider Configuration

**Decision**: Configure Google and Facebook as social providers in the existing
Better Auth instance via the `socialProviders` option. Each provider is given its
client ID, client secret, and required scope list.

**Rationale**: Better Auth has first-class support for Google and Facebook through
its `socialProviders` config block. The library handles the entire OAuth 2.0
authorization-code flow, state generation/validation, code exchange, ID token /
profile parsing, session creation, and account linking. No custom OAuth client
code is needed. Reusing the existing `AuthModule` (from feature 001) means zero
new infrastructure — just config.

**Alternatives considered**:
- Custom OAuth client using `passport-google-oauth20` and `passport-facebook` —
  rejected: constitution Principle V/VI forbids hand-rolled auth logic.
- Frontend-only OAuth (Firebase Auth) — rejected: would split identity out of
  Better Auth and break the session model.

**Key patterns**:
- Add `socialProviders: { google: {...}, facebook: {...} }` to `auth.ts`
- `clientId` and `clientSecret` from env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- `scope` is the requested permission set; the email scope is mandatory per FR-008
- `redirectURI` is computed by Better Auth from the request base URL +
  `/api/auth/callback/<provider>` by default; the same value must be whitelisted
  in the Google Cloud Console and Facebook App Dashboard

**Endpoints exposed by Better Auth** (no custom controller code):
- `GET /api/auth/sign-in/social` — initiates OAuth flow (provider in query)
- `GET /api/auth/callback/google` — Google callback
- `GET /api/auth/callback/facebook` — Facebook callback
- `POST /api/auth/sign-in/social` — non-redirect variant for SPA fetch

---

## R2: Account Linking Behavior

**Decision**: Enable Better Auth's built-in `accountLinking.enabled: true` so that
when a verified user signs in via a social provider whose email matches their
existing account, the library automatically creates an `Account` row linked to
the existing `User` rather than a duplicate user.

**Rationale**: This implements FR-007 (auto-link on email match) and FR-005
(returning social user signs in without creating a new account) without custom
code. Better Auth compares the provider's verified email to existing users and
either links or creates based on configuration. Email verification at signup
comes for free (FR-003) because the email was verified by the provider.

**Key patterns**:
- `accountLinking: { enabled: true, trustedProviders: ["google", "facebook"] }`
- `trustedProviders` skips the "confirm linking" UI step — necessary because
  our flow must be fully automatic on verified-email match
- A new `User` row is created when no existing user has the matching verified
  email
- The `Account` row created on link has `providerId = "google" | "facebook"`

**Alternatives considered**:
- Manual linking via custom controller — rejected: duplicates Better Auth's
  internal flow and risks race conditions.
- `accountLinking.enabled: false` + manual linking only — rejected: FR-007
  requires automatic linking on first social sign-in.

**Gotchas**:
- If a user's account has `isActive = false` (deactivated), the auto-link
  branch must short-circuit and return "account deactivated" — handled in
  FR-014 via Better Auth's `account.accountLinking` hook returning
  `{ disabled: true }` based on user state.
- Race condition: two simultaneous social signups with the same email could
  both try to create a new user. Better Auth handles this with a DB unique
  constraint on `User.email`; the loser becomes a 409.

---

## R3: Explicit Link & Unlink Endpoints

**Decision**: Better Auth exposes built-in social sign-in endpoints that perform
the same action as the auto-link, but for an already-authenticated user
("link another account to the current session"). We will wrap two thin custom
endpoints on top of Better Auth's handler so we can add the business rules
from FR-009/FR-010 (email-match check, max-one-per-provider, FR-013 last-method
protection):

- `POST /api/auth/link-social` — initiate a social link for the current
  authenticated user. Reuses the same `socialProviders` config; the resulting
  callback writes the `Account` row tied to the current `userId` (not a new
  user) because the session is already attached.
- `DELETE /api/auth/social-accounts/:provider` — unlink a previously linked
  provider, guarded by the "last sign-in method" check.

**Rationale**: Better Auth's link-account endpoint exists but does not enforce
our "max one per provider" rule (FR-011) or our "cannot unlink last sign-in
method" rule (FR-013). The thin wrapper reads the current `Account` set and
rejects the operation before delegating to Better Auth.

**Key patterns**:
- Link endpoint checks: (a) user has a verified email that matches the OAuth
  profile's email (server-side re-check), (b) no existing Account with the
  same `providerId` already linked.
- Unlink endpoint checks: (a) an Account with the given `providerId` exists
  for the current user, (b) the user has at least one remaining sign-in
  method (a credential `Account` with `password != null`, or another linked
  social `Account`).

**Alternatives considered**:
- Using only Better Auth's stock endpoints — rejected: cannot satisfy the
  last-method protection rule without a hook into the unlink call.
- Implementing the entire link/unlink as a custom OAuth client — rejected:
  constitution forbids hand-rolled OAuth.

**Gotchas**:
- The "last sign-in method" check requires knowing whether a credential
  `Account` with a `password` exists. Better Auth's credential provider
  creates exactly one such Account per email/password user. A user who signed
  up via social only has zero credential Accounts.
- The link endpoint must NOT create a new user — Better Auth's stock handler
  could; the wrapper passes `disableSignUp: true` in the social sign-in
  options so the callback fails gracefully if no matching user exists.

---

## R4: "Who Am I" Extension for Provider Info

**Decision**: Extend the existing `GET /api/auth/me` (or `/api/auth/whoami`)
endpoint from feature 001 to include the list of linked social providers
per user, satisfying FR-015.

**Rationale**: The frontend needs to know which "Continue with X" buttons to
show. Including the list in the profile response avoids a separate round trip.

**Key patterns**:
- Query `Account` table for rows where `userId = currentUser.id` and
  `providerId IN ("google", "facebook")`
- Return a list `[{ provider: "google", linkedAt: "..." }, ...]`
- Existing `auth.controller.ts` (from feature 001) is extended; the response
  shape gains a new `linkedSocialProviders` field — backward-compatible addition

**Alternatives considered**:
- A separate `GET /api/auth/social-accounts` endpoint — rejected: one fewer
  round trip is better for the profile page render.

---

## R5: Frontend Integration (Backend Contract)

**Decision**: The frontend is responsible for the "Continue with Google" /
"Continue with Facebook" buttons. On click, the frontend issues a top-level
navigation (or window.location redirect) to `GET /api/auth/sign-in/social?provider=<p>&callbackURL=<url>`.
The backend handles the entire OAuth dance; on success, the user is
redirected back to `callbackURL` with a valid session cookie set.

**Rationale**: This matches the spec's "backend-only feature" assumption and
is the standard SPA-friendly Better Auth pattern. The callbackURL is a
frontend route (e.g. `/patient/dashboard`); the backend never interprets it.

**Alternatives considered**:
- A JSON-only API where the frontend separately does the OAuth flow with
  Google/Flutter SDKs — rejected: would require the frontend to hold OAuth
  client secrets, which is insecure.

---

## R6: Deactivated User Sign-In via Social

**Decision**: Better Auth's `account.accountLinking` hook (already used for
auto-link) is also used to short-circuit social sign-in for deactivated users
(`User.isActive = false`), per FR-014.

**Rationale**: The hook fires before account creation/linking in both the
auto-link and explicit-link paths. Returning a sentinel `{ disabled: true,
reason: "account_deactivated" }` makes Better Auth reject the sign-in with
a clear error that our custom controller surfaces to the frontend.

**Key patterns**:
- The hook receives the resolved `User` (matched by email) and the OAuth
  profile. If `user.isActive === false`, return disabled.
- For NEW social signups where the user doesn't exist yet, the user is
  created with `isActive = true` (the default), so this hook only affects
  returning sign-ins.

---

## R7: Token Storage and Minimal Surface

**Decision**: Trust Better Auth's `Account` table schema (already in
`prisma/schema.prisma`) to store `accessToken`, `refreshToken`, `idToken`,
`accessTokenExpiresAt`, `refreshTokenExpiresAt`, and `scope`. The backend
will not read or refresh these tokens itself; per FR-016, "no token hoarding".

**Rationale**: The `Account` table from feature 001 was generated by
`npx auth generate` with exactly these columns for OAuth. Better Auth uses
them internally to refresh provider access on subsequent sign-ins. Our
application code never inspects them.

**Alternatives considered**:
- Storing tokens in a separate `OAuthToken` table — rejected: duplicates
  Better Auth's storage and creates a sync problem.
- Forbidding token storage entirely — rejected: Better Auth needs the
  refresh token to fetch updated profile info on subsequent sign-ins.

---

## R8: Security Considerations

**Decisions**:
- **State parameter (FR-017)**: Better Auth generates and validates a CSRF
  state cookie during the OAuth flow. No custom state handling needed.
- **Redirect URI allowlist**: each provider's developer console must whitelist
  the exact callback URL (`{BASE_URL}/api/auth/callback/<provider>`) for
  both local and production environments.
- **HTTPS in production**: Better Auth's cookie options default to `secure:
  true` in production; we keep that default.
- **Scope minimization**: only request `openid email profile` (Google) and
  `email public_profile` (Facebook). Never request `contacts`, `friends_list`,
  or any other broad scope.
- **Error page**: Better Auth's default error redirect is to
  `/?error=<code>`. Our frontend will read the error code and display a
  localized message; no backend change needed.

---

## R9: Testing Strategy

**Decision**: Integration tests via Supertest (existing pattern from feature
001) hitting the real OAuth callback URLs with a mocked provider HTTP
server. Unit tests cover the link/unlink business rules in isolation.

**Rationale**: Real OAuth flows cannot be tested in CI without storing real
client credentials. A mock OAuth server (e.g. a small Express app that
returns a stubbed Google/Facebook profile response) lets the e2e test
exercise the full callback path while remaining hermetic.

**Key patterns**:
- Mock provider: a test-only route returns a valid OAuth code and a stub
  ID token; the test environment is configured to point Better Auth at the
  mock provider URL via env vars.
- For the unit tests of the link/unlink wrapper, mock the Better Auth
  handler and assert on the pre-conditions checked (email match, max-one,
  last-method).

**Alternatives considered**:
- Skipping the OAuth round trip in tests and only unit-testing the
  controller methods — rejected: misses the most error-prone part of the
  flow (state validation, callback parsing).

---

## R10: Migration & Backwards Compatibility

**Decision**: No database migration is needed for this feature. The `Account`
table from feature 001 already has the columns Better Auth needs for social
providers (`providerId`, `accessToken`, `refreshToken`, etc.). Adding the
`socialProviders` block to `auth.ts` is a pure code change.

**Rationale**: This is the cleanest possible "additive" feature: no new
tables, no schema change, no data backfill. Existing users (with credential
Accounts) are unaffected until they explicitly link a social provider.

**Alternatives considered**:
- Adding a `User.socialProviderEmail` field — rejected: redundant with
  what's already in `Account`.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Social providers | `socialProviders.google` and `socialProviders.facebook` in `auth.ts` |
| Credentials source | Env vars `GOOGLE_CLIENT_ID`/`SECRET`, `FACEBOOK_CLIENT_ID`/`SECRET` |
| Auto-linking | `accountLinking.enabled = true`, `trustedProviders = [google, facebook]` |
| Explicit link endpoint | Custom `POST /api/auth/link-social` wrapper with business rules |
| Unlink endpoint | Custom `DELETE /api/auth/social-accounts/:provider` with last-method guard |
| Provider info in "me" | Extend existing `/api/auth/me` with `linkedSocialProviders` array |
| Deactivated user block | `account.accountLinking` hook short-circuits when `isActive = false` |
| Schema migration | None — existing `Account` table already supports social providers |
| Tests | Supertest e2e with a mock OAuth provider; unit tests for link/unlink rules |
