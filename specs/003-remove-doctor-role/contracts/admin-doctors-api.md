# API Contracts: Admin Doctor CRUD & User Role Management

**Feature**: 003-remove-doctor-role
**Date**: 2026-07-11
**Upstream**: 001-better-auth-system/contracts/auth-api.md, admin endpoints in `src/admin/admin.controller.ts`

## Overview

This document defines the new admin API surface introduced by the
auth model simplification. The existing doctor-profile approval
endpoints (PENDING/APPROVED/REJECTED/SUSPENDED workflow) are removed
and replaced by a full CRUD interface on the new standalone `Doctor`
entity. A new role-change endpoint is added with a last-admin guard.

**Base URL**: `http://localhost:3000` (development) — same as feature 001.

**Authentication**: Session-based via HTTP-only cookies. All new
endpoints require an active session with `role = "admin"`. Non-admin
sessions are rejected with 403.

**Error format**: Errors use Better Auth's standard format (or our
controller shapes — see each endpoint).

---

## Doctor Management

### GET /api/admin/doctors

List doctors with optional filters and pagination.

**Auth**: required (role: admin).

**Query parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | no | `"ACTIVE"` or `"DEACTIVATED"` |
| specialty | string | no | Exact match on the doctor's specialty |
| search | string | no | Case-insensitive substring match on `name` or `specialty` |
| page | integer | no | 1-based page number (default 1) |
| pageSize | integer | no | Items per page (default 20, max 100) |

**Response** (200):
```json
{
  "doctors": [
    {
      "id": "clx...",
      "name": "Dr. Jane Smith",
      "specialty": "Cardiology",
      "bio": "20 years of experience in...",
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

**Failure cases**:
- 401 — No active session.
- 403 — Session role is not "admin".
- 400 — `page` or `pageSize` is invalid (non-integer, pageSize > 100).

---

### POST /api/admin/doctors

Create a new doctor record.

**Auth**: required (role: admin).

**Request body**:
```json
{
  "name": "Dr. Jane Smith",
  "specialty": "Cardiology",
  "bio": "20 years of experience in...",
  "imageUrl": "https://cdn.example.com/jane.jpg"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 2-120 chars |
| specialty | string | yes | max 100 chars |
| bio | string | no | max 2000 chars |
| imageUrl | string | no | valid URL, max 2048 chars |

**Response** (201):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "specialty": "Cardiology",
    "bio": "20 years of experience in...",
    "imageUrl": "https://cdn.example.com/jane.jpg",
    "status": "ACTIVE",
    "createdAt": "2026-07-11T10:00:00Z",
    "updatedAt": "2026-07-11T10:00:00Z"
  }
}
```

**Failure cases**:
- 400 — Validation error (missing name/specialty, fields too long, invalid URL).
- 401 / 403 — Auth checks as above.

---

### GET /api/admin/doctors/:id

Get a single doctor by id.

**Auth**: required (role: admin).

**URL parameters**: `id` — Doctor id (cuid).

**Response** (200):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "specialty": "Cardiology",
    "bio": "...",
    "imageUrl": "...",
    "status": "ACTIVE",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Failure cases**:
- 401 / 403 — Auth checks as above.
- 404 — No doctor with the given id.

---

### PATCH /api/admin/doctors/:id

Update one or more doctor fields. Only the provided fields are
updated (partial update).

**Auth**: required (role: admin).

**URL parameters**: `id` — Doctor id.

**Request body** (all fields optional, at least one required):
```json
{
  "name": "Dr. Jane Smith-Johnson",
  "specialty": "Pediatric Cardiology",
  "bio": "Updated bio",
  "imageUrl": "https://cdn.example.com/jane2.jpg",
  "status": "ACTIVE"
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| name | string | 2-120 chars (if provided) |
| specialty | string | max 100 chars (if provided) |
| bio | string | max 2000 chars (if provided) |
| imageUrl | string | valid URL, max 2048 chars (if provided) |
| status | string | `"ACTIVE"` or `"DEACTIVATED"` (if provided) |

**Response** (200):
```json
{ "doctor": { ... updated doctor object ... } }
```

**Failure cases**:
- 400 — Validation error (e.g. empty name, fields too long) or empty body.
- 401 / 403 — Auth checks as above.
- 404 — No doctor with the given id.

---

### PATCH /api/admin/doctors/:id/deactivate

Soft-deactivate a doctor. The doctor is hidden from patient-facing
search but remains in the database with `status = "DEACTIVATED"`.

**Auth**: required (role: admin).

**URL parameters**: `id` — Doctor id.

**Request body**: none.

**Response** (200):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "status": "DEACTIVATED",
    "updatedAt": "2026-07-11T11:00:00Z",
    ...other fields...
  }
}
```

**Failure cases**:
- 401 / 403 — Auth checks as above.
- 404 — No doctor with the given id.
- 409 — Doctor is already deactivated (`{ error: "already_deactivated" }`).

---

### DELETE /api/admin/doctors/:id

Hard-delete a doctor record. Allowed only when the doctor has zero
historical bookings (v1: always allowed; the check is a stub for
future use when an appointments feature lands).

**Auth**: required (role: admin).

**URL parameters**: `id` — Doctor id.

**Response** (204): empty body.

**Failure cases**:
- 401 / 403 — Auth checks as above.
- 404 — No doctor with the given id.
- 409 — Doctor has historical bookings; deletion rejected
  (`{ error: "doctor_has_bookings" }`).

---

## User Role Management

### PATCH /api/admin/users/:id/role

Promote or demote a user. Includes the **last-admin guard**: a
demotion that would leave the system with zero active admins is
rejected.

**Auth**: required (role: admin).

**URL parameters**: `id` — User id.

**Request body**:
```json
{ "role": "admin" }
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| role | string | yes | Must be `"user"` or `"admin"` |

**Response** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "admin",
    "isActive": true,
    "updatedAt": "2026-07-11T11:00:00Z"
  }
}
```

**Failure cases**:
- 400 — `role` is not `"user"` or `"admin"`.
- 401 — No active session.
- 403 — Session role is not "admin".
- 404 — No user with the given id.
- 409 — Last-admin guard: this change would leave the system with
  zero active admins (`{ error: "last_admin" }`).

---

### GET /api/admin/users/:id (extended from feature 001)

Get a single user. The response shape is unchanged from feature 001
(but `role` is now one of `"user" | "admin"`, never `"doctor"` or
`"patient"`).

**Auth**: required (role: admin).

**Response** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "emailVerified": true,
    "phoneNumber": "+201234567890",
    "phoneNumberVerified": true,
    "role": "user",
    "isActive": true,
    "image": null,
    "createdAt": "2026-07-11T10:00:00Z",
    "updatedAt": "2026-07-11T10:00:00Z"
  }
}
```

**Note**: the `doctorProfile` field that was attached to user
responses in feature 001 is **removed** (no more `DoctorProfile`
table). This is a breaking change to the response shape — clients
that read `user.doctorProfile` will see `undefined` and should be
updated.

---

### PATCH /api/admin/users/:id/deactivate (unchanged from feature 001)

Deactivate a user account. The shape and behavior are unchanged from
feature 001. The response includes the user's `role`, which is now
`"user"` or `"admin"`.

---

## Removed Endpoints

The following endpoints from feature 001 are **removed** in this
feature. Calling them returns 404.

| Old endpoint | Reason for removal |
|--------------|---------------------|
| `GET /api/admin/doctors?status=PENDING\|APPROVED\|...` | Replaced by the new doctor CRUD list endpoint with `status=ACTIVE\|DEACTIVATED` |
| `PATCH /api/admin/doctors/:id/approve` | No approval gate — doctors are immediately active when created |
| `PATCH /api/admin/doctors/:id/reject` | Same as above |
| `PATCH /api/admin/doctors/:id/suspend` | Replaced by `PATCH /api/admin/doctors/:id/deactivate` |
| `GET /api/doctors/test-route` | No doctor-only routes (no `DoctorApprovedGuard`) |

---

## Existing Endpoints — Behavior Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/auth/sign-up/email` | `role` field is now ignored. The account is always created with `role = "user"`. Any submitted value other than `"user"` (or omitted) is either accepted-as-user or rejected with 400 (per the spec assumption: **rejected with 400** for clarity). |
| `POST /api/auth/sign-in/*` | No change. Returns the user with `role` being `"user"` or `"admin"`. |
| `GET /api/me` | No schema change in the response shape, but the `doctorProfile` field is removed. The `linkedSocialProviders` field from feature 002 is preserved. |
| `GET /api/auth/sign-in/social?provider=google\|facebook` | No change. New social signups have `role = "user"` (the `additionalFields.role.defaultValue` was changed to `"user"`). |

---

## Security Notes

- All admin endpoints are guarded by `RolesGuard` + `@Roles('admin')`,
  reusing the existing pattern from feature 001.
- The role-change endpoint's last-admin guard is enforced at the
  service layer, not at the DB layer, so it is visible in the API
  contract (409 with `error: "last_admin"`).
- Doctor CRUD is admin-only; patients cannot list or read individual
  doctors via these endpoints. (A future patient-facing doctor
  browse endpoint would be a separate, public-ish endpoint — not in
  this feature.)
- Deactivation is **soft** (status change) by default, preserving
  audit history. Hard delete is reserved for doctors with no
  historical bookings.
