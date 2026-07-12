# Feature Specification: Doctor Search & Discovery (Module 2)

**Feature Branch**: `004-doctor-search`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Look at plan.md and start new spec for module 2 in the application." — `plan.md` §5 "Module 2 — Doctors (Profile, Search, Filtering)" describes the patient-facing surface: list with filters, public doctor profile, and a specialties endpoint. This spec covers that public surface, adapted to the standalone-`Doctor` model introduced in feature 003.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the Doctor Catalog (Priority: P1)

A patient (any unauthenticated visitor, or any logged-in `user`) visits the
platform and wants to see what doctors are available. They land on a
"Find a doctor" page that calls the doctor listing endpoint and shows a
paginated list of available doctors. Each card on the list shows the
doctor's name, specialty, a short bio preview, and profile image. The
patient can scroll through pages to see more results.

**Why this priority**: Doctor discovery is the first step in the booking
funnel. Without a way to see who is on the platform, no booking is
possible — the entire product collapses to "no doctors available". This
is the patient-facing equivalent of the admin's CRUD: the catalog is
populated by admins (feature 003) and consumed by patients here.

**Independent Test**: Can be fully tested by hitting the listing endpoint
with no filter, observing a 200 response with a paginated array of ACTIVE
doctors, and confirming that no authentication is required.

**Acceptance Scenarios**:

1. **Given** a database with several ACTIVE doctors and a few DEACTIVATED
   doctors, **When** a visitor requests the listing with no filter, **Then**
   the response includes only the ACTIVE doctors, in newest-first order,
   and the `total` count reflects only ACTIVE doctors.
2. **Given** the listing is requested, **When** the response is rendered,
   **Then** each entry has at minimum: `id`, `name`, `specialty`, a short
   `bio` preview, and `imageUrl`. Deactivated doctors do NOT appear.
3. **Given** the database has more doctors than the page size, **When** the
   visitor pages through the results, **Then** each page returns at most
   `pageSize` entries, and the response includes a `total` count and
   `page` / `pageSize` numbers for the client to drive pagination.

---

### User Story 2 - Filter the Catalog by Specialty (Priority: P1)

A patient knows what kind of doctor they need (e.g. "Cardiology") and
wants to narrow the catalog. They select a specialty from a dropdown
and the list updates to show only doctors matching that specialty.

**Why this priority**: Most doctor-discovery flows in real-world apps
lead with a specialty filter — "what kind of doctor are you looking
for?" is the first question in the funnel. A patient who can't filter
by specialty has to scroll through every doctor, which is untenable as
the catalog grows.

**Independent Test**: Can be fully tested by populating the database with
doctors of different specialties (e.g. 3 Cardiologists, 2 Pediatricians,
1 Dermatologist) and asserting that a `?specialty=Cardiology` filter
returns exactly the 3 Cardiologists.

**Acceptance Scenarios**:

1. **Given** a catalog with doctors of multiple specialties, **When** the
   patient filters by `specialty=Cardiology`, **Then** only Cardiology
   doctors are returned, and the `total` is the count of Cardiology
   doctors in the database.
2. **Given** a specialty is supplied that no doctor matches, **When** the
   patient requests the listing, **Then** an empty `doctors` array is
   returned with `total: 0`.
3. **Given** the patient supplies a specialty value, **When** the request
   is processed, **Then** the comparison is an exact match (case-sensitive
   on the input, but the underlying field is matched as-stored).

---

### User Story 3 - Search the Catalog by Name (Priority: P1)

A patient remembers a doctor's name (or part of it) and types it into a
search box. The list updates to show only doctors whose name contains
the search term (case-insensitive).

**Why this priority**: A returning patient looking for a specific
doctor they saw before is a common flow. The search also helps when
the patient heard about a doctor through word of mouth but doesn't
remember the exact spelling.

**Independent Test**: Can be fully tested by populating doctors with
overlapping names (e.g. "Dr. Jane Smith", "Dr. John Smith", "Dr. Sarah
Johnson") and asserting that a search for "smith" returns the two Smiths
and nothing else.

**Acceptance Scenarios**:

1. **Given** a catalog with doctors whose names contain "Smith",
   **When** the patient searches for `search=Smith`, **Then** all doctors
   with "Smith" anywhere in their name are returned (case-insensitive).
2. **Given** a search term that matches no doctor, **When** the patient
   requests the listing, **Then** an empty `doctors` array is returned.
3. **Given** a search term, **When** the request is processed, **Then**
   the search is also applied to the `specialty` field — searching
   "Cardio" matches "Cardiology" doctors, so the same input box doubles
   as a name and specialty search.

---

### User Story 4 - View a Doctor's Public Profile (Priority: P1)

A patient clicks on a doctor from the list (or follows a shared link)
and sees a full profile page. The profile shows the doctor's full bio,
specialty, profile image, and any other public fields. The profile is
public — no authentication required.

**Why this priority**: A doctor detail view is the natural next step
after a search. It's also the page that will eventually host the
"Book an appointment" button (a future feature, Module 3). The profile
itself is the smallest possible end-to-end demonstration of the
patient-facing doctor surface.

**Independent Test**: Can be fully tested by hitting the public profile
endpoint with a known doctor id and confirming all expected fields are
returned. Then hitting it with a deactivated doctor's id and confirming
the response is 404 (deactivated doctors are not publicly visible).

**Acceptance Scenarios**:

1. **Given** an ACTIVE doctor exists, **When** the patient requests the
   public profile by id, **Then** the response is 200 with the doctor's
   full public record: `id`, `name`, `specialty`, `bio`, `imageUrl`,
   `status: "ACTIVE"`, `createdAt`, `updatedAt`.
2. **Given** a DEACTIVATED doctor exists, **When** the patient requests
   the public profile by id, **Then** the response is 404 — deactivated
   doctors are not publicly visible.
3. **Given** a non-existent doctor id is requested, **When** the patient
   hits the endpoint, **Then** the response is 404 with a generic "not
   found" error (no information leakage about whether the id ever
   existed).

---

### User Story 5 - Browse the Specialties Dropdown (Priority: P2)

A patient wants to filter by specialty but doesn't know what specialties
are on the platform. The "Find a doctor" page populates a specialty
dropdown by calling the specialties endpoint. The dropdown shows the
distinct list of specialties from the active doctor catalog, sorted
alphabetically.

**Why this priority**: The dropdown improves UX significantly (no need
to type a specialty to find it), but the same job can be done by typing
in the search box (US3) or by manually entering a specialty string (US2).
This is an enhancement, not a hard requirement.

**Independent Test**: Can be fully tested by populating doctors of
multiple specialties and asserting the endpoint returns each distinct
specialty exactly once, sorted alphabetically.

**Acceptance Scenarios**:

1. **Given** a catalog with doctors of 5 distinct specialties, **When**
   the patient requests the specialties endpoint, **Then** the response
   is a JSON array of those 5 specialty strings, sorted alphabetically
   (case-insensitive).
2. **Given** a specialty has at least one ACTIVE doctor, **When** the
   specialties endpoint is called, **Then** the specialty appears in the
   response.
3. **Given** a specialty has only DEACTIVATED doctors (no ACTIVE ones),
   **When** the specialties endpoint is called, **Then** the specialty
   does NOT appear in the response — the dropdown reflects what's
   actually available, not the historical catalog.

---

### User Story 6 - Newly Created Doctor Becomes Searchable (Priority: P2)

A Super Admin creates a new doctor via the admin CRUD (feature 003).
Within seconds (without an explicit cache flush), the new doctor appears
in the patient-facing search and is accessible via the public profile
endpoint. Similarly, when an admin deactivates a doctor, the doctor
disappears from public search within seconds.

**Why this priority**: Cache-freshness is the kind of thing that breaks
in production but works in dev. The previous feature (003) specified
"5 seconds" as a success criterion; this feature defines the exact
behavior so the implementation can meet it.

**Independent Test**: Can be fully tested by timing how long it takes
for a newly created doctor to appear in the public listing, and how
long it takes for a deactivated doctor to disappear.

**Acceptance Scenarios**:

1. **Given** an admin creates a new ACTIVE doctor, **When** the patient
   requests the listing up to 5 seconds later, **Then** the new doctor
   is included in the response.
2. **Given** an admin deactivates a doctor, **When** the patient requests
   the listing up to 5 seconds later, **Then** the deactivated doctor is
   NO LONGER in the response.
3. **Given** the public profile endpoint, **When** called for a doctor
   that was just deactivated, **Then** the endpoint returns 404.

---

### Edge Cases

- What happens when a patient passes a search term with special characters
  (e.g. `O'Brien`, `Smith & Co`)? The search is performed via a
  parameterized ILIKE query, so special characters are treated as
  literal text — `O'Brien` matches only `O'Brien`, not `OBrien`. SQL
  injection is prevented by the parameter binding.
- What happens when a patient passes an absurdly long search term? The
  endpoint MUST cap the input length (e.g. 120 characters) to prevent
  resource exhaustion. Longer inputs return 400.
- What happens when a patient passes a `page` of 0 or a negative number?
  The endpoint validates `page >= 1` and `pageSize >= 1 && pageSize <= 100`,
  returning 400 on violation.
- What happens when a patient passes both `specialty` and `search`? The
  filters are combined with AND — a doctor must match BOTH the specialty
  and the search term to be returned.
- What happens when the doctor catalog is empty? The listing returns
  `doctors: []` with `total: 0`; the specialties endpoint returns `[]`;
  the public profile endpoint returns 404 for any id.
- What happens when an admin deactivates a doctor that a patient has
  bookmarked? The patient's bookmarked link now returns 404. The frontend
  is expected to handle this gracefully (out of scope for the backend).
- What happens when the page size is exactly at the boundary (100)?
  The request is allowed. When 101, the request returns 400.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a public doctor listing endpoint
  that returns a paginated list of doctors with `status = "ACTIVE"`.
  Deactivated doctors MUST NOT appear in the response.
- **FR-002**: The system MUST allow the public doctor listing to be
  filtered by an exact-match `specialty` query parameter.
- **FR-003**: The system MUST allow the public doctor listing to be
  searched by a case-insensitive substring on both the doctor's `name`
  and `specialty` fields via a `search` query parameter.
- **FR-004**: The system MUST sort the public doctor listing by
  `createdAt` descending (newest first) by default. Sorting is not
  user-configurable in v1.
- **FR-005**: The system MUST paginate the public doctor listing using
  a 1-based `page` parameter and a `pageSize` parameter capped at 100
  (default 20).
- **FR-006**: The system MUST expose a public doctor profile endpoint
  that returns a single doctor by id. The endpoint returns 200 with the
  doctor's public record when the doctor exists AND has
  `status = "ACTIVE"`. The endpoint returns 404 in all other cases
  (non-existent id, DEACTIVATED status) — it does not distinguish
  between "never existed" and "deactivated" to avoid information
  leakage.
- **FR-007**: The public doctor profile response MUST include at minimum:
  `id`, `name`, `specialty`, `bio`, `imageUrl`, `status`, `createdAt`,
  `updatedAt`. The full bio (not truncated) is returned.
- **FR-008**: The system MUST expose a public specialties endpoint that
  returns the distinct list of `specialty` values from all doctors with
  `status = "ACTIVE"`, sorted alphabetically (case-insensitive).
- **FR-009**: The system MUST require no authentication for the public
  doctor listing, the public doctor profile, or the specialties
  endpoint. These endpoints are accessible to anonymous visitors.
- **FR-010**: The system MUST cap the `search` query parameter at 120
  characters. Longer inputs return 400.
- **FR-011**: The system MUST validate `page` (>= 1, integer) and
  `pageSize` (1-100, integer). Invalid values return 400.
- **FR-012**: The system MUST validate the `specialty` query parameter
  (max 100 characters, matches the field length). Invalid values return
  400.
- **FR-013**: A newly created or newly deactivated doctor MUST become
  visible or hidden in the public listing within 5 seconds of the admin
  action — no manual cache flush required.
- **FR-014**: The system MUST rate-limit the public doctor endpoints
  per client IP to prevent abuse (specific limit TBD in planning —
  reasonable default: 60 requests per minute per IP for the listing,
  120 requests per minute for the profile, 30 requests per minute for
  specialties).
- **FR-015**: The public doctor listing, profile, and specialties
  endpoints MUST be cacheable by intermediaries (CDNs, reverse proxies)
  with a short `Cache-Control: max-age` header (e.g. 60 seconds for the
  listing, 300 seconds for the profile, 600 seconds for specialties)
  to reduce backend load while still meeting the 5-second freshness
  target from FR-013.

### Key Entities

- **Doctor** (inherited from feature 003): the standalone CRUD record
  with `id`, `name`, `specialty`, `bio`, `imageUrl`, `status`
  (`ACTIVE` | `DEACTIVATED`), `createdAt`, `updatedAt`. This feature
  reads the same table; no new fields are added.
- No new entities are introduced. This feature is a public read
  surface over the `Doctor` table populated by admins in feature 003.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An anonymous visitor can browse the doctor listing
  without authentication and see at least the first page of ACTIVE
  doctors within 2 seconds under normal load.
- **SC-002**: 100% of DEACTIVATED doctors do NOT appear in the public
  listing, the public profile endpoint, or the specialties endpoint.
- **SC-003**: A newly created ACTIVE doctor is included in the public
  listing within 5 seconds of creation, and is accessible via the
  public profile endpoint within the same window.
- **SC-004**: A newly deactivated doctor is removed from the public
  listing within 5 seconds of deactivation, and the public profile
  endpoint returns 404 for the doctor's id within the same window.
- **SC-005**: The public doctor listing correctly filters by `specialty`
  — querying `?specialty=Cardiology` returns exactly the doctors whose
  specialty equals `Cardiology`, no more and no less.
- **SC-006**: The public doctor listing correctly applies a case-
  insensitive substring search — querying `?search=smith` returns all
  doctors with "smith" anywhere in their name, regardless of case.
- **SC-007**: Combining `?specialty=X&search=Y` returns the
  intersection — doctors matching BOTH the specialty AND the search
  term.
- **SC-008**: The specialties endpoint returns the distinct list of
  specialties from ACTIVE doctors, sorted alphabetically, with no
  duplicates.
- **SC-009**: The endpoints return 400 (not 500) for invalid query
  parameters (page < 1, pageSize > 100, search > 120 chars, specialty
  > 100 chars).
- **SC-010**: An anonymous visitor can hit the public profile endpoint
  without any authentication header and receive a 200 response for an
  ACTIVE doctor, or 404 for any other case.

## Assumptions

- **No additional doctor fields**: This feature does not add new fields
  to the `Doctor` table. Fields like `city`, `clinicAddress`,
  `consultationFee`, `rating`, `reviewCount`, `yearsOfExperience` are
  out of scope here. If needed, they would be added in future features
  (and the listing response would be extended to include them).
- **Sorting is fixed**: The only supported sort is `createdAt DESC`.
  User-configurable sort (e.g. by name, by rating) is out of scope.
- **No location-based search**: Geo-search (doctors near me) is out of
  scope. Filter dimensions are limited to `specialty` and `search`.
- **No doctor comparison or favorites**: Features like "compare two
  doctors side by side" or "save a doctor to favorites" are out of
  scope.
- **The specialties dropdown is just a list of strings**: The endpoint
  returns plain string values. Each value is a free-text `specialty`
  field (no controlled vocabulary in v1). Future features may introduce
  a `Specialty` lookup table; this spec does not require it.
- **Rate limiting is per-IP**: Behind a CDN or reverse proxy, the IP is
  the proxy's IP. The implementation should be aware of `X-Forwarded-For`
  headers — out of scope to detail here, but the planning phase should
  pick a rate-limiter that respects trusted proxies.
- **Cache headers are advisory**: The `Cache-Control` header is a hint
  to intermediaries, not a guarantee. The 5-second freshness target
  (FR-013) is what the system MUST meet, regardless of how the cache
  is configured.
- **No reviews on the profile yet**: The doctor profile does NOT include
  rating or reviews. Those come in Module 4 (Reviews & Ratings). The
  current profile is the basic "bio + specialty + photo" record.
- **Deactivated doctors are completely hidden**: Not "shown with a
  deactivated label", not "greyed out" — completely absent from the
  public surface. Admins see them in the admin list (feature 003) but
  the public does not.
- **Anonymous access is intentional**: The public doctor surface is the
  primary patient-acquisition funnel. Requiring auth would block
  search-engine indexing and reduce the platform's discoverability.
- **Migration safety**: No new database tables or migrations. This
  feature reuses the `Doctor` table from feature 003.
- **No new dependencies**: This feature uses the existing Prisma client
  and NestJS infrastructure. No new third-party libraries are required.
- **The previous plan.md doctor-self-management endpoints (`PATCH
  /doctors/me`, `GET /doctors/me`) do not apply**: Since doctors are no
  longer users (feature 003), they cannot log in or self-manage. The
  admin CRUD (feature 003) is the only way to update a doctor's record
  in v1. A future "doctor portal" feature could add a separate auth
  flow for doctors, but that's out of scope here.
