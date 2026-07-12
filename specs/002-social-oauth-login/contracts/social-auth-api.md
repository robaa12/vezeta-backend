# API Contracts: Social Login (Google & Facebook via Better Auth)

**Feature**: 002-social-oauth-login
**Date**: 2026-07-11
**Upstream**: 001-better-auth-system/contracts/auth-api.md

## Overview

This document defines the new API surface introduced by social login.
Existing endpoints from feature 001 (sign-up, sign-in, sign-out, "who am I",
password reset, admin) are unchanged in behavior but the `/me` response is
extended with social provider information.

**Base URL**: `http://localhost:3000` (development) — same as feature 001.

**Authentication**: Session-based via HTTP-only cookies. All new endpoints
require an active session unless explicitly noted as anonymous.

**Error format**: Errors use Better Auth's standard format (or our controller
shapes — see each endpoint).

---

## Better Auth Managed Routes (no custom code)

These endpoints are added by configuring `socialProviders` and
`accountLinking` in `src/auth/auth.ts`. No custom controller code is needed.

### GET /api/auth/sign-in/social

Initiates the OAuth flow for a social provider. The frontend navigates the
browser to this URL when the user clicks "Continue with Google" or
"Continue with Facebook".

**Query parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| provider | string | yes | `"google"` or `"facebook"` |
| callbackURL | string | optional | Frontend route to redirect to after success. Defaults to `/` |

**Example**:
```
GET /api/auth/sign-in/social?provider=google&callbackURL=/patient/dashboard
```

**Behavior**:
- Generates a CSRF `state` cookie.
- Redirects (302) to the provider's authorization endpoint with the
  registered scopes (`openid email profile` for Google, `email public_profile`
  for Facebook).
- After consent, the provider redirects back to
  `/api/auth/callback/<provider>?code=...&state=...`.

**Failure cases**:
- Unknown `provider` → 400 with `{ error: "invalid_provider" }`.
- Missing OAuth client credentials in env → 500 with `{ error: "provider_not_configured" }`.

---

### GET /api/auth/callback/google

**GET /api/auth/callback/facebook**

Provider callback. The frontend never hits these directly; they are invoked
by Google/Facebook after the user consents.

**Query parameters** (set by the provider, not the frontend):

| Name | Type | Description |
|------|------|-------------|
| code | string | Authorization code |
| state | string | CSRF state from the initial redirect |

**Success behavior**:
1. Validates the `state` parameter against the cookie set during
   `/api/auth/sign-in/social` (FR-017).
2. Exchanges the code for an access token + ID token + user profile.
3. Invokes the `account.accountLinking` hook:
   - **No existing user with this verified email** → creates a new `User`
     with `role = "patient"`, `emailVerified = true`, `name` and `image` from
     the profile, and a new `Account` row with `providerId = "google"`.
   - **Existing verified user with matching email** → creates a new
     `Account` row linked to the existing user (FR-007). No new `User` is
     created.
   - **Existing user with `isActive = false`** → returns 403 with
     `{ error: "account_deactivated" }` (FR-014).
4. Creates a `Session` and sets the session cookie.
5. Redirects (302) to `callbackURL` (or `/` if absent).

**Failure cases**:
- State mismatch / missing state → 400 with `{ error: "invalid_state" }` (FR-017).
- Provider returns no email or email not verified → 400 with
  `{ error: "email_required" }` (FR-008).
- Provider returns email that doesn't match any user AND `disableSignUp: true`
  was set (explicit link path) → 422 with `{ error: "email_mismatch" }`
  (FR-009/FR-010).
- Provider 5xx or network error → 502 with `{ error: "provider_unavailable" }`.

---

## Custom Controller Endpoints

These endpoints are implemented in `src/auth/auth.controller.ts` (the file
from feature 001) using existing Prisma client and Better Auth session.

### POST /api/auth/link-social

Initiate linking a social provider to the currently authenticated user. The
response is a redirect URL the frontend should navigate to (it begins the
OAuth flow against the provider).

**Auth**: required (current session).

**Request body**:
```json
{
  "provider": "google",
  "callbackURL": "/profile/settings"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider | string | yes | `"google"` or `"facebook"` |
| callbackURL | string | optional | Frontend route to return to after the link completes |

**Response** (200):
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&state=...&scope=openid+email+profile"
}
```

**Behavior**:
1. Verifies the current user has a verified email (`User.emailVerified = true`).
2. Verifies no `Account` row with `(userId = currentUser.id, providerId = provider)`
   already exists (FR-010).
3. Generates a link-init URL using the same Better Auth social sign-in
   mechanism, but with `disableSignUp: true` so the callback can only link
   the current user (FR-009 — email must match).
4. Returns the URL for the frontend to navigate to.

**Failure cases**:
- 401 — No active session.
- 400 — `provider` is not `"google"` or `"facebook"`.
- 409 — User already has a linked account with this provider
  (FR-010). Response: `{ error: "provider_already_linked" }`.
- 403 — User's email is not verified (FR-009 requires a verified email match).
  Response: `{ error: "email_not_verified" }`.

---

### DELETE /api/auth/social-accounts/:provider

Unlink a previously linked social provider from the current user.

**Auth**: required (current session).

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| provider | string (path) | `"google"` or `"facebook"` |

**Request body**: none.

**Response** (200):
```json
{
  "provider": "google",
  "unlinkedAt": "2026-07-11T10:30:00Z"
}
```

**Behavior**:
1. Looks up the `Account` row with `(userId = currentUser.id, providerId = provider)`.
2. If none exists → 404.
3. Counts the user's remaining sign-in methods:
   - +1 if a credential `Account` exists with `password IS NOT NULL`.
   - +1 for each other social `Account` (Google, Facebook).
4. If count == 1 (i.e. this is the last sign-in method) → 422 with
   `{ error: "cannot_unlink_last_method" }` (FR-013).
5. Deletes the `Account` row. Any active `Session` for this user remains
   valid (unlinking does not invalidate sessions; the user can still use
   any other linked sign-in method on their next request).

**Failure cases**:
- 401 — No active session.
- 404 — No linked account with this provider for the current user.
- 422 — Cannot unlink the last sign-in method (FR-013).
  Response: `{ error: "cannot_unlink_last_method" }`.

---

## Extended Existing Endpoints

### GET /api/auth/me (or /api/auth/whoami — whichever feature 001 uses)

**Auth**: required.

**Response** (200) — extended from feature 001:
```json
{
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": true,
    "role": "patient",
    "image": "https://lh3.googleusercontent.com/...",
    "phoneNumber": null,
    "phoneNumberVerified": false,
    "isActive": true,
    "createdAt": "2026-07-11T10:00:00Z",
    "linkedSocialProviders": [
      { "provider": "google", "linkedAt": "2026-07-11T10:00:05Z" },
      { "provider": "facebook", "linkedAt": "2026-07-11T10:05:12Z" }
    ]
  },
  "session": {
    "id": "sess_...",
    "expiresAt": "2026-07-18T10:00:00Z"
  }
}
```

**New field**: `linkedSocialProviders` — an array of objects describing
the social accounts linked to this user. Each object has:

| Field | Type | Description |
|-------|------|-------------|
| provider | string | `"google"` or `"facebook"` |
| linkedAt | string (ISO 8601) | `Account.createdAt` |

**Behavior**:
- The response is backward-compatible — existing clients that don't read
  `linkedSocialProviders` see the same shape as feature 001.
- The list is derived by querying `Account` for the current user where
  `providerId IN ("google", "facebook")`.
- For a credential-only user, the array is empty `[]`.
- For a deactivated user, the array is still returned (it reflects the
  link state, not the sign-in eligibility).

---

## Environment Variables (new)

| Name | Required | Description |
|------|----------|-------------|
| GOOGLE_CLIENT_ID | yes (for Google) | OAuth client id from Google Cloud Console |
| GOOGLE_CLIENT_SECRET | yes (for Google) | OAuth client secret from Google Cloud Console |
| FACEBOOK_CLIENT_ID | yes (for Facebook) | App id from Facebook Developer Dashboard |
| FACEBOOK_CLIENT_SECRET | yes (for Facebook) | App secret from Facebook Developer Dashboard |

Both providers can be enabled/disabled independently by including or
omitting the corresponding env vars. The bootstrap step (in
`src/main.ts` or `src/app.module.ts`) should fail-fast if a provider's
config block is present but the env vars are missing.

## Security Notes

- **State validation (FR-017)**: Better Auth's stock OAuth state handling
  is used. Our custom endpoints do not bypass it.
- **HTTPS**: Cookie `secure` flag must be `true` in production (already
  configured by Better Auth defaults in feature 001).
- **Redirect URI allowlist**: The callback URLs
  (`{BASE_URL}/api/auth/callback/google` and `.../facebook`) must be
  registered in the Google Cloud Console and Facebook App Dashboard.
- **No token leakage (FR-016)**: The endpoints in this document never
  return `accessToken`, `refreshToken`, or `idToken` in their response
  bodies. These stay inside Better Auth.
