## Summary

This PR delivers a broad set of improvements across security, admin management, public catalog data, and data integrity.

---

### 1. Auth — Require Email Verification (Security Hardening)

**Problem:** Users could sign up and immediately sign in without verifying their email, and duplicate sign-ups leaked account existence via 409 Conflict.

**Changes:**
- Enabled `requireEmailVerification: true` in Better Auth's email/password config (`src/auth/auth.ts`)
- Enabled `overrideDefaultEmailVerification: true` so the OTP plugin handles verification
- Password sign-in now returns `403 EMAIL_NOT_VERIFIED` until the email OTP is confirmed
- Sign-up no longer sets a session cookie — users must verify first
- Duplicate sign-up emails now return `200` (no information leakage)
- Updated `test/auth.e2e-spec.ts` to cover the new verification-gated flow

---

### 2. Admin — Activate Endpoints for Doctors & Users

Added `PATCH /api/admin/doctors/:id/activate` and `PATCH /api/admin/users/:id/activate`:

- **Doctors:** Sets `status` from `DEACTIVATED` → `ACTIVE`. Returns `409` if already active, `404` if not found. Records an audit log entry.
- **Users:** Sets `isActive` from `false` → `true`. Returns `404` if not found. Records an audit log entry.
- Added full unit tests for both flows.

---

### 3. Appointments — `hasReview` Flag & Patient Reference

- **`hasReview` boolean** added to `AppointmentResponseDto` — allows the patient UI to show "Write Review" vs "Reviewed" without a separate API call.
- **`patient` reference** (`{id, name}`) included in admin appointment responses via the `user` relation.
- Both `listMyAppointments` and `getAdminAppointment` now include the `review` relation.
- `ListMyAppointmentsResult` registered as the Swagger response type on list endpoints.

---

### 4. Slots — Soft-Delete with DELETED Tombstone

**Problem:** Hard-deleting slots broke foreign key constraints when appointments referenced them.

**Changes:**
- `deleteSlot` now sets `status = DELETED` via `updateMany` instead of physical delete
- Both `AVAILABLE` and `BLOCKED` slots can be deleted
- Deleted slots are excluded from all admin listings via `VISIBLE_SLOT_STATUSES`
- `getAdminSlot`, `updateSlot`, `blockSlot` now use `findFirst` with status filter
- Added comprehensive unit tests for soft-delete, blocked-slot delete, and listing filters

---

### 5. Doctor Catalog — Ratings, Image, and Service Count

**Public doctor list** (`GET /api/doctors`) now returns:
- `imageUrl` — doctor profile image
- `averageRating` — aggregate review rating via `review.groupBy` (single query, no N+1)
- `reviewCount` — total review count

**Admin doctor list** now returns:
- `serviceCount` — total number of services via Prisma `_count`

---

### 6. Cache Headers — `no-store` for Public Catalog

- Removed `Cache-Control: public, max-age=60/300` from `/doctors`, `/doctors/:id`, and `/slots`
- Replaced with `no-store` to prevent stale data after admin status changes
- Added `Cross-Origin-Resource-Policy: cross-origin` middleware for `/uploads` static serving

---

### 7. Medical Records — Admin Lookup Endpoint

- New `GET /api/admin/appointments/:id/medical-record` endpoint
- Returns `{ medicalRecord }` or `{ medicalRecord: null }` when no record exists
- Added unit tests for both cases

---

### 8. Reviews — Admin DTO and Public Restriction

- New `ListAdminReviewsDto` with validated `doctorId` and `userId` filter fields
- Public reviews endpoint now requires both doctor and category to be `ACTIVE`
- Improved notification copy for appointment completion and review submission

---

### 9. Docker — Persist Doctor Uploads

- Created `/app/uploads/doctors` directory in Dockerfile
- Added `doctor-uploads` named volume in `docker-compose.yml`
- Documented Docker volume persistence in `INTEGRATION.md`

---

### 10. Documentation & OpenAPI

- Regenerated `openapi.json` with new schemas (`AppointmentResponseDto`, `ListMyAppointmentsResult`, `ListAdminReviewsDto` query params, activate endpoints)
- Updated `INTEGRATION.md` with new endpoint documentation, cache header changes, and Docker volume info

---

### Test Coverage

- **29 files changed**, ~1000 lines added
- New unit tests for: `activateUser`, `activateDoctor`, `serviceCount`, `soft-delete slots`, `hasReview`, `patient ref`, `getForAdmin`, `ListAdminReviewsDto`, `rating aggregation`
- Updated existing tests to match new behavior
