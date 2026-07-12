# Feature Specification: Social Login (Google & Facebook via Better Auth)

**Feature Branch**: `002-social-oauth-login`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "i want to add authentication using google and facebook using better auth"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New User Signs Up with Google (Priority: P1)

A new visitor arrives at the platform and chooses "Continue with Google". They are
redirected to Google's consent screen, grant the platform permission to read their
basic profile and verified email, and are then redirected back to the platform. A
new account is created automatically using the information Google provides (full
name, email, profile picture URL). The email is considered verified at the moment
of signup because it was verified by Google. The user is signed in immediately and
lands on the patient home screen.

**Why this priority**: Google is the most widely used identity provider globally
and covers the majority of "I don't want to create yet another account" friction
for new patients. Without it, signup conversion suffers.

**Independent Test**: Can be fully tested by clicking "Continue with Google" on a
clean browser session, completing Google's consent flow, and confirming a new
account exists, the email is marked as verified, a session cookie is set, and the
user can access a protected "who am I" endpoint.

**Acceptance Scenarios**:

1. **Given** a visitor who is not logged in, **When** they click "Continue with
   Google" and grant consent, **Then** a new account is created (role PATIENT by
   default) with a verified email taken from Google and a session cookie is issued.
2. **Given** a visitor who previously denied consent, **When** they click
   "Continue with Google" again and grant consent this time, **Then** signup
   completes successfully (no stale state from the prior attempt).
3. **Given** a new user who just signed up with Google, **When** they access a
   protected endpoint, **Then** the request succeeds and the response includes
   their profile information sourced from Google (name, email, avatar URL).

---

### User Story 2 - New User Signs Up with Facebook (Priority: P1)

A new visitor arrives at the platform and chooses "Continue with Facebook". They
are redirected to Facebook's login + consent screen, grant permission for the
platform to read their basic profile and verified email, and are then redirected
back. A new account is created using the data Facebook provides (full name, email
when granted, profile picture URL). The email is considered verified at the moment
of signup. The user is signed in immediately.

**Why this priority**: Facebook is a major identity provider in the project's
target market (Egypt) and broadens reach. It's a peer-priority item to Google
because users typically have a strong preference for one or the other — not both.

**Independent Test**: Can be fully tested by clicking "Continue with Facebook" on
a clean browser session, completing Facebook's login + consent flow, and
confirming a new account is created, the email is verified, a session cookie is
set, and the user can access a protected "who am I" endpoint.

**Acceptance Scenarios**:

1. **Given** a visitor who is not logged in, **When** they click "Continue with
   Facebook" and grant consent (including email permission), **Then** a new
   account is created (role PATIENT by default) with a verified email taken from
   Facebook and a session cookie is issued.
2. **Given** a visitor who grants Facebook login but declines the email
   permission, **When** the OAuth callback returns, **Then** signup is rejected
   with a clear message that email permission is required.
3. **Given** a new user who just signed up with Facebook, **When** they access a
   protected endpoint, **Then** the request succeeds and the response includes
   their profile information sourced from Facebook.

---

### User Story 3 - Returning User Signs In with Google or Facebook (Priority: P1)

A user who previously signed up via a social provider returns to the platform and
clicks the same provider button. They are redirected to the provider, re-authenticate
(or are silently re-authenticated if their provider session is still active), and
are redirected back. The platform recognizes the existing linked account and signs
them in without creating a new account. No password prompt appears because the
provider handled authentication.

**Why this priority**: Sign-in is the everyday counterpart to sign-up. Without it,
every returning social user would have to use email/password (which they may never
have set) or re-sign-up as a new account (which would fail due to unique email
constraint).

**Independent Test**: Can be fully tested by signing up via Google, signing out,
then clicking "Continue with Google" again and confirming the same account is
re-signed in (same user id, same email) without a new account row being created.

**Acceptance Scenarios**:

1. **Given** a user whose account is already linked to Google, **When** they
   click "Continue with Google", **Then** a session is issued for the existing
   account (no new account is created).
2. **Given** a user whose account is already linked to Facebook, **When** they
   click "Continue with Facebook", **Then** a session is issued for the existing
   account.
3. **Given** a user with a stale local session and an active provider session,
   **When** they click a social provider button, **Then** they are signed in
   (the new session replaces the stale one).

---

### User Story 4 - (Removed) Social Signup for Doctors

Doctors are not in scope for social signup in v1. Any user who signs up via
Google or Facebook is created with role PATIENT. Users who wish to register as
a doctor MUST use the email/password signup flow defined in feature 001, which
includes the PENDING → APPROVED gate. Super Admins retain the ability to
promote a social-signup PATIENT to DOCTOR out of band if business needs
require it (not exposed as a self-service path).

---

### User Story 5 - Link Social Provider to Existing Account (Priority: P2)

A user who originally signed up with email and password can link their Google or
Facebook account from their profile settings. After linking, they can sign in
either with email/password or with the linked social provider. The link uses
verified email matching: the social account's verified email must equal the
existing account's verified email. If a verified user tries to link a social
account whose email doesn't match, the link is rejected.

**Why this priority**: Account linking is a standard expectation in modern apps.
Without it, users are forced to maintain a separate password just for this
platform.

**Independent Test**: Can be fully tested by signing up with email/password,
verifying the email via OTP, then linking Google from profile settings, then
signing out and signing back in with "Continue with Google" and confirming the
same user id is returned.

**Acceptance Scenarios**:

1. **Given** a verified user with email/password signup, **When** they initiate
   "Link Google account" and complete the Google consent, **Then** the Google
   account is linked to their existing user record and they can sign in with
   either method going forward.
2. **Given** a verified user, **When** they attempt to link a Google account
   whose verified email differs from their account email, **Then** the link is
   rejected with a clear "email mismatch" error.
3. **Given** a verified user with two social accounts already linked, **When**
   they attempt to link a third, **Then** the link is rejected (a maximum of one
   Google account and one Facebook account may be linked per user).

---

### User Story 6 - Unlink Social Provider (Priority: P3)

A user who has linked a social provider can unlink it from profile settings,
provided they have at least one other way to authenticate (a password, or another
linked provider). The last remaining sign-in method cannot be unlinked — this
prevents the user from locking themselves out of their account.

**Why this priority**: Unlinking is a defensive UX feature, not core onboarding.
Users occasionally want to remove a linked account; if it's missing, the only
workaround is admin intervention.

**Independent Test**: Can be fully tested by signing up with email/password,
linking Google, then unlinking Google from profile settings and confirming that
"Continue with Google" no longer signs them in (it now treats them as a new
signup flow).

**Acceptance Scenarios**:

1. **Given** a user with both a password and a linked Google account, **When**
   they unlink Google, **Then** the Google link is removed and they can no longer
   sign in via Google, but can still sign in with email/password.
2. **Given** a user with only one sign-in method (a linked Google account and no
   password, no other provider), **When** they attempt to unlink Google, **Then**
   the request is rejected with a clear "cannot remove last sign-in method"
   error.

---

### Edge Cases

- What happens when a user's Google account email is already associated with an
  existing account on this platform? The platform links the Google account to
  the existing user (account linking) — it does not create a duplicate account.
- What happens when a user's Facebook account email is already associated with an
  existing account? Same as Google: link to the existing user.
- What happens when Google or Facebook is temporarily unavailable (network error,
  5xx, rate limit)? The OAuth callback returns a user-visible error indicating
  the provider is unavailable, and no partial account is created.
- What happens when a user revokes the platform's access from their Google/Facebook
  account settings? The next sign-in attempt fails with a "permission revoked"
  error; the user's existing session on this platform continues to work until
  expiry.
- What happens when the OAuth state parameter is missing or tampered with (CSRF
  attempt)? The callback is rejected with a security error and no account is
  created or signed in.
- What happens when a deactivated user attempts to sign in via a social provider?
  Sign-in is rejected with an "account deactivated" message — the social link
  remains but cannot be used to authenticate.
- What happens when a social signup returns no email (user denied the email
  scope)? Signup is rejected with a clear "email permission required" message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow new users to sign up and sign in using Google as
  the identity provider, integrated through Better Auth's social provider
  mechanism.
- **FR-002**: System MUST allow new users to sign up and sign in using Facebook
  as the identity provider, integrated through Better Auth's social provider
  mechanism.
- **FR-003**: System MUST automatically mark the email of a new social-signup
  user as verified, because the provider has already verified it.
- **FR-004**: System MUST default new social signups to role PATIENT, and MUST
  NOT offer DOCTOR as a selectable role during social onboarding. A user who
  wishes to be a doctor MUST sign up via email/password (the existing flow in
  feature 001). A Super Admin MAY promote an existing social-signup user from
  PATIENT to DOCTOR out of band if business needs require it.
- **FR-005**: System MUST allow a returning user to sign in with the same social
  provider they originally used, without creating a duplicate account.
- **FR-006**: System MUST automatically link a social account to an existing
  verified user when the social account's verified email matches the existing
  user's verified email.
- **FR-007**: System MUST require the social provider to return a verified email
  for any signup or link attempt to succeed; signup/link is rejected otherwise.
- **FR-008**: System MUST allow a verified user to explicitly link a Google
  account from their profile settings, provided the social account's verified
  email matches their own.
- **FR-009**: System MUST allow a verified user to explicitly link a Facebook
  account from their profile settings, subject to the same email-match rule.
- **FR-010**: System MUST enforce a maximum of one linked Google account and one
  linked Facebook account per user.
- **FR-011**: System MUST allow a user to unlink a previously linked social
  provider from profile settings.
- **FR-012**: System MUST prevent a user from unlinking their last remaining
  sign-in method (the user would have no way to authenticate).
- **FR-013**: System MUST block sign-in via a social provider for any user whose
  account has been deactivated, matching the existing behavior for password
  login.
- **FR-014**: System MUST include the user's social-linked provider information
  in the "who am I" response, so the frontend can render "Sign in with Google"
  vs "Sign in with Facebook" appropriately.
- **FR-015**: System MUST NOT store social access tokens or refresh tokens beyond
  what Better Auth requires for account operations — no token hoarding.
- **FR-016**: System MUST validate the OAuth state parameter on the callback to
  prevent CSRF, relying on Better Auth's built-in state handling.

### Key Entities

- **User**: Same entity as in feature 001. No new attributes introduced by this
  feature. For social signups, the role attribute is always initialized to
  PATIENT (social signup does not offer DOCTOR in v1).
- **Account**: Better Auth-managed link between a User and a social provider
  identity (Google or Facebook). Holds provider name, provider's user id, and
  the verified email returned by the provider. A User may have up to one Google
  Account record and one Facebook Account record.
- **DoctorProfile**: Same entity as in feature 001. Not created by social
  signup in v1 (social signups default to PATIENT).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can complete signup via Google or Facebook (button
  click → consent → logged in) in under 60 seconds under normal network
  conditions.
- **SC-002**: A returning social user can sign in via the same provider in under
  20 seconds under normal network conditions.
- **SC-003**: 100% of social signups with a verified email produce an account
  whose email is marked as verified at the moment of creation.
- **SC-004**: 100% of social signups are created with role PATIENT, and the
  social signup endpoint offers no path to create a user with role DOCTOR.
- **SC-005**: 100% of sign-in attempts by deactivated users via any social
  provider are rejected with an "account deactivated" error.
- **SC-006**: 0% of social signups create duplicate accounts when the provider
  email matches an existing verified user — the link is made instead.
- **SC-007**: 100% of attempts to unlink a user's last sign-in method are
  rejected with a clear error.
- **SC-008**: 100% of OAuth callbacks with a missing or tampered state parameter
  are rejected without creating an account or issuing a session.

## Assumptions

- The Google and Facebook OAuth apps (client IDs and client secrets) are
  configured via environment variables, with separate credentials for local
  development and production.
- The required scopes are `openid`, `email`, and `profile` for Google, and
  `email` and `public_profile` for Facebook. The email scope is mandatory and
  signup is rejected if the user denies it.
- Better Auth's built-in social provider and account-linking features are used
  directly; no custom OAuth client logic is written.
- The redirect URI follows Better Auth's convention and is whitelisted in the
  Google/Facebook developer consoles before production deployment.
- Social signup does not require phone verification at signup time; phone
  verification remains an optional add-on (out of scope for this feature) that
  may be introduced in a later iteration.
- The frontend is responsible for rendering the "Continue with Google" and
  "Continue with Facebook" buttons and initiating the OAuth redirect; this
  feature is backend-only and assumes the frontend will integrate with the
  standard Better Auth endpoint.
- Social signup is scoped to role PATIENT only in v1. Doctors MUST use the
  email/password signup flow from feature 001. Super Admins MAY promote an
  existing social-signup PATIENT to DOCTOR out of band (not a self-service
  path).
- A user may have at most one account row per provider (one Google link, one
  Facebook link) — attempting to link a second Google account to the same user
  is rejected, and the user must unlink the existing one first.
- Social profile picture URLs returned by providers are stored as-is and may
  expire; the application does not need to mirror them to its own storage for
  this feature.
- Rate limiting and abuse protection at the social signup endpoint are handled
  by Better Auth's defaults; additional hardening (per-IP throttling, captcha)
  is out of scope for this feature.
