# Feature Specification: Doctor Categories

**Feature Branch**: `005-doctor-categories`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "I want to add categories in database for the doctors, change the database schema to include categories for the doctors + when adding a doctor it should ask for its category."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin Manages the Category Catalog (Priority: P1)

A Super Admin needs to define the set of categories that doctors can belong to (e.g. "Cardiology", "Pediatrics", "Dermatology"). They go to an admin section and can create a new category, edit the name of an existing one, deactivate a category, or permanently delete one. The category list is the controlled vocabulary that doctor records must reference.

**Why this priority**: Without managed categories there is nothing to assign a doctor to. Category CRUD is the prerequisite for every other story in this feature. It mirrors the existing admin pattern (admins already manage doctors, users, roles) so the surface is consistent.

**Independent Test**: Can be fully tested by signing in as a Super Admin, creating a category, listing categories, editing the name, and deleting it. No doctor record needs to exist for this story to be testable.

**Acceptance Scenarios**:

1. **Given** a Super Admin is signed in, **When** they create a category with a unique name, **Then** the category is persisted and appears in the list with a generated id, the supplied name, and a default `ACTIVE` status.
2. **Given** two categories already exist with names "Cardiology" and "Pediatrics", **When** the Super Admin attempts to create a third category named "Cardiology" (case-insensitive), **Then** the request is rejected with a validation error and no duplicate is created.
3. **Given** an ACTIVE category has no doctors referencing it, **When** the Super Admin deletes it, **Then** the category is removed and subsequent listing requests no longer include it.
4. **Given** an ACTIVE category has at least one doctor referencing it, **When** the Super Admin attempts to delete it, **Then** the request is rejected and the category is preserved (deletion is blocked while in use, preventing orphaned doctors).

---

### User Story 2 - Super Admin Creates a Doctor Assigned to a Category (Priority: P1)

A Super Admin adds a new doctor to the platform via the existing `POST /api/admin/doctors` endpoint. The create-doctor form now includes a required "category" field, and the admin selects an existing ACTIVE category from a dropdown (populated from the categories endpoint) rather than typing free-text. On submission, the doctor is persisted with a reference to the selected category.

**Why this priority**: This is the literal request the user typed: "when adding a doctor it should ask for its category". Without this, the feature does not exist from the admin's perspective. It is the primary write path that ties the new data model to the existing doctor CRUD.

**Independent Test**: Can be fully tested by signing in as a Super Admin, calling the categories endpoint to obtain a category id, then calling `POST /api/admin/doctors` with that id and asserting the returned doctor record references the category.

**Acceptance Scenarios**:

1. **Given** at least one ACTIVE category exists, **When** the Super Admin submits a create-doctor request with a valid `categoryId`, **Then** the doctor is created and the response includes the category id and the category name.
2. **Given** a Super Admin submits a create-doctor request with no `categoryId`, **Then** the request is rejected with a 400 validation error and no doctor record is created.
3. **Given** a Super Admin submits a create-doctor request with a `categoryId` that does not exist, **Then** the request is rejected with a 400/404 error and no doctor record is created.
4. **Given** a Super Admin submits a create-doctor request with a `categoryId` that belongs to a DEACTIVATED category, **Then** the request is rejected with a validation error — doctors can only be assigned to ACTIVE categories.

---

### User Story 3 - Super Admin Updates a Doctor's Category (Priority: P2)

A Super Admin edits an existing doctor's record (e.g. the doctor has switched specialties). The update form exposes the category as a dropdown that defaults to the doctor's current category, and the admin can change it to a different ACTIVE category. The doctor's category is updated and the change is reflected in subsequent reads.

**Why this priority**: Once doctors exist with categories, admins need a way to correct or change a doctor's category without deleting and re-creating the doctor. This is a routine edit operation, lower priority than the create flow because it can be deferred for a manual DB fix during initial rollout.

**Independent Test**: Can be fully tested by creating a doctor under category A, calling `PATCH /api/admin/doctors/:id` with category B, and asserting the doctor's category is now B and the rest of the record is unchanged.

**Acceptance Scenarios**:

1. **Given** a doctor exists with category A, **When** the Super Admin patches the doctor with category B, **Then** the doctor's `categoryId` is updated to B and the response includes the new category details.
2. **Given** a doctor exists, **When** the Super Admin patches the doctor without supplying a category, **Then** the existing category is left unchanged (partial update semantics).
3. **Given** a doctor exists, **When** the Super Admin patches the doctor with a `categoryId` that is DEACTIVATED, **Then** the request is rejected — the doctor keeps its current category.

---

### User Story 4 - Patients Filter the Doctor Catalog by Category (Priority: P1)

A patient uses the public doctor search and wants to narrow results to a single specialty (e.g. "Cardiology"). The filter is now expressed as a `categoryId` query parameter (a stable identifier from the categories dropdown) rather than a free-text specialty string. The listing returns only doctors whose category matches.

**Why this priority**: Doctor discovery by category is the most common patient filter. Without it, the public surface is broken (existing doctors with no category, or a stale free-text specialty, produce inconsistent results). The previous feature (004) made a `?specialty=` filter work; this feature replaces it with `?categoryId=` so the same patient flow continues to work end-to-end.

**Independent Test**: Can be fully tested by seeding doctors under multiple categories and asserting that `?categoryId=<id>` returns only the doctors in that category.

**Acceptance Scenarios**:

1. **Given** doctors exist under categories A and B, **When** a patient requests the listing with `?categoryId=<A>`, **Then** only doctors in category A are returned and the total count reflects only category A.
2. **Given** no doctor is in category X, **When** a patient requests `?categoryId=<X>`, **Then** the response has an empty array and `total: 0`.
3. **Given** a category is DEACTIVATED, **When** a patient requests `?categoryId=<that category>`, **Then** the response has an empty array — patients only see doctors in ACTIVE categories (consistent with the existing "deactivated doctors are hidden" rule from feature 004).
4. **Given** the patient supplies `?categoryId=<id>` together with a `?search=<term>`, **Then** the filters are combined with AND — a doctor must be in the category AND match the search term.

---

### User Story 5 - Patients Browse the Category Dropdown (Priority: P1)

A patient on the "Find a doctor" page opens the category filter dropdown. The dropdown is populated from a public categories endpoint that returns the full set of ACTIVE categories, sorted alphabetically by name. The patient picks one and the listing refreshes. This endpoint is the public read counterpart of the admin CRUD from US1.

**Why this priority**: This is what makes US4 usable from a UI — the patient cannot supply a `categoryId` unless the UI has a way to list them. It is the same role that the previous "specialties" endpoint played in feature 004, but now returning structured category records (id + name) instead of bare strings.

**Independent Test**: Can be fully tested by seeding multiple ACTIVE categories (and a few DEACTIVATED ones), hitting the public categories endpoint, and asserting only the ACTIVE ones come back, sorted, each with `id` and `name`.

**Acceptance Scenarios**:

1. **Given** several ACTIVE categories exist, **When** the public categories endpoint is called, **Then** the response is a JSON array of `{ id, name }` records, sorted alphabetically by name (case-insensitive), with no duplicates.
2. **Given** a DEACTIVATED category exists, **When** the public categories endpoint is called, **Then** that category does NOT appear in the response.
3. **Given** no categories exist, **When** the public categories endpoint is called, **Then** the response is an empty array.

---

### User Story 6 - Public Doctor Profile Exposes the Category (Priority: P2)

A patient opens a doctor's public profile (the endpoint from feature 004) and sees the doctor's category name as part of the profile. The category is a first-class field on the public profile, so the patient can see at a glance what kind of doctor they are looking at and click through to other doctors in the same category.

**Why this priority**: The profile is the page where the patient commits to a specific doctor; showing the category there is essential for confirmation, but the category is already shown in the listing (US4) so this is an enhancement rather than a new capability.

**Independent Test**: Can be fully tested by creating a doctor under a known category, hitting the public profile endpoint, and asserting the response includes the category id and name.

**Acceptance Scenarios**:

1. **Given** an ACTIVE doctor is assigned to a category, **When** the public profile is requested, **Then** the response includes a `category` object with `id` and `name`.
2. **Given** a doctor exists but the doctor has been deactivated, **When** the public profile is requested, **Then** the response is 404 (the existing behavior from feature 004 is preserved — deactivated doctors are hidden).

---

### Edge Cases

- What happens when a Super Admin tries to delete a category that still has doctors assigned? The delete is rejected with a 409 conflict; the admin must either re-categorize the affected doctors or deactivate the category instead.
- What happens when a Super Admin deactivates a category that has ACTIVE doctors assigned? The deactivation is allowed, but the public listing and dropdown endpoints stop returning that category (US4 and US5 still work — the affected doctors are simply not exposed publicly until they are moved to another category).
- What happens when a Super Admin changes a category's name? Existing doctor records continue to reference the same `categoryId`; the public surfaces (listing, profile, dropdown) all reflect the new name on the next read. No cascading update is needed on doctor records.
- What happens during initial rollout when the database already contains doctors with the old free-text `specialty` field? A one-time data migration backfills the new `Category` table from the distinct set of existing specialties (case-insensitive dedup) and assigns each doctor to the matching category. After the migration, all existing doctors have a `categoryId` and the old `specialty` column is dropped. (The detailed migration plan is out of scope for this spec — see the Assumptions section.)
- What happens when an unauthenticated visitor tries to call the admin categories endpoints (create, update, delete)? The request is rejected — these endpoints are admin-only, consistent with the existing admin pattern.
- What happens when an unauthenticated visitor tries to call the public categories endpoint? The request succeeds — this is a public read, like the public doctor listing.
- What happens when the same category name is submitted with different casing (e.g. "Cardiology" vs "cardiology")? The create is rejected as a duplicate (case-insensitive uniqueness) to keep the dropdown free of near-duplicate entries.
- What happens when a Super Admin tries to deactivate the only ACTIVE category? The deactivation is allowed; the public categories endpoint will return an empty array, which is the correct behavior (no specialties available until more categories are created).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist a new `Category` table with at minimum the fields `id`, `name`, `status` (`ACTIVE` | `DEACTIVATED`), `createdAt`, `updatedAt`. The `name` is unique case-insensitively within `ACTIVE` categories (deactivated duplicates are permitted to allow re-activation under the same name later).
- **FR-002**: The system MUST add a `categoryId` foreign key on the `Doctor` table pointing to `Category.id`. Every doctor record MUST have exactly one category; the field is NOT NULL.
- **FR-003**: The system MUST drop the legacy `specialty` free-text column on the `Doctor` table. All doctor read responses (admin, public, swagger) expose `category` (id + name) instead of `specialty`.
- **FR-004**: The system MUST expose admin CRUD endpoints for categories under `/api/admin/categories`:
  - `GET /api/admin/categories` — list categories (with optional `status` and `search` filters, paginated).
  - `GET /api/admin/categories/:id` — fetch one category.
  - `POST /api/admin/categories` — create a category (name required, status defaults to `ACTIVE`).
  - `PATCH /api/admin/categories/:id` — partial update (name and/or status).
  - `PATCH /api/admin/categories/:id/deactivate` — soft-deactivate.
  - `DELETE /api/admin/categories/:id` — hard delete; rejected with 409 if any doctor still references the category.
- **FR-005**: All admin category endpoints MUST require an authenticated session with the `admin` role. Unauthenticated or non-admin requests return 401/403, consistent with the existing admin guard pattern.
- **FR-006**: The `POST /api/admin/doctors` endpoint MUST require a `categoryId` field. A missing or empty `categoryId` returns 400. A `categoryId` that does not exist returns 404. A `categoryId` whose category is not `ACTIVE` returns 400.
- **FR-007**: The `PATCH /api/admin/doctors/:id` endpoint MUST accept an optional `categoryId` field with the same validation rules as FR-006. Omitting `categoryId` preserves the existing assignment.
- **FR-008**: The public doctor listing endpoint (`GET /api/doctors`) MUST accept an optional `categoryId` query parameter. When supplied, only doctors whose `categoryId` matches AND whose category is `ACTIVE` are returned. The previous `?specialty=` filter is removed.
- **FR-009**: The public doctor listing endpoint MUST include the category id and category name in each returned doctor record.
- **FR-010**: The public doctor profile endpoint (`GET /api/doctors/:id`) MUST include a `category` object (`{ id, name }`) in its response. The endpoint continues to return 404 for non-existent or DEACTIVATED doctors.
- **FR-011**: The system MUST expose a public `GET /api/categories` endpoint that returns the ACTIVE categories as `{ id, name }` records, sorted alphabetically by name (case-insensitive), with no duplicates. No authentication is required.
- **FR-012**: Category names MUST be validated for length (1-100 characters) and trimmed of leading/trailing whitespace before uniqueness checks. Empty or whitespace-only names are rejected with 400.
- **FR-013**: The system MUST prevent deletion of a category that is still referenced by any doctor (active or deactivated). The `DELETE /api/admin/categories/:id` endpoint returns 409 in that case.
- **FR-014**: When a category is deactivated, doctors assigned to that category remain in the database with their existing `categoryId`. The public surfaces (listing, profile, dropdown) hide them automatically because the category filter excludes non-`ACTIVE` categories. No cascading update is performed.
- **FR-015**: The system MUST perform a one-time data migration on rollout: distinct values from the existing `Doctor.specialty` column are inserted into `Category` (case-insensitive dedup, default status `ACTIVE`), and each doctor is assigned the matching `categoryId`. After the migration, the `specialty` column is dropped from `Doctor`. (See Assumptions for environment details.)
- **FR-016**: The system MUST update the seed script (if applicable) to create a default set of common categories so that a freshly seeded environment has categories available for doctor creation.

### Key Entities

- **Category**: the new controlled vocabulary that doctors reference. Fields: `id` (cuid), `name` (1-100 chars, unique case-insensitively within `ACTIVE` rows), `status` (`ACTIVE` | `DEACTIVATED`), `createdAt`, `updatedAt`. One category is referenced by many doctors (1:N relation from `Doctor` to `Category`).
- **Doctor** (modified): the existing standalone CRUD record. The `specialty` string field is removed. A new required `categoryId` foreign key is added, pointing to `Category.id`. The relation is many-doctors-to-one-category.
- **No other entities are introduced.** Users, sessions, accounts, and Better Auth's other tables are untouched.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Super Admin can create, list, edit, deactivate, and delete categories via the admin endpoints, and these operations persist in the database as expected (verifiable by re-fetching).
- **SC-002**: A Super Admin can create a doctor only when supplying a valid `categoryId` of an ACTIVE category. 100% of create-doctor requests that omit or supply an invalid `categoryId` are rejected with a non-2xx response and no doctor row is inserted.
- **SC-003**: After rollout, 100% of `Doctor` rows have a non-null `categoryId` that resolves to a `Category` row (data migration completeness).
- **SC-004**: Patients can filter the public doctor listing by `categoryId` and receive exactly the doctors in that category — no doctors from other categories, no doctors in DEACTIVATED categories.
- **SC-005**: The public categories endpoint returns only ACTIVE categories, sorted alphabetically (case-insensitive), with no duplicates, and the count matches the number of distinct ACTIVE categories in the database.
- **SC-006**: The public doctor profile response includes a `category` object whose `id` matches the doctor's `categoryId` and whose `name` matches the category's name as of the request time.
- **SC-007**: Deleting a category that still has doctors assigned fails 100% of the time with a 409 response; the category is preserved.
- **SC-008**: Unauthenticated and non-admin requests to any `/api/admin/categories` endpoint return 401 or 403, never 200.
- **SC-009**: After rollout, zero `Doctor` rows have a non-null `specialty` column (the column is dropped).
- **SC-010**: Existing patient flows (browse listing, filter, view profile) continue to work end-to-end with the new `categoryId`-based filter, with no regression in response time compared to the previous `specialty` filter.

## Assumptions

- **One category per doctor**: The relation is many-doctors-to-one-category, not many-to-many. This matches the current data shape (a doctor has a single specialty) and keeps the schema and APIs simple. A future feature could introduce many-to-many if multi-specialty doctors become a real requirement.
- **Category replaces specialty entirely**: The legacy `specialty` column is dropped, not kept alongside the new `categoryId`. Keeping both would create two sources of truth and require the existing `?specialty=` filter and listing logic to keep working — adding complexity for no real benefit. The data migration handles the transition.
- **Categories are admin-managed**: There is no public self-service category creation. Categories are a controlled vocabulary owned by the platform; this keeps the dropdown free of spam and duplicates.
- **Category name uniqueness is case-insensitive**: "Cardiology" and "cardiology" are the same category for uniqueness purposes, but the case of the first-created row is preserved as the canonical display name.
- **Soft delete via deactivation**: Categories support soft deactivation (status -> `DEACTIVATED`) in addition to hard delete. Hard delete is only available when no doctor references the category. This gives admins a way to retire a category without losing history.
- **Data migration approach**: A one-time migration script reads distinct values from the existing `Doctor.specialty` column, creates matching `Category` rows (skipping already-existing names case-insensitively), updates each doctor's `categoryId` to point to the matching category, and then drops the `specialty` column. The migration is idempotent — running it twice does not duplicate categories. Doctors with empty/null specialty are assigned to a "General" fallback category created as part of the migration; if no such doctors exist, the fallback category is not created.
- **Doctors are not exposed via category in the public listing until the doctor and the doctor's category are both ACTIVE**: This preserves the existing "deactivated doctors are hidden" behavior from feature 004 without a separate "is the doctor's category active" check leaking into the listing logic.
- **No public access to admin category endpoints**: The admin endpoints require the same auth as the existing admin endpoints (Super Admin role). The public categories endpoint is read-only and returns ACTIVE rows only.
- **The public categories endpoint replaces the previous "specialties" endpoint from feature 004**: The old `GET /api/doctors/specialties` (if implemented) is removed; clients are expected to call `GET /api/categories` instead. This is a breaking change to the public API surface, but no real clients exist yet.
- **No changes to Better Auth tables**: The category feature is entirely on the domain side. `User`, `Session`, `Account`, `Verification` are untouched.
- **No new third-party dependencies**: This feature uses the existing Prisma client and NestJS infrastructure. No new libraries are required.
- **Rate limiting and caching for the new endpoints**: The new public categories endpoint and the admin category endpoints follow the same patterns as the existing public and admin endpoints (e.g. rate limit per IP for public, no special rate limit for admin beyond session auth). The detailed numbers are out of scope for this spec and may be tuned in planning.
- **The seed script change is small**: A handful of common categories (Cardiology, Pediatrics, Dermatology, Orthopedics, General Practice) are added to the seed if a seed step exists for reference data; this is a convenience, not a hard requirement, and the categories are admin-editable after creation.
