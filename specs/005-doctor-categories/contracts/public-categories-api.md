# API Contracts: Public Categories & Modified Doctor Surface

**Feature**: 005-doctor-categories
**Date**: 2026-07-12
**Upstream**: 004-doctor-search (the public doctor surface that
this feature modifies)

## Overview

This document covers two related surfaces:

1. The new public `GET /api/categories` endpoint, which
   replaces the previous `GET /api/specialties` endpoint.
2. The **modifications** to the existing public doctor
   endpoints (listing, profile) to use the new
   `category: { id, name }` shape and the `?categoryId=`
   filter.

All endpoints are **anonymous** (no authentication required).
They serve the patient-facing side of the doctor catalog. The
admin-side CRUD for categories lives in
[`admin-categories-api.md`](./admin-categories-api.md); the
admin-side doctor CRUD lives in
`specs/003-remove-doctor-role/contracts/admin-doctors-api.md`.

**Base URL**: `http://localhost:3000` (development) — same as
all other features.

**Authentication**: None. All endpoints are
`@AllowAnonymous()`.

**Error format**: Standard NestJS HTTP exceptions. Validation
errors are returned by the global `ValidationPipe` (400 with a
descriptive message). `NotFoundException` maps to 404.

**Caching**: Each endpoint sets a `Cache-Control: public,
max-age=N` header — see `data-model.md` § Caching Strategy for
the exact values.

---

## Public Categories

### GET /api/categories

List the ACTIVE categories as `{ id, name }` records, sorted
alphabetically by name (case-insensitive). Replaces the
previous `GET /api/specialties` endpoint.

**Auth**: none (anonymous).

**Query parameters**: none.

**Response** (200):
```json
{
  "categories": [
    { "id": "cat_cardiology", "name": "Cardiology" },
    { "id": "cat_dermatology", "name": "Dermatology" },
    { "id": "cat_pediatrics", "name": "Pediatrics" }
  ]
}
```

**Response headers**:
- `Cache-Control: public, max-age=300`
- `Content-Type: application/json`

**Behavior**:
- Only `Category` rows with `status = "ACTIVE"` are returned.
- Duplicates are impossible (the unique constraint is
  `(name, status)` and the data is normalized); no client-side
  dedup is needed.
- Sorted alphabetically using a JS-side case-insensitive sort
  (Postgres' default collation is case-sensitive for `ORDER BY`
  on a `text` column, so the application applies a defensive
  sort to guarantee consistent client-visible order).
- An empty catalog returns `{ categories: [] }`.

**Failure cases**:
- 429 — Rate limit exceeded (60 req/min per IP, applied via
  `@nestjs/throttler`).

**Removed endpoint**: The previous `GET /api/specialties`
endpoint is REMOVED. Clients calling `/api/specialties` will
receive 404. Migration to `/api/categories` is required.

---

## Public Doctor Listing (Modified)

### GET /api/doctors

List ACTIVE doctors with optional filters and pagination. The
`?specialty=` filter is **removed**; the new `?categoryId=`
filter replaces it. The `search` filter now matches against
`name` OR `category.name` (via the relation).

**Auth**: none (anonymous).

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| **categoryId** | string | no | — | max 64 chars (cuid) | **NEW** — filter by category id. Only ACTIVE categories' doctors are returned. |
| search | string | no | — | max 120 chars, case-insensitive | Substring match on name OR category.name |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Removed parameter**: `specialty` (the legacy free-text
filter). The endpoint ignores an unknown `specialty` parameter
or returns 400 — implementation decides during code review.

**Response** (200):
```json
{
  "doctors": [
    {
      "id": "clx_abc123",
      "name": "Dr. Jane Smith",
      "category": {
        "id": "cat_cardiology",
        "name": "Cardiology"
      },
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
- Only doctors with `status = "ACTIVE"` AND whose `category`
  has `status = "ACTIVE"` are included. A doctor with an
  ACTIVE status but a DEACTIVATED category is hidden.
- Results are sorted by `createdAt` descending (newest first).
- The `total` count is the total number of doctors matching
  the filters (regardless of pagination).
- Combining `categoryId` and `search`: the doctor must match
  BOTH the category id AND the search substring (AND).
- The `search` parameter matches against `name` AND
  `category.name` (case-insensitive substring) via a Prisma
  relation filter.
- The `categoryId` filter is an equality match on the FK. If
  the supplied id does not exist or is DEACTIVATED, the result
  is an empty array (NOT 404 — the listing endpoint is
  collection-oriented, not resource-oriented).

**Failure cases**:
- 400 — `categoryId` exceeds 64 chars, `search` exceeds 120
  chars, `page` < 1 or non-integer, `pageSize` < 1 or > 100
  or non-integer.
- 429 — Rate limit exceeded (60 req/min per IP).

---

## Public Doctor Profile (Modified)

### GET /api/doctors/:id

Fetch a single ACTIVE doctor by id. The response now includes
a `category: { id, name }` object. The 404 behavior is
preserved from feature 004: both non-existent ids AND doctors
with `DEACTIVATED` status return 404 (indistinguishable). **New
behavior**: a doctor with `status = "ACTIVE"` whose category
is `DEACTIVATED` ALSO returns 404.

**Auth**: none (anonymous).

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Doctor id |

**Response** (200):
```json
{
  "doctor": {
    "id": "clx_abc123",
    "name": "Dr. Jane Smith",
    "category": {
      "id": "cat_cardiology",
      "name": "Cardiology"
    },
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
- Returns 200 only when:
  - The doctor exists, AND
  - The doctor has `status = "ACTIVE"`, AND
  - The doctor's category has `status = "ACTIVE"`.
- Returns 404 in all other cases:
  - Doctor id does not exist
  - Doctor exists but has `status = "DEACTIVATED"`
  - Doctor is ACTIVE but the category is `DEACTIVATED`
- The 404 message is generic ("Doctor not found") to avoid
  information leakage about which ids have ever existed or
  what their current state is.

**Failure cases**:
- 404 — Doctor not found (covers all three cases above —
  indistinguishable to the caller).
- 429 — Rate limit exceeded (120 req/min per IP).

---

## Removed / Out-of-Scope Endpoints

| Old endpoint | Status |
|--------------|--------|
| `GET /api/specialties` | REMOVED. Replaced by `GET /api/categories` (this doc). |
| `?specialty=<text>` query parameter on `GET /api/doctors` | REMOVED. Use `?categoryId=<id>` instead. |
| `?specialty=<text>` query parameter on `GET /api/admin/doctors` | REMOVED. See `specs/003-remove-doctor-role/contracts/admin-doctors-api.md` (modified by this feature). |
| `specialty` field in public doctor responses | REMOVED. Replaced by `category: { id, name }`. |
| `specialty` field in admin doctor responses | REMOVED. Replaced by `category: { id, name }`. |
| `specialty` field in the swagger schema for doctor responses | REMOVED. The `category` schema is documented instead. |
| Doctor rating/reviews on the public profile | Out of scope — comes with the Reviews & Ratings module. |
| Doctor location-based search | Out of scope — no `city` field on `Doctor`. |
| Doctor multi-category support (many-to-many) | Out of scope — one category per doctor (matches the current data shape). |

---

## Relationship to Other Endpoints

- **Public categories endpoint** (`GET /api/categories`,
  above) is the data source for the patient dropdown. The
  client picks an `id` from this list and passes it to the
  listing via `?categoryId=<id>`.
- **Admin doctor endpoints** (`/api/admin/doctors/...`) are
  the write side. The admin create/update endpoints require
  `categoryId` (see the modified admin contract in
  `specs/003-remove-doctor-role/`).
- **Admin category endpoints** (`/api/admin/categories/...`,
  in [`admin-categories-api.md`](./admin-categories-api.md))
  are the write side for the vocabulary itself.

---

## Security Notes

- All three endpoints are anonymous. No CSRF token is needed
  for GET requests.
- The endpoints return only public, non-PII data. The doctor's
  name, category, bio, and image URL are all explicitly
  public (admins enter them via the CRUD; the spec is clear
  that the public profile is the primary patient-acquisition
  funnel).
- Rate limiting protects against scraping. The default limits
  (60/120 req/min per IP) are generous for normal use but
  cap automated abuse.
- The `Cache-Control` headers are public, so CDNs and reverse
  proxies may cache responses. Patient data is not included
  in any response, so this is safe.
- The 404 behavior (404 for non-existent, deactivated doctor,
  OR doctor with deactivated category) prevents information
  leakage: an attacker cannot probe for category states by
  distinguishing "this doctor has a deactivated category" from
  "this doctor doesn't exist".
- The `search` parameter is length-capped at 120 chars and
  passed to Prisma as a parameterized query. SQL injection is
  not possible.
- The `categoryId` parameter is a cuid, length-capped at 64
  chars. No injection risk.
