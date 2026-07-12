# Feature Specification: Simplify Auth Model (Remove Doctor Role)

**Feature Branch**: `003-remove-doctor-role`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "The better auth spec, update it so there is no doctor role. Only user role and admin. Admin add doctors manually. Basiclly doctors are just curds in the database. Doctor isn't a role in the application."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Registration With One of Two Roles (Priority: P1)

A new visitor registers on the platform by providing a name, email, phone, and
password. The platform creates an account with role `user` (the default
consumer role). There is no path to self-register as anything other than `user`.
The `admin` role is never self-assignable — it is reserved for accounts seeded
or promoted by an existing Super Admin out of band.

**Why this priority**: Registration is the entry point for every consumer on
the platform. Without it, no one can use the system.

**Independent Test**: Can be fully tested by completing the registration
flow with valid input and confirming a single account row is created with
`role = "user"`, that no `role = "doctor"` value can be submitted, and that
the resulting account can sign in immediately.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they submit registration with name,
   email, phone, and password (no role specified), **Then** an account is
   created with `role = "user"` and email and phone verification OTPs are
   dispatched.
2. **Given** a new visitor, **When** they submit registration with an
   explicit `role` value of `doctor` (or any value other than `user`),
   **Then** the request is rejected — the only role a self-registration
   can produce is `user`.
3. **Given** a verified `user` account, **When** they log in, **Then** a
   session is created and they can access protected user routes.

---

### User Story 2 - Admin Creates and Manages Doctor Records (Priority: P1)

A Super Admin manages the catalog of doctors that patients can browse and
book. The admin creates, updates, deactivates, and deletes doctor records
through a CRUD interface. Doctors are data records — they do not have user
accounts, they cannot log in, and the `User.role` field never holds the
value `doctor` (in fact that value no longer exists in the role enum).

**Why this priority**: Without a way for admins to add and manage doctors,
the platform has no inventory to offer patients. This is the replacement
for the previous "doctor self-registration + admin approval" flow.

**Independent Test**: Can be fully tested by signing in as the seeded Super
Admin, creating a new doctor record through the admin endpoint, listing all
doctors, updating one, deactivating one, and confirming the changes persist
correctly.

**Acceptance Scenarios**:

1. **Given** a Super Admin, **When** they create a new doctor record with
   the required fields (name, specialty, and other profile data), **Then** a
   doctor row is created and is visible in the doctor's listing.
2. **Given** a Super Admin and an existing doctor record, **When** they
   update any of the doctor's profile fields, **Then** the change is
   persisted and the listing reflects the new values.
3. **Given** a Super Admin and an existing doctor record, **When** they
   deactivate the doctor, **Then** the doctor no longer appears in patient-
   facing search/browse results but is still visible to admins with a
   "deactivated" indicator.
4. **Given** a Super Admin and a doctor that has been booked by zero
   patients, **When** they delete the doctor, **Then** the record is
   removed. (Deletion is blocked if the doctor has historical bookings —
   see edge cases.)
5. **Given** a non-admin (regular `user`), **When** they attempt to call
   any admin doctor-management endpoint, **Then** the request is rejected
   with 403.

---

### User Story 3 - Doctor Records Are Not User Accounts (Priority: P1)

The platform maintains a clear separation between **users** (people who log
in: patients/admins) and **doctors** (data records that patients browse and
book). The `User` table's `role` column accepts only `user` and `admin`.
There is no `role = "doctor"`. Doctors have no password, no session, no
login, no phone number, no email of their own. They are a separate domain
entity managed entirely by admins.

**Why this priority**: This is the architectural simplification the user
asked for. The whole point is to drop the doctor-as-a-user concept and
treat doctors as the catalog data they actually are. A regression here
(e.g. allowing `role = "doctor"` in the DB) would re-introduce the
complexity being removed.

**Independent Test**: Can be fully tested by attempting to insert a User row
with `role = "doctor"` via the registration API and via the database
directly — both must fail. Conversely, a doctor record has no `userId`
foreign key to the User table.

**Acceptance Scenarios**:

1. **Given** the platform's data model, **When** anyone (admin, user, or
   direct DB) attempts to create a User with `role = "doctor"`, **Then** the
   attempt is rejected. The role enum for `User.role` contains only
   `user` and `admin`.
2. **Given** an existing doctor record, **When** a system maintainer
   inspects the doctor record, **Then** it has no foreign key to the `User`
   table, no email, no phone, no password, and no way to log in.
3. **Given** a `user` session in a browser, **When** the user attempts to
   access a doctor-only authenticated route (e.g. "doctor dashboard"), **Then**
   the request fails because no such route or concept exists.

---

### User Story 4 - Existing Social Signup Behavior Preserved (Priority: P2)

A new user who signs up via Google or Facebook (the social login flow
defined in feature 002) is created with `role = "user"` (the new name for
the previous `patient` default). No path through social signup produces
`role = "doctor"` — that value no longer exists in the role enum.

**Why this priority**: Social signup is the second-most-common onboarding
path. The simplification must apply consistently across both credential and
social signup; otherwise the simplification is incomplete.

**Independent Test**: Can be fully tested by completing a Google signup
and a Facebook signup and confirming the resulting accounts both have
`role = "user"`, no `role = "doctor"` value can be supplied to the social
signup path, and the auto-link behavior on returning social sign-in still
reuses the same user record.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they sign up via Google, **Then** the
   resulting account has `role = "user"` (not `patient`, not `doctor`).
2. **Given** a new visitor, **When** they sign up via Facebook, **Then** the
   resulting account has `role = "user"`.
3. **Given** a returning social user, **When** they sign in with the same
   provider, **Then** the existing account is reused (no new row, no role
   change).

---

### User Story 5 - Super Admin Seeding and Promotion (Priority: P3)

A Super Admin account is seeded at project setup with predefined
credentials (email, phone, password, name) and `role = "admin"`. This
account is never created through self-registration. The seed script is
idempotent. An existing Super Admin can promote any `user` account to
`role = "admin"` out of band (e.g. for support staff who need admin
access); this is not a self-service path.

**Why this priority**: The Super Admin is required to operate the doctor
CRUD and any future admin features. The seeding script is a one-time setup
task.

**Independent Test**: Can be fully tested by running the seed script on a
fresh database, then signing in as the seeded admin and confirming the
account has `role = "admin"` and can access the doctor management
endpoints.

**Acceptance Scenarios**:

1. **Given** a fresh database with no users, **When** the seed script runs,
   **Then** a Super Admin account is created with the predefined credentials
   and `role = "admin"`.
2. **Given** a database where the Super Admin already exists, **When** the
   seed script runs again, **Then** no duplicate is created.
3. **Given** a Super Admin and a regular `user`, **When** the admin promotes
   the user to admin, **Then** the user's role changes to `admin` and they
   can access admin endpoints on next sign-in.

---

### Edge Cases

- What happens when an admin tries to delete a doctor that has historical
  bookings? Deletion is rejected with a clear "doctor has historical
  bookings, deactivate instead" message. The doctor record is preserved for
  audit/integrity and is no longer shown in patient-facing search.
- What happens when an admin tries to create a doctor record with missing
  required fields (e.g. name)? The request is rejected with a validation
  error; the doctor is not partially created.
- What happens when a user submits a registration form with `role = "admin"`
  or any other non-`user` value? The request is rejected — only `user` is
  accepted (or the field is omitted and defaults to `user`).
- What happens when an admin updates a doctor record with invalid data
  (e.g. a specialty string that exceeds max length)? The update is rejected
  with a validation error.
- What happens when a user with a stale session is promoted to admin? On
  the next request, their session reflects the new `role = "admin"`.
- What happens when an admin deactivates their own account accidentally? A
  confirmation step is required, and the platform retains at least one
  active Super Admin at all times.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `User.role` field MUST accept only two values: `user` and
  `admin`. The value `doctor` MUST NOT exist in the role enum, MUST NOT be
  insertable, and MUST NOT be present in any data migration that follows.
- **FR-002**: Self-registration MUST default new accounts to `role = "user"`
  and MUST NOT accept any other role value from the request body. Any other
  submitted role is silently coerced to `user` or rejected — chosen approach
  documented in the Assumptions section.
- **FR-003**: The `role = "admin"` value MUST NOT be self-assignable. Super
  Admin accounts are created only via the seed script or by an existing
  Super Admin promoting an existing user.
- **FR-004**: Doctors MUST be a separate domain entity (a CRUD record) with
  no relationship to the `User` table — specifically, no foreign key from
  the doctor record to `User.id`, and no `User.role = "doctor"` value.
- **FR-005**: A Super Admin MUST be able to create, read, update, deactivate,
  and delete doctor records through a dedicated admin interface (HTTP
  endpoints guarded by `role = "admin"`).
- **FR-006**: A Super Admin MUST be able to list doctor records, optionally
  filtered by activation status (active / deactivated) and by specialty or
  other profile fields, with pagination.
- **FR-007**: Deactivated doctor records MUST NOT appear in patient-facing
  search or browse results, but MUST remain visible to admins (with a
  "deactivated" indicator) for audit and historical reference.
- **FR-008**: Deletion of a doctor record that has historical bookings MUST
  be rejected. Deactivation is the supported action for retiring a doctor
  with history.
- **FR-009**: Social signup (Google, Facebook) MUST produce accounts with
  `role = "user"`. The previous `role = "patient"` default is replaced
  with `role = "user"`.
- **FR-010**: The seeded Super Admin account MUST have `role = "admin"`
  and be created idempotently by the seed script.
- **FR-011**: A Super Admin MUST be able to promote an existing user to
  `role = "admin"` and demote an admin back to `role = "user"`. The
  platform MUST prevent demoting the last remaining active Super Admin.
- **FR-012**: A regular `user` MUST NOT be able to access any doctor
  management endpoint. Access MUST be guarded by `role = "admin"`.

### Key Entities

- **User**: A person who can log in. Roles are `user` or `admin`. Email and
  phone are unique. Email and phone must be verified before the account is
  considered fully active. Has many `Session`s and `Account`s (per Better
  Auth).
- **Doctor**: A data record representing a doctor that patients can browse
  and book. Independent of `User` — no foreign key, no login, no email.
  Fields include (at minimum): id, name, specialty, bio, profile image
  URL, status (active / deactivated), created/updated timestamps. May
  later gain fields like clinic address, consultation fee, schedule,
  ratings — those are out of scope for this feature.
- **Session / Account / Verification**: Better Auth-managed, unchanged
  from feature 001. They belong to `User` records only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can self-register and sign in within 5 minutes
  under normal network conditions, ending with a `user` role and a
  verified email/phone.
- **SC-002**: 100% of self-registration attempts that submit any role value
  other than `user` (or omit it) result in a `user`-role account. No
  non-`user` role is ever produced by self-registration.
- **SC-003**: 100% of attempts to insert or set `User.role = "doctor"`
  (via API or directly via DB) are rejected. The role enum is exactly
  `{ "user", "admin" }`.
- **SC-004**: A Super Admin can create a new doctor record, see it appear
  in the doctor listing, update it, and deactivate it within 2 minutes.
- **SC-005**: Deactivated doctors do not appear in patient-facing search
  or browse results within 5 seconds of deactivation (cache-bust on
  status change).
- **SC-006**: 100% of attempts by a non-admin to call a doctor-management
  endpoint are rejected with 403.
- **SC-007**: 100% of social signups (Google, Facebook) produce a `user`-
  role account, never a `doctor` or `admin` role.
- **SC-008**: The seed script runs idempotently — running it twice on a
  fresh database results in exactly one Super Admin account, not two.
- **SC-009**: An admin cannot demote the last remaining active Super
  Admin — the action is rejected with a clear error.

## Assumptions

- **Role rename**: The previous `role = "patient"` value is replaced by
  `role = "user"`. This is a terminology change in the data model and
  API responses. The frontend (out of scope for this backend feature) will
  need to be updated to use the new role name.
- **Default role for missing input**: When self-registration omits the
  `role` field, the default is `user`. When it submits a value other than
  `user`, the request is rejected with 400 (not silently coerced) — the
  safer behavior for a clean simplification. Document this choice in the
  planning phase.
- **Doctor fields**: The minimum field set is id, name, specialty, bio,
  profile image URL, status, timestamps. Specialty is a free-text string
  in v1; a controlled vocabulary is out of scope. Additional fields (clinic
  address, fees, schedule) are added in later features.
- **Doctor-user relationship**: Doctors do NOT have a User account. They
  cannot log in, do not have an email or phone, and do not appear in the
  `User` table. A patient who is also a doctor signs up as a `user` and
  has a separate `Doctor` record (created by an admin) — no relationship
  between the two.
- **Migration of existing data**: Out of scope for this spec. If existing
  accounts with `role = "patient"` or `role = "doctor"` are present in
  the database, a separate migration feature will handle them. This spec
  defines the target state only.
- **Patient profile**: A "patient profile" table (patient-specific data
  like medical history, insurance, etc.) is out of scope for this feature.
  Such a table, if added later, would be 1:1 to `User` and would NOT
  introduce a new role.
- **Historical bookings**: A future feature will introduce appointments
  and bookings. When that feature lands, it will reference `Doctor.id`
  (the standalone doctor record) directly — not via a `User.id` join.
- **Seed admin credentials**: The Super Admin seed credentials are still
  configured via environment variables, not hard-coded, and the seed
  script is idempotent.
- **No new dependencies**: This change reuses the existing Better Auth
  primitives, the existing `User` table (with a smaller role enum), and
  the existing admin module. No new third-party libraries are required.
- **The "admin module" from feature 001**: The existing admin endpoints
  for doctor approval/rejection/suspension (which operated on the old
  `DoctorProfile` table joined to `User`) are replaced by the new CRUD
  endpoints on the standalone `Doctor` entity. The exact mapping of
  old-endpoint → new-endpoint is documented in the planning phase.
