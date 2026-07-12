# Feature Specification: Authentication System (Better Auth)

**Feature Branch**: `001-better-auth-system`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Build the authentication system for a doctor appointment booking platform, using Better Auth integrated into a NestJS + Prisma + PostgreSQL backend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Patient Registration & Verification (Priority: P1)

A new patient visits the platform and creates an account by providing their full name,
email address, phone number, and password. After submitting, they receive a one-time
code via email and another via SMS. They enter both codes to verify their contact
details. Once both are verified, their account is fully active and they can log in
immediately.

**Why this priority**: Without patient registration, no user can access the platform.
This is the foundational entry point for the primary user persona.

**Independent Test**: Can be fully tested by registering a new patient account,
verifying both email and phone, then logging in and accessing a protected "who am I"
endpoint that returns the user's profile. Delivers a fully authenticated patient
session.

**Acceptance Scenarios**:

1. **Given** a visitor with a valid email and phone number, **When** they submit
   registration with full name, email, phone, password, and role "patient", **Then**
   an account is created with unverified email and phone status, and OTP codes are
   dispatched to both channels.
2. **Given** a registered patient with unverified email, **When** they submit the
   correct email OTP code, **Then** their email is marked as verified.
3. **Given** a registered patient with unverified phone, **When** they submit the
   correct phone OTP code, **Then** their phone is marked as verified.
4. **Given** a patient with both email and phone verified, **When** they log in with
   email and password, **Then** a session is created and they can access protected
   patient routes.
5. **Given** a patient with only email verified (phone not yet verified), **When**
   they attempt to log in, **Then** login succeeds but the response indicates the
   account is not fully verified.

---

### User Story 2 - Doctor Registration, Verification & Approval Gate (Priority: P1)

A doctor visits the platform and registers with their full name, email, phone number,
password, and role "doctor". After verifying both email and phone via OTP codes, a
`DoctorProfile` record is automatically created with status "PENDING". The doctor can
log in immediately after verification, but any attempt to access doctor-only routes
(e.g. managing appointment slots) is blocked until a Super Admin approves their
profile. When a pending doctor logs in, the response clearly signals their pending
approval status so the frontend can display an appropriate message.

**Why this priority**: Doctor onboarding with the approval gate is core to platform
trust — only vetted doctors should be able to manage appointments and interact with
patients.

**Independent Test**: Can be fully tested by registering a doctor, verifying both
channels, confirming login succeeds but doctor-only routes return a "pending approval"
error, then having a Super Admin approve the doctor and confirming those routes become
accessible.

**Acceptance Scenarios**:

1. **Given** a visitor registers with role "doctor", **When** registration completes
   and both email and phone are verified, **Then** a `DoctorProfile` record is created
   with status "PENDING".
2. **Given** a doctor with PENDING status, **When** they log in, **Then** login
   succeeds (session created) and the response includes an indicator that the doctor
   is "pending approval".
3. **Given** a doctor with PENDING status, **When** they attempt to access a
   doctor-only route, **Then** the request is rejected with a clear "pending approval"
   error.
4. **Given** a doctor whose status has been changed to "APPROVED" by a Super Admin,
   **When** they access a doctor-only route, **Then** the request succeeds normally.
5. **Given** a doctor whose status is "REJECTED", **When** they attempt to access a
   doctor-only route, **Then** the request is rejected.

---

### User Story 3 - Login & Session Management (Priority: P1)

A registered and verified user (patient or doctor) logs in using either their email or
phone number combined with their password. On success, a server-side session is created
and an HTTP-only cookie is set. The user remains logged in across requests until they
explicitly log out or the session expires. Logging out destroys the session server-side
and clears the cookie.

**Why this priority**: Login is the gateway to all authenticated functionality. Without
it, no protected feature is reachable.

**Independent Test**: Can be fully tested by logging in with valid credentials,
confirming a session cookie is set, accessing a protected route successfully, then
logging out and confirming the session is invalidated (subsequent requests to protected
routes are rejected).

**Acceptance Scenarios**:

1. **Given** a verified user, **When** they log in with email and correct password,
   **Then** a session is created and an HTTP-only cookie is returned.
2. **Given** a verified user, **When** they log in with phone number and correct
   password, **Then** a session is created and an HTTP-only cookie is returned.
3. **Given** any user, **When** they submit incorrect credentials, **Then** login is
   rejected with a generic "invalid credentials" message (no information leakage about
   which field is wrong).
4. **Given** a logged-in user, **When** they log out, **Then** the session is
   destroyed server-side and the cookie is cleared.
5. **Given** a logged-in user, **When** they access a "who am I" endpoint, **Then**
   the response returns their user profile (id, name, email, phone, role, verification
   status, and doctor approval status if applicable).

---

### User Story 4 - Password Reset (Priority: P2)

A user who has forgotten their password can request a reset via either email or phone.
They choose a channel, receive a one-time code, and submit the code along with a new
password. If the code is valid and not expired, their password is updated and all
existing sessions are invalidated (forcing re-login with the new password).

**Why this priority**: Password reset is essential for account recovery but is not
needed for the initial happy-path flow. It becomes critical once real users are on the
platform.

**Independent Test**: Can be fully tested by requesting a password reset via email,
submitting the received OTP with a new password, confirming the password is changed,
and verifying the old password no longer works while the new one does.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they request a password reset via email,
   **Then** an OTP code is sent to their registered email address.
2. **Given** a registered user, **When** they request a password reset via phone,
   **Then** an OTP code is sent to their registered phone number.
3. **Given** a user with a valid reset OTP, **When** they submit the code with a new
   password, **Then** the password is updated and all existing sessions are revoked.
4. **Given** a user with an expired or invalid reset OTP, **When** they attempt to
   reset, **Then** the request is rejected with an appropriate error.
5. **Given** a user who has reset their password, **When** they log in with the old
   password, **Then** login fails; with the new password, **Then** login succeeds.

---

### User Story 5 - Admin Doctor Management (Priority: P2)

A Super Admin (seeded at project setup, not self-registered) can view a list of doctors
filtered by their approval status (PENDING, APPROVED, REJECTED, SUSPENDED). They can
approve a pending doctor, reject a pending doctor, or suspend a previously approved
doctor. They can also deactivate any user account regardless of role.

**Why this priority**: Without admin doctor management, the approval gate has no way
to be operated. This is needed to complete the doctor onboarding loop.

**Independent Test**: Can be fully tested by seeding a Super Admin, registering and
verifying a doctor, then using Super Admin endpoints to list pending doctors, approve
one, and confirm the doctor can now access doctor-only routes.

**Acceptance Scenarios**:

1. **Given** a Super Admin, **When** they request doctors filtered by status "PENDING",
   **Then** only doctors with PENDING status are returned.
2. **Given** a Super Admin and a PENDING doctor, **When** the admin approves the
   doctor, **Then** the doctor's status becomes "APPROVED" and they can access
   doctor-only routes.
3. **Given** a Super Admin and a PENDING doctor, **When** the admin rejects the doctor,
   **Then** the doctor's status becomes "REJECTED" and they cannot access doctor-only
   routes.
4. **Given** a Super Admin and an APPROVED doctor, **When** the admin suspends the
   doctor, **Then** the doctor's status becomes "SUSPENDED" and they lose access to
   doctor-only routes.
5. **Given** a Super Admin and any user, **When** the admin deactivates the user,
   **Then** the user's account is marked inactive and they can no longer log in.

---

### User Story 6 - Super Admin Seeding (Priority: P3)

At project setup, a seed script creates a single Super Admin account with predefined
credentials (email, phone, password, full name). This account is never created through
self-registration. The seed script is idempotent — running it multiple times does not
create duplicate Super Admin accounts.

**Why this priority**: The Super Admin is needed to operate the approval gate, but the
seed script is a one-time setup task that doesn't affect the runtime user experience
directly.

**Independent Test**: Can be fully tested by running the seed script, then logging in
as the Super Admin and confirming the account has SUPER_ADMIN role and can access admin
endpoints.

**Acceptance Scenarios**:

1. **Given** a fresh database with no users, **When** the seed script runs, **Then**
   a Super Admin account is created with the predefined credentials.
2. **Given** a database where the Super Admin already exists, **When** the seed script
   runs again, **Then** no duplicate is created and the existing Super Admin is
   unchanged.
3. **Given** the seeded Super Admin, **When** they log in, **Then** they can access
   all admin endpoints.

---

### Edge Cases

- What happens when a user tries to register with an email or phone that is already
  registered? The system rejects registration with a clear "already registered" message.
- What happens when a user enters an incorrect OTP code? The system rejects the
  verification attempt with an "invalid code" message. The user can request a new code.
- What happens when an OTP code expires before the user submits it? The system rejects
  the verification with an "expired code" message. The user must request a new code.
- What happens when a deactivated user tries to log in? Login is rejected with an
  "account deactivated" message.
- What happens when a doctor is suspended mid-session? The next request to a
  doctor-only route is rejected. Existing session remains valid for non-doctor routes
  (e.g. viewing own profile as a patient, if applicable).
- What happens when the same phone number or email is used during registration by two
  different users? The second registration is rejected — email and phone must be unique
  across all accounts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow self-registration with full name, email, phone number,
  password, and role selection (patient or doctor).
- **FR-002**: System MUST NOT allow self-registration as SUPER_ADMIN.
- **FR-003**: System MUST dispatch a one-time verification code via email after
  registration, using the platform's email OTP mechanism.
- **FR-004**: System MUST dispatch a one-time verification code via SMS after
  registration, using the platform's phone verification mechanism.
- **FR-005**: System MUST require both email and phone verification before an account
  is considered fully verified.
- **FR-006**: System MUST create a DoctorProfile record with status "PENDING" when a
  user registers as a doctor and completes both verifications.
- **FR-007**: System MUST allow login with either email or phone number combined with
  password.
- **FR-008**: System MUST use server-side sessions with HTTP-only cookies for
  authentication state — no client-managed tokens.
- **FR-009**: System MUST include doctor approval status in the login response when a
  doctor's status is not "APPROVED".
- **FR-010**: System MUST block access to all doctor-only routes for doctors whose
  status is not "APPROVED".
- **FR-011**: System MUST allow password reset via email OTP.
- **FR-012**: System MUST allow password reset via phone OTP.
- **FR-013**: System MUST invalidate all existing sessions when a password is reset.
- **FR-014**: System MUST provide a "who am I" endpoint that returns the authenticated
  user's profile, including verification status and doctor approval status if
  applicable.
- **FR-015**: System MUST allow a Super Admin to list doctors filtered by approval
  status.
- **FR-016**: System MUST allow a Super Admin to approve, reject, or suspend a doctor.
- **FR-017**: System MUST allow a Super Admin to deactivate any user account.
- **FR-018**: System MUST enforce email uniqueness across all user accounts.
- **FR-019**: System MUST enforce phone number uniqueness across all user accounts.
- **FR-020**: System MUST prevent deactivated users from logging in.
- **FR-021**: System MUST provide a seed script that creates a Super Admin account
  idempotently.

### Key Entities

- **User**: Represents any platform participant. Key attributes: full name, email
  (unique), phone (unique), password, role (PATIENT / DOCTOR / SUPER_ADMIN), email
  verified flag, phone verified flag, active flag.
- **DoctorProfile**: Represents a doctor's platform standing. 1:1 relationship with
  User. Key attributes: approval status (PENDING / APPROVED / REJECTED / SUSPENDED),
  approved-by reference, approved-at timestamp.
- **Session**: Represents an authenticated user session. Managed by the auth library.
  Key attributes: user reference, creation time, expiry time.
- **Verification**: Represents OTP codes dispatched for email/phone verification or
  password reset. Managed by the auth library. Key attributes: target (email/phone),
  code, purpose, expiry time, consumed flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A patient can complete registration, verify both email and phone, and
  log in within 5 minutes under normal network conditions.
- **SC-002**: A doctor can register, verify both channels, and receive a clear
  "pending approval" indication on login within 5 minutes.
- **SC-003**: 100% of doctor-only route attempts by PENDING doctors are rejected with
  a clear error message.
- **SC-004**: 100% of doctor-only route attempts by APPROVED doctors succeed.
- **SC-005**: A Super Admin can approve a pending doctor and the doctor gains access
  to doctor-only routes within 30 seconds of the approval action.
- **SC-006**: Password reset completes end-to-end (request → OTP → new password →
  login with new password) within 3 minutes.
- **SC-007**: No unverified account (email or phone not verified) can access protected
  routes beyond the verification endpoints themselves.
- **SC-008**: Deactivated users cannot log in or access any authenticated route.

## Assumptions

- Users have access to both a valid email address and a phone number that can receive
  SMS.
- OTP codes expire after a reasonable duration (e.g. 10 minutes) — exact expiry is a
  configuration detail.
- SMS delivery is handled by an external provider integrated via the phone verification
  plugin's callback — the platform does not operate its own SMS gateway.
- Email delivery is handled by an external SMTP service or email provider integrated
  via the email OTP plugin's callback.
- The Super Admin seed credentials are configured via environment variables, not
  hard-coded.
- "Doctor-only routes" are any routes guarded by a doctor approval check — the exact
  set of routes is defined in later features (appointments, slots, etc.). For this
  feature, at minimum a "doctor dashboard" or "doctor profile" test route exists to
  validate the gate.
- Session expiry duration is configurable but defaults to a reasonable value (e.g. 7
  days).
- The platform operates in English only for this feature — Arabic localization is out
  of scope.
