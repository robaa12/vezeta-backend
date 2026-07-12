# API Contracts: Appointments & Booking (Patient + Public)

**Feature**: 006-appointments-booking
**Date**: 2026-07-12

## Overview

This document defines the **patient-facing** and **public**
contract surface for the booking loop. Admin endpoints are
documented separately in `admin-appointments-api.md`.

**Base URL**: `http://localhost:3000` (development) — same as all
other features.

**Authentication**: The patient endpoints require an authenticated
session (any role). The public slot listing is anonymous. The
session is delivered as an HTTP-only cookie
(`vezeta.session_token`) by Better Auth.

**Error format**: Standard NestJS HTTP exceptions. Validation
errors are returned by the global `ValidationPipe` (400 with a
descriptive message). `NotFoundException` maps to 404.
`ConflictException` maps to 409. `ForbiddenException` maps to 403.

**Swagger**: All endpoints are documented with `@nestjs/swagger`
decorators. The OpenAPI spec is available at `/api/docs`.

---

## Public Slot Listing

### GET /api/doctors/:doctorId/slots

List the AVAILABLE slots for an ACTIVE doctor in an ACTIVE
category, sorted ascending by start time.

**Auth**: anonymous (no auth required).

**Path parameters**:

| Name | Type | Description |
|------|------|-------------|
| doctorId | string (cuid) | The doctor's id |

**Query parameters**: none. The endpoint returns only AVAILABLE
slots.

**Response**: 200 OK

```json
{
  "slots": [
    {
      "id": "slot_abc",
      "doctorId": "doc_xyz",
      "startsAt": "2026-08-01T09:00:00.000Z",
      "endsAt": "2026-08-01T09:30:00.000Z",
      "status": "AVAILABLE",
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z"
    }
  ]
}
```

**Response headers**:
- `Cache-Control: public, max-age=60`
- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: <n>`

**Errors**:
- `404 Not Found` — doctor does not exist, is DEACTIVATED, or
  the doctor's category is DEACTIVATED.
- `429 Too Many Requests` — rate limit exceeded (60 req/min/IP).

**Notes**:
- The response does NOT include `BLOCKED` or `BOOKED` slots.
- Past-time slots ARE included (the booking endpoint rejects
  them with 400). This is consistent with the admin view.
- The response is always a JSON object with a `slots` array
  (never a top-level array) so future pagination metadata can
  be added without breaking clients.

---

## Book a Slot

### POST /api/appointments

Book an AVAILABLE slot. The slot is atomically flipped to
BOOKED, an appointment is created in PENDING status, and the
response includes the appointment with the nested doctor.

**Auth**: authenticated session (any role).

**Request body**:

```json
{
  "slotId": "slot_abc",
  "patientNotes": "Annual checkup"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| slotId | string (cuid) | yes | must reference an AVAILABLE slot for an ACTIVE doctor in an ACTIVE category | The slot to book |
| patientNotes | string | no | max 2000 chars | Patient-supplied context |

**Response**: 201 Created

```json
{
  "appointment": {
    "id": "appt_abc",
    "userId": "user_xyz",
    "doctorId": "doc_xyz",
    "slotId": "slot_abc",
    "scheduledAt": "2026-08-01T09:00:00.000Z",
    "status": "PENDING",
    "patientNotes": "Annual checkup",
    "cancelledAt": null,
    "cancelledBy": null,
    "createdAt": "2026-07-12T00:00:00.000Z",
    "updatedAt": "2026-07-12T00:00:00.000Z",
    "doctor": {
      "id": "doc_xyz",
      "name": "Dr. Jane Smith",
      "category": { "id": "cat_cardio", "name": "Cardiology" }
    }
  }
}
```

**Errors**:
- `400 Bad Request` — slot is in the past, slot belongs to a
  DEACTIVATED doctor, slot belongs to a doctor in a DEACTIVATED
  category, or `slotId` is missing/empty.
- `401 Unauthorized` — no active session.
- `403 Forbidden` — the session user is deactivated.
- `404 Not Found` — the `slotId` does not exist.
- `409 Conflict` — the slot is no longer AVAILABLE (already
  BOOKED, BLOCKED, or cancelled by another request).
- `429 Too Many Requests` — rate limit exceeded (60 req/min/IP).

---

## List My Appointments

### GET /api/appointments

List the requesting patient's own appointments, paginated, with
optional `?status=` filter.

**Auth**: authenticated session (any role).

**Query parameters**:

| Name | Type | Required | Default | Constraints | Description |
|------|------|----------|---------|-------------|-------------|
| status | string | no | — | enum: `PENDING` \| `CONFIRMED` \| `COMPLETED` \| `CANCELLED` | Filter by status |
| page | integer | no | 1 | >= 1 | 1-based page number |
| pageSize | integer | no | 20 | 1-100 | Items per page |

**Response**: 200 OK

```json
{
  "appointments": [
    {
      "id": "appt_abc",
      "status": "CONFIRMED",
      "scheduledAt": "2026-08-01T09:00:00.000Z",
      "patientNotes": "Annual checkup",
      "cancelledAt": null,
      "cancelledBy": null,
      "doctor": {
        "id": "doc_xyz",
        "name": "Dr. Jane Smith",
        "category": { "id": "cat_cardio", "name": "Cardiology" }
      },
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

**Errors**:
- `400 Bad Request` — invalid query parameters (e.g. `page = 0`,
  `pageSize = 101`, `status = 'INVALID'`).
- `401 Unauthorized` — no active session.

**Notes**:
- The response is ALWAYS scoped to the authenticated user. A
  patient CANNOT list another patient's appointments.
- The `cancelledAt` and `cancelledBy` fields are included for
  transparency but the patient is not shown a UI distinction
  between `'USER'` and `'ADMIN'` cancellation in v1.

---

## Cancel My Appointment

### PATCH /api/appointments/:id/cancel

Cancel one of the requesting patient's own appointments. The
appointment transitions to CANCELLED, the slot is released back
to AVAILABLE, and a different patient can book the slot.

**Auth**: authenticated session (any role).

**Path parameters**:

| Name | Type | Description |
|------|------|-------------|
| id | string (cuid) | The appointment id |

**Request body**: none.

**Response**: 200 OK

```json
{
  "appointment": {
    "id": "appt_abc",
    "status": "CANCELLED",
    "scheduledAt": "2026-08-01T09:00:00.000Z",
    "cancelledAt": "2026-07-12T01:23:45.000Z",
    "cancelledBy": "USER",
    "doctor": {
      "id": "doc_xyz",
      "name": "Dr. Jane Smith",
      "category": { "id": "cat_cardio", "name": "Cardiology" }
    }
  }
}
```

**Errors**:
- `401 Unauthorized` — no active session.
- `403 Forbidden` — the appointment is scheduled within the next
  24 hours. Patient self-cancel is rejected; the patient must
  contact an admin.
- `404 Not Found` — the appointment does not exist, OR it exists
  but belongs to a different patient. (Indistinguishable to the
  client for information-disclosure protection.)
- `409 Conflict` — the appointment is already CANCELLED or
  COMPLETED (terminal states; cannot be mutated).

**Notes**:
- The 24-hour cutoff is computed as `scheduledAt - now < 24h`.
- Cancelling a CANCELLED appointment returns 409 (not 200).
  Idempotency via 409, consistent with the deactivate pattern in
  features 003/005.
- The `cancelledBy` is always `'USER'` for this endpoint.
