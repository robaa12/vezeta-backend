# API Contracts: Admin Categories

**Feature**: 005-doctor-categories
**Date**: 2026-07-12

## Overview

This document defines the **admin** CRUD surface for the new
`Category` entity. All endpoints require an authenticated
session with the `admin` role (`RolesGuard` + `@Roles('admin')`,
inherited from `src/admin/admin.controller.ts`). The endpoints
are mounted at `/api/admin/categories` under the
`src/categories/admin-categories.controller.ts` controller in
the new `src/categories/` feature module.

**Base URL**: `http://localhost:3000` (development) — same as
all other features.

**Authentication**: Required. All endpoints inherit the global
session check. The `RolesGuard` rejects non-admin sessions with
403.

**Error format**: Standard NestJS HTTP exceptions. Validation
errors are returned by the global `ValidationPipe` (400 with a
descriptive message). `NotFoundException` maps to 404.
`ConflictException` maps to 409.

**Swagger**: All endpoints are documented with `@nestjs/swagger`
decorators. The OpenAPI spec is available at `/api/docs` (the
existing Swagger UI endpoint).

---

## List Categories

### GET /api/admin/categories

List categories with optional filters and pagination.

**Auth**: admin role required.

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| status | string | no | — | enum: `ACTIVE` \| `DEACTIVATED` | Filter by status |
| search | string | no | — | max 100 chars, case-insensitive | Substring match on name |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Response** (200):
```json
{
  "categories": [
    {
      "id": "cat_abc123",
      "name": "Cardiology",
      "status": "ACTIVE",
      "createdAt": "2026-07-12T10:00:00Z",
      "updatedAt": "2026-07-12T10:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

**Behavior**:
- Sorted by `name` ascending (case-insensitive, JS-side sort).
- The `total` count is the total number of categories matching
  the filters, used by the client to render pagination.

**Failure cases**:
- 400 — `search` exceeds 100 chars, `page` < 1 or non-integer,
  `pageSize` < 1 or > 100 or non-integer, `status` not in the
  enum.
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Get Category

### GET /api/admin/categories/:id

Fetch a single category by id.

**Auth**: admin role required.

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Category id |

**Response** (200):
```json
{
  "category": {
    "id": "cat_abc123",
    "name": "Cardiology",
    "status": "ACTIVE",
    "createdAt": "2026-07-12T10:00:00Z",
    "updatedAt": "2026-07-12T10:00:00Z"
  }
}
```

**Failure cases**:
- 404 — Category not found.
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Create Category

### POST /api/admin/categories

Create a new category. Used by the admin UI's "Add category"
form.

**Auth**: admin role required.

**Request body**:
```json
{
  "name": "Cardiology",
  "status": "ACTIVE"
}
```

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| name | string | yes | — | 1-100 chars, trimmed | Display name |
| status | string | no | `ACTIVE` | enum: `ACTIVE` \| `DEACTIVATED` | Initial status |

**Response** (201):
```json
{
  "category": {
    "id": "cat_abc123",
    "name": "Cardiology",
    "status": "ACTIVE",
    "createdAt": "2026-07-12T10:00:00Z",
    "updatedAt": "2026-07-12T10:00:00Z"
  }
}
```

**Behavior**:
- The name is trimmed of leading/trailing whitespace before
  validation and persistence.
- A case-insensitive uniqueness check is performed for ACTIVE
  rows: if an ACTIVE category with the same name (case-
  insensitive) already exists, the request is rejected with
  409 (see below).
- It is allowed to create a DEACTIVATED category with a name
  that matches an existing ACTIVE row — the composite unique
  `(name, status)` permits this. The use case: "retire
  Cardiology, then re-introduce it later under the same name
  without an active conflict".

**Failure cases**:
- 400 — Missing `name`, empty `name` (after trim), `name` > 100
  chars, or `status` not in the enum.
- 409 — `duplicate_category`. An ACTIVE category with the same
  name (case-insensitive) already exists. Response body:
  ```json
  {
    "message": "A category with this name already exists",
    "error": "duplicate_category"
  }
  ```
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Update Category

### PATCH /api/admin/categories/:id

Partially update a category. Either `name`, `status`, or both
may be supplied.

**Auth**: admin role required.

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Category id |

**Request body** (any subset of the fields):
```json
{
  "name": "Cardiology & Vascular",
  "status": "DEACTIVATED"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| name | string | no | 1-100 chars, trimmed | New display name |
| status | string | no | enum: `ACTIVE` \| `DEACTIVATED` | New status |

**Response** (200):
```json
{
  "category": {
    "id": "cat_abc123",
    "name": "Cardiology & Vascular",
    "status": "DEACTIVATED",
    "createdAt": "2026-07-12T10:00:00Z",
    "updatedAt": "2026-07-12T10:01:00Z"
  }
}
```

**Behavior**:
- Partial update: omitted fields are left unchanged.
- Renaming: same case-insensitive uniqueness check as create.
  If the new name conflicts with an existing ACTIVE category,
  the update is rejected with 409.
- Reactivation: setting `status: "ACTIVE"` on a DEACTIVATED
  row checks for an existing ACTIVE row with the same name
  (case-insensitive). If one exists, the update is rejected
  with 409 — the admin must rename or delete the existing
  row first.
- The `updatedAt` timestamp is refreshed.

**Failure cases**:
- 400 — Invalid `name` (length) or `status` (not in enum), or
  the request body has no recognized fields.
- 404 — Category not found.
- 409 — `duplicate_category` (rename or reactivate collision).
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Deactivate Category

### PATCH /api/admin/categories/:id/deactivate

Soft-deactivate a category. Equivalent to `PATCH /:id` with
`status: "DEACTIVATED"`, but provided as a dedicated endpoint
for audit-trail clarity (matches the existing
`/api/admin/doctors/:id/deactivate` pattern).

**Auth**: admin role required.

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Category id |

**Response** (200):
```json
{
  "category": {
    "id": "cat_abc123",
    "name": "Cardiology",
    "status": "DEACTIVATED",
    "createdAt": "2026-07-12T10:00:00Z",
    "updatedAt": "2026-07-12T10:01:00Z"
  }
}
```

**Failure cases**:
- 404 — Category not found.
- 409 — `already_deactivated`. The category is already
  `DEACTIVATED`. Response body:
  ```json
  {
    "message": "Category is already deactivated",
    "error": "already_deactivated"
  }
  ```
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Delete Category

### DELETE /api/admin/categories/:id

Hard-delete a category. Only allowed if no doctors reference the
category.

**Auth**: admin role required.

**URL parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | Category id |

**Response** (204): No content.

**Behavior**:
- The delete is wrapped in a Prisma `$transaction` that counts
  referencing doctors before the delete (R10 in `research.md`).
- The FK constraint on `Doctor.categoryId` (`ON DELETE
  RESTRICT`) is a backstop — the application-level check
  converts the would-be constraint violation into a clean 409
  with a user-friendly message.

**Failure cases**:
- 404 — Category not found.
- 409 — `category_in_use`. One or more doctors still reference
  this category. Response body:
  ```json
  {
    "message": "Cannot delete a category that is still in use by one or more doctors",
    "error": "category_in_use"
  }
  ```
  The error message does NOT include the count of referencing
  doctors (information disclosure avoidance).
- 401 — No active session.
- 403 — Session user is not an admin.

---

## Removed / Out-of-Scope Endpoints

| Old plan.md reference | Status |
|------------------------|--------|
| `POST /api/categories` (public self-service create) | Out of scope — categories are admin-managed. |
| `PATCH /api/categories/:id` (public self-service edit) | Out of scope. |
| `DELETE /api/categories/:id` (public self-service delete) | Out of scope. |
| `GET /api/categories` (public list of categories) | Lives in the public surface; see [`public-categories-api.md`](./public-categories-api.md). |

---

## Relationship to Other Endpoints

- **Public categories endpoint** (`GET /api/categories`) reads
  the same `Category` table; see the public contract.
- **Admin doctor endpoints** (`/api/admin/doctors/...`) are
  modified to require a valid `categoryId`; the validation is
  inline (a Prisma lookup) and does NOT call into the
  `CategoriesService` (Principle II: no cross-module service
  imports).
- **Public doctor endpoints** (`/api/doctors/...`) are
  modified to expose `category: { id, name }` instead of the
  legacy `specialty` string; the `?categoryId=<id>` filter
  replaces the legacy `?specialty=<text>` filter.

---

## Security Notes

- All endpoints require an authenticated session with the
  `admin` role. The session check is enforced by Better Auth's
  global guard; the role check is enforced by `RolesGuard`.
- CSRF protection is inherited from the existing admin module
  (Better Auth's session cookies are HTTP-only and the admin
  routes are protected by the standard `SameSite=Lax` cookie
  policy).
- The category name is the only user-controlled string; it is
  trimmed and length-validated. The service uses Prisma
  parameterized queries for the uniqueness check — no SQL
  injection risk.
- The `category_in_use` error message does NOT include the
  count of referencing doctors, avoiding an information
  disclosure that would help an attacker probe for
  under-populated categories.
- The category `id` is a server-generated cuid, not
  user-controlled. Path parameter validation is handled by
  NestJS's default string handling.
