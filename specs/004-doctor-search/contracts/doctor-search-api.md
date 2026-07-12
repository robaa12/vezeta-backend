# API Contracts: Doctor Search & Discovery (Module 2)

**Feature**: 004-doctor-search
**Date**: 2026-07-12
**Upstream**: 003-remove-doctor-role (admin doctor CRUD — different module, different contract)

## Overview

This document defines the public, read-only doctor surface. All
three endpoints are **anonymous** (no authentication required)
and serve the patient-facing side of the doctor catalog. The
admin-side CRUD lives in `src/admin/` and is documented in
`specs/003-remove-doctor-role/contracts/admin-doctors-api.md`.

**Base URL**: `http://localhost:3000` (development) — same as
all other features.

**Authentication**: None. All three endpoints are
`@AllowAnonymous()`. The endpoints are reachable by anonymous
visitors and do not consume a session.

**Error format**: Standard NestJS HTTP exceptions. Validation
errors are returned by the global `ValidationPipe` (400 with a
descriptive message). `NotFoundException` maps to 404.

**Caching**: Each endpoint sets a `Cache-Control: public,
max-age=N` header — see `data-model.md` § Caching Strategy for
the exact values.

---

## Public Doctor Listing

### GET /api/doctors

List ACTIVE doctors with optional filters and pagination.

**Auth**: none (anonymous).

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| specialty | string | no | — | max 100 chars | Exact match on the doctor's specialty |
| search | string | no | — | max 120 chars, case-insensitive | Substring match on name OR specialty |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Response** (200):
```json
{
  "doctors": [
    {
      "id": "clx...",
      "name": "Dr. Jane Smith",
      "specialty": "Cardiology",
      "bio": "20 years of experience in interventional cardiology.",
      "imageUrl": "https://cdn.example.com/jane.jpg",
      "status": "ACTIVE",
      "createdAt": "2026-07-11T10:00:00Z",
      "updatedAt": "2026-07-11T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

**Response headers**:
- `Cache-Control: public, max-age=60`
- `Content-Type: application/json`

**Behavior**:
- Only doctors with `status = "ACTIVE"` are included.
- Results are sorted by `createdAt` descending (newest first).
- The `total` count is the total number of doctors matching
  the filters (regardless of pagination), used by the client
  to render pagination controls.
- Combining `specialty` and `search`: the doctor must match
  BOTH the exact specialty AND the search substring (AND).
- The `search` parameter matches against both `name` and
  `specialty` fields (case-insensitive substring).

**Failure cases**:
- 400 — `specialty` exceeds 100 chars, `search` exceeds 120
  chars, `page` < 1 or non-integer, `pageSize` < 1 or > 100
  or non-integer.
- 429 — Rate limit exceeded (60 req/min per IP).

---

## Public Doctor Profile

### GET /api/doctors/:id

Fetch a single ACTIVE doctor by id.

**Auth**: none (anonymous).

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Doctor id |

**Response** (200):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "specialty": "Cardiology",
    "bio": "20 years of experience in interventional cardiology.",
    "imageUrl": "https://cdn.example.com/jane.jpg",
    "status": "ACTIVE",
    "createdAt": "2026-07-11T10:00:00Z",
    "updatedAt": "2026-07-11T10:00:00Z"
  }
}
```

**Response headers**:
- `Cache-Control: public, max-age=300`
- `Content-Type: application/json`

**Behavior**:
- Returns 200 only when the doctor exists AND has
  `status = "ACTIVE"`.
- Returns 404 in all other cases:
  - Doctor id does not exist
  - Doctor exists but has `status = "DEACTIVATED"`
- The 404 message is generic ("Doctor not found") to avoid
  information leakage about whether a given id ever existed.

**Failure cases**:
- 404 — Doctor not found (covers both non-existent and
  deactivated cases — indistinguishable to the caller).
- 429 — Rate limit exceeded (120 req/min per IP).

---

## Public Specialties

### GET /api/specialties

List the distinct specialties from the active doctor catalog,
sorted alphabetically (case-insensitive).

**Auth**: none (anonymous).

**Query parameters**: none.

**Response** (200):
```json
{
  "specialties": [
    "Cardiology",
    "Dermatology",
    "Pediatrics",
    "Psychiatry"
  ]
}
```

**Response headers**:
- `Cache-Control: public, max-age=600`
- `Content-Type: application/json`

**Behavior**:
- The list is built from doctors with `status = "ACTIVE"`
  only. Specialties whose only doctors are DEACTIVATED are
  excluded.
- Duplicates are removed.
- Sorted alphabetically using Postgres' default collation
  (case-insensitive in Postgres for `ORDER BY` on a `text`
  column by default — but for safety the implementation
  normalizes case via a JS-side sort if the DB collation
  doesn't).
- An empty catalog returns `{ specialties: [] }`.

**Failure cases**:
- 429 — Rate limit exceeded (30 req/min per IP).

---

## Removed / Out-of-Scope Endpoints

The following endpoints are **NOT** part of this feature. They
are listed here for clarity so callers don't expect them.

| Old plan.md reference | Status |
|------------------------|--------|
| `PATCH /doctors/me` (doctor self-management) | Out of scope — doctors are not users (feature 003). Doctor records are managed via the admin CRUD at `/api/admin/doctors/...`. |
| `GET /doctors/me` | Same as above. |
| `GET /specialties` filter dropdown populated by free-text from user input | The endpoint returns a fixed JSON list, not a UI widget. The frontend renders the dropdown from the response. |
| Doctor rating/reviews on the public profile | Out of scope — comes with Module 4 (Reviews & Ratings). |
| Doctor location-based search (`?city=...`) | Out of scope — no `city` field on the `Doctor` table. |
| Doctor consultation fee filtering (`?minFee=...&maxFee=...`) | Out of scope — no `fee` field on the `Doctor` table. |

---

## Relationship to Other Endpoints

- **Admin doctor CRUD** (`/api/admin/doctors/...`, from feature
  003) is the write side. This feature is the read side.
- The `Doctor` record shape is identical between the two —
  the public response and the admin response use the same
  field names and types. The frontend can use a single
  TypeScript type for both.
- The `/api/auth/me` and `/api/me` endpoints (from feature
  001) are unrelated — they return the current session user,
  not a doctor.

---

## Security Notes

- All three endpoints are anonymous. No CSRF token is needed
  for GET requests.
- The endpoints return only public, non-PII data. The doctor's
  name, specialty, bio, and image URL are all explicitly
  public (admins enter them via the CRUD; the spec is clear
  that the public profile is the primary patient-acquisition
  funnel).
- Rate limiting (FR-014) protects against scraping. The
  default limits (60/120/30 req/min per IP) are generous for
  normal use but cap automated abuse.
- The `Cache-Control` headers are public, so CDNs and reverse
  proxies may cache responses. Patient data is not included
  in any response, so this is safe.
- The 404-vs-410 decision (FR-006) prevents information
  leakage: an attacker cannot probe for deactivated doctor ids
  by distinguishing "never existed" from "used to exist".
- The `search` parameter is length-capped at 120 chars and
  passed to Prisma as a parameterized query. SQL injection
  is not possible.
