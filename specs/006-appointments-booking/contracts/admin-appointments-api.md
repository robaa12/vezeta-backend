# API Contracts: Appointments & Booking (Admin)

**Feature**: 006-appointments-booking
**Date**: 2026-07-12

## Overview

This document defines the **admin** surface for the booking loop.
All endpoints require an authenticated session with the `admin`
role (`RolesGuard` + `@Roles('admin')`, inherited from the
existing admin pattern).

**Base URL**: `http://localhost:3000` (development).

**Authentication**: required. Admin-only.

**Error format**: Standard NestJS HTTP exceptions.

---

## Admin Slot Management

### POST /api/admin/doctors/:doctorId/slots

Create a new AVAILABLE slot for an ACTIVE doctor in an ACTIVE
category.

**Auth**: admin role required.

**Path parameters**:

| Name | Type | Description |
|------|------|-------------|
| doctorId | string (cuid) | The doctor this slot belongs to |

**Request body**:

```json
{
  "startsAt": "2026-08-01T09:00:00.000Z",
  "endsAt": "2026-08-01T09:30:00.000Z"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| startsAt | Date (ISO 8601) | yes | must be > now | Slot start (UTC) |
| endsAt | Date (ISO 8601) | yes | must be > startsAt | Slot end (UTC) |

**Response**: 201 Created

```json
{
  "slot": {
    "id": "slot_abc",
    "doctorId": "doc_xyz",
    "startsAt": "2026-08-01T09:00:00.000Z",
    "endsAt": "2026-08-01T09:30:00.000Z",
    "status": "AVAILABLE",
    "createdAt": "2026-07-12T00:00:00.000Z",
    "updatedAt": "2026-07-12T00:00:00.000Z"
  }
}
```

**Errors**:
- `400 Bad Request` — `endsAt <= startsAt`, `startsAt <= now`,
  doctor is DEACTIVATED, doctor's category is DEACTIVATED.
- `404 Not Found` — doctor does not exist.
- `401 Unauthorized` — no active session.
- `403 Forbidden` — not an admin.

---

### GET /api/admin/slots

List all slots (any status), paginated, with optional filters.

**Auth**: admin role required.

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| doctorId | string (cuid) | no | — | — | Filter by doctor |
| status | string | no | — | enum: `AVAILABLE` \| `BOOKED` \| `BLOCKED` | Filter by status |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Response**: 200 OK

```json
{
  "slots": [
    { "id": "slot_abc", "doctorId": "doc_xyz", "startsAt": "...", "endsAt": "...", "status": "AVAILABLE", "createdAt": "...", "updatedAt": "..." }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

### GET /api/admin/slots/:id

Fetch a single slot by id.

**Auth**: admin role required.

**Response**: 200 OK (single slot object) or `404 Not Found`.

---

### PATCH /api/admin/slots/:id

Update a slot. Currently the only mutable field is `status` (used
to BLOCK or UN-BLOCK a slot).

**Auth**: admin role required.

**Request body**:

```json
{
  "status": "BLOCKED"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| status | string | yes | enum: `AVAILABLE` \| `BLOCKED` | New status. `BOOKED` is not settable via this endpoint — the lifecycle of a BOOKED slot is managed by the booking + cancellation transactions. |

**Response**: 200 OK (updated slot object).

**Errors**:
- `400 Bad Request` — attempting to set `status = 'BOOKED'`.
- `404 Not Found` — slot does not exist.

---

### PATCH /api/admin/slots/:id/block

Convenience endpoint to BLOCK a slot (equivalent to
`PATCH /api/admin/slots/:id` with `{ "status": "BLOCKED" }`).
Idempotent — blocking an already-BLOCKED slot returns 200.

**Auth**: admin role required.

**Response**: 200 OK (slot object, `status: 'BLOCKED'`).

---

### DELETE /api/admin/slots/:id

Hard-delete a slot. Only AVAILABLE slots can be deleted;
BOOKED or BLOCKED slots return 409 (the admin must un-book or
un-block first).

**Auth**: admin role required.

**Response**: 204 No Content.

**Errors**:
- `404 Not Found` — slot does not exist.
- `409 Conflict` — slot is `BOOKED` or `BLOCKED`.

---

## Admin Appointment Listing

### GET /api/admin/appointments

List all appointments across all patients, paginated, with
optional filters.

**Auth**: admin role required.

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| status | string | no | — | enum: `PENDING` \| `CONFIRMED` \| `COMPLETED` \| `CANCELLED` | Filter by status |
| userId | string (cuid) | no | — | — | Filter by patient |
| doctorId | string (cuid) | no | — | — | Filter by doctor |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Response**: 200 OK (same shape as the patient list).

**Errors**:
- `400 Bad Request` — invalid query parameters.
- `401 Unauthorized`, `403 Forbidden` — same as the other admin
  endpoints.

---

### GET /api/admin/appointments/:id

Fetch a single appointment by id.

**Auth**: admin role required.

**Response**: 200 OK (single appointment object, includes
`cancelledAt` and `cancelledBy`) or `404 Not Found`.

---

## Admin Appointment Lifecycle

### PATCH /api/admin/appointments/:id/confirm

Transition a PENDING appointment to CONFIRMED.

**Auth**: admin role required.

**Request body**: none.

**Response**: 200 OK (appointment with `status: 'CONFIRMED'`).

**Errors**:
- `404 Not Found` — appointment does not exist.
- `409 Conflict` — appointment is not in PENDING status (already
  CONFIRMED, CANCELLED, or COMPLETED).

---

### PATCH /api/admin/appointments/:id/cancel

Cancel any appointment, regardless of timing. The slot is
released atomically.

**Auth**: admin role required.

**Request body**: none.

**Response**: 200 OK (appointment with `status: 'CANCELLED'`,
`cancelledAt: <now>`, `cancelledBy: 'ADMIN'`).

**Errors**:
- `404 Not Found` — appointment does not exist.
- `409 Conflict` — appointment is already CANCELLED or COMPLETED.

**Notes**:
- The admin has NO 24-hour cutoff. An admin can cancel an
  appointment 5 minutes before its scheduled time.

---

### PATCH /api/admin/appointments/:id/complete

Mark a CONFIRMED appointment as COMPLETED. Requires the
appointment's `scheduledAt` to be in the past.

**Auth**: admin role required.

**Request body**: none.

**Response**: 200 OK (appointment with `status: 'COMPLETED'`).

**Errors**:
- `400 Bad Request` — appointment's `scheduledAt` is in the
  future.
- `404 Not Found` — appointment does not exist.
- `409 Conflict` — appointment is not in CONFIRMED status
  (PENDING, CANCELLED, or already COMPLETED).
