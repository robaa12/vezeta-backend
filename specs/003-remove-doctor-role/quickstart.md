# Quickstart: Simplify Auth Model (Remove Doctor Role)

**Feature**: 003-remove-doctor-role
**Date**: 2026-07-11

This document describes the runnable validation scenarios that prove
the auth-model simplification works end-to-end. Each scenario is a
sequence of shell commands + expected outcomes. Refer to
[`data-model.md`](./data-model.md) and
[`contracts/admin-doctors-api.md`](./contracts/admin-doctors-api.md)
for the underlying data and contract details.

## Prerequisites

1. **PostgreSQL running** (Docker Compose from the project root works):
   ```bash
   docker compose -f docker-compose.dev.yml up -d postgres
   ```

2. **Environment variables** in `.env`:
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/vezeeta
   BETTER_AUTH_SECRET=replace-with-32-byte-secret
   BETTER_AUTH_URL=http://localhost:3000
   SEED_ADMIN_EMAIL=admin@vezeta.local
   SEED_ADMIN_PHONE=+201000000000
   SEED_ADMIN_PASSWORD=ChangeMe123!
   SEED_ADMIN_NAME=Super Admin
   ```

3. **Migration applied**:
   ```bash
   npm run db:migrate
   ```
   This applies the new `drop_doctor_profile` + `add_doctor` migration
   that ships with this feature. **On a fresh database this is
   sufficient.** On a database with existing data, see the **Data
   Migration** section in `data-model.md` before running this.

4. **Seed the Super Admin** (idempotent):
   ```bash
   npm run db:seed
   ```

5. **API server running**:
   ```bash
   npm run start:dev
   ```

---

## Scenario 1: Self-registration defaults to role "user" (US1)

**Acceptance criterion**: A new visitor registers and ends up with
`role = "user"`, regardless of the role they submit (or omit).

### Steps

```bash
# 1. Register without specifying a role
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@example.com","password":"hunter22!!"}' | jq
```

**Expected** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "Jane",
    "email": "jane@example.com",
    "role": "user",
    "emailVerified": false
  },
  "token": "..."
}
```

### Negative test

```bash
# 2. Try to register with role "doctor"
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Hacker","email":"hacker@example.com","password":"hunter22!!","role":"doctor"}' \
  -o /dev/null -w "%{http_code}\n"
```

**Expected**: 400 (rejected per the spec assumption; the role value
"doctor" is not in the new enum).

**Pass / Fail**:
- ✅ Pass: Default registration returns `role: "user"`; explicit
  `role: "doctor"` is rejected with 400.
- ❌ Fail: Registration creates `role: "doctor"` or any other value
  outside `{user, admin}`.

---

## Scenario 2: Admin creates a doctor (US2)

**Acceptance criterion**: A Super Admin can create a new doctor
record, and it appears in the listing.

### Steps

```bash
# 1. Sign in as the seeded admin
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vezeta.local","password":"ChangeMe123!"}' | jq

# 2. Create a new doctor
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Jane Smith","specialty":"Cardiology","bio":"20 years of experience."}' | jq
```

**Expected** (201):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "specialty": "Cardiology",
    "bio": "20 years of experience.",
    "imageUrl": null,
    "status": "ACTIVE",
    "createdAt": "2026-07-11T...",
    "updatedAt": "2026-07-11T..."
  }
}
```

### Steps (list)

```bash
# 3. List doctors
curl -s -b cookies.txt http://localhost:3000/api/admin/doctors | jq
```

**Expected** (200):
```json
{
  "doctors": [
    { "id": "clx...", "name": "Dr. Jane Smith", "status": "ACTIVE", ... }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

**Pass / Fail**:
- ✅ Pass: Doctor is created, has `status: "ACTIVE"`, appears in
  the list.
- ❌ Fail: Doctor not created, or status is anything other than
  `"ACTIVE"`, or list endpoint returns 403 to an admin.

---

## Scenario 3: Non-admin cannot call doctor endpoints (US2 + FR-012)

**Acceptance criterion**: A regular `user` is rejected with 403 on
any doctor-management endpoint.

### Steps

```bash
# 1. Sign in as the regular user from Scenario 1
curl -s -c user-cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"hunter22!!"}' | jq

# 2. Try to list doctors
curl -s -b user-cookies.txt -o /dev/null -w "%{http_code}\n" \
  http://localhost:3000/api/admin/doctors
```

**Expected**: 403.

**Pass / Fail**:
- ✅ Pass: 403 returned.
- ❌ Fail: 200 returned (the user can see the doctor list — a
  privilege escalation).

---

## Scenario 4: Admin updates a doctor (US2)

**Acceptance criterion**: An admin can update a doctor's fields and
the changes persist.

### Steps

```bash
# Assume signed in as admin (cookies.txt)
DOCTOR_ID="<paste-id-from-scenario-2>"

curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}" \
  -H "Content-Type: application/json" \
  -d '{"bio":"Updated bio","specialty":"Pediatric Cardiology"}' | jq
```

**Expected** (200):
```json
{
  "doctor": {
    "id": "clx...",
    "name": "Dr. Jane Smith",
    "specialty": "Pediatric Cardiology",
    "bio": "Updated bio",
    "status": "ACTIVE",
    ...
  }
}
```

**Pass / Fail**:
- ✅ Pass: Only the provided fields are updated; other fields
  unchanged; response reflects the new values.
- ❌ Fail: Other fields are reset, or the update silently fails.

---

## Scenario 5: Admin deactivates a doctor (US2 + FR-007)

**Acceptance criterion**: A deactivated doctor is hidden from
patient-facing search but visible to admins with a
"deactivated" indicator.

### Steps (deactivate)

```bash
DOCTOR_ID="<paste-id>"
curl -s -b cookies.txt -X PATCH \
  "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}/deactivate" | jq
```

**Expected** (200):
```json
{
  "doctor": { ..., "status": "DEACTIVATED", "updatedAt": "..." }
}
```

### Steps (admin list shows deactivated)

```bash
curl -s -b cookies.txt "http://localhost:3000/api/admin/doctors?status=DEACTIVATED" | jq
```

**Expected** (200): doctor is included in the result.

### Steps (patient-facing filter)

```bash
# (No patient-facing endpoint exists in this feature. The
# status=ACTIVE filter is the patient-facing equivalent.)
curl -s -b cookies.txt "http://localhost:3000/api/admin/doctors?status=ACTIVE" | jq
```

**Expected** (200): deactivated doctor is NOT in the result.

**Pass / Fail**:
- ✅ Pass: Deactivation sets `status: "DEACTIVATED"`; admin can still
  see the doctor with `?status=DEACTIVATED`; `?status=ACTIVE` excludes
  it.
- ❌ Fail: Doctor disappears from the admin list entirely, or the
  status filter is ignored.

---

## Scenario 6: Admin hard-deletes a doctor with no bookings (US2 + FR-008)

**Acceptance criterion**: Hard-delete succeeds when the doctor has
no historical bookings.

### Steps

```bash
DOCTOR_ID="<paste-id>"
curl -s -b cookies.txt -X DELETE \
  "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}" \
  -o /dev/null -w "%{http_code}\n"
```

**Expected**: 204.

### Steps (verify)

```bash
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}"
```

**Expected**: 404 (the doctor no longer exists).

**Pass / Fail**:
- ✅ Pass: 204, then 404.
- ❌ Fail: 409 (the doctor has bookings — unexpected in v1) or 500.

---

## Scenario 7: Admin role change — promotion (US5 + FR-011)

**Acceptance criterion**: An admin can promote a `user` to `admin`.

### Steps

```bash
# Get the user id from Scenario 1
USER_ID="<paste-jane-user-id>"

curl -s -b cookies.txt -X PATCH \
  "http://localhost:3000/api/admin/users/${USER_ID}/role" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' | jq
```

**Expected** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "Jane",
    "email": "jane@example.com",
    "role": "admin",
    ...
  }
}
```

**Pass / Fail**:
- ✅ Pass: User's role changes to `"admin"`.
- ❌ Fail: Role remains `"user"`, or 403 returned to the existing
  admin (should not happen — admins can promote).

---

## Scenario 8: Last-admin guard (US5 + FR-011 / SC-009)

**Acceptance criterion**: An admin cannot demote the last active
admin.

### Steps (only one admin exists)

```bash
# Assume only the seeded admin is an active admin
# 1. Demote the seeded admin:
ADMIN_ID="<paste-seeded-admin-id>"
curl -s -b cookies.txt -X PATCH \
  "http://localhost:3000/api/admin/users/${ADMIN_ID}/role" \
  -H "Content-Type: application/json" \
  -d '{"role":"user"}' | jq
```

**Expected** (409):
```json
{ "error": "last_admin" }
```

### Steps (more than one admin exists)

```bash
# 1. Promote Jane to admin (Scenario 7)
# 2. Now there are two active admins
# 3. Demote the seeded admin:
curl -s -b cookies.txt -X PATCH \
  "http://localhost:3000/api/admin/users/${ADMIN_ID}/role" \
  -H "Content-Type: application/json" \
  -d '{"role":"user"}' | jq
```

**Expected** (200): the seeded admin is demoted (because Jane is
still an active admin).

**Pass / Fail**:
- ✅ Pass: Single-admin scenario returns 409 `last_admin`; multi-admin
  scenario allows the demotion.
- ❌ Fail: Single-admin demotion succeeds (the platform is now
  adminless — a critical bug).

---

## Scenario 9: Social signup produces role "user" (US4 + FR-009)

**Acceptance criterion**: A new social signup (Google or Facebook)
creates an account with `role = "user"`, never `"doctor"`.

### Steps (verify via the `/me` endpoint after social sign-in)

```bash
# After a successful Google signup (see feature 002 quickstart for
# the full OAuth flow), the /me response should look like:
curl -s -b social-cookies.txt http://localhost:3000/api/me | jq
```

**Expected**:
```json
{
  "user": {
    "id": "clx...",
    "name": "...",
    "email": "...",
    "emailVerified": true,
    "role": "user",
    "linkedSocialProviders": [{ "provider": "google", "linkedAt": "..." }]
  }
}
```

**Pass / Fail**:
- ✅ Pass: `role: "user"`.
- ❌ Fail: `role: "patient"`, `role: "doctor"`, or `role: "admin"`.

---

## Scenario 10: DoctorProfile is gone — `User.doctorProfile` is `undefined`

**Acceptance criterion**: The `doctorProfile` field on user responses
is removed; the table no longer exists.

### Steps

```bash
# Sign in as any user and call /me:
curl -s -b cookies.txt http://localhost:3000/api/me | jq '.user.doctorProfile'
```

**Expected**: `null` (or the field is absent — depends on how
TypeScript / the response is shaped). No doctor profile data is
attached.

### Steps (database)

```bash
npx prisma studio
# → user table: no "doctorProfile" column or relation
# → doctor_profile table: does not exist
# → doctor table: standalone, no userId FK
```

**Pass / Fail**:
- ✅ Pass: `doctorProfile` is null; `DoctorProfile` table is gone;
  `Doctor` table is standalone.
- ❌ Fail: `doctorProfile` still returned, or the table still exists.

---

## Test Suite (npm)

The integration tests cover all of the above scenarios hermetically.
Run them with:

```bash
npm run test:e2e -- --testPathPattern=admin-doctors
```

Expected output:
```
PASS test/admin-doctors.e2e-spec.ts
  Admin Doctor CRUD & User Role Management (003-remove-doctor-role)
    ✓ Self-registration defaults to role "user" (Scenario 1)
    ✓ Admin creates a doctor (Scenario 2)
    ✓ Non-admin cannot call doctor endpoints (Scenario 3)
    ✓ Admin updates a doctor (Scenario 4)
    ✓ Admin deactivates a doctor (Scenario 5)
    ✓ Admin hard-deletes a doctor (Scenario 6)
    ✓ Admin role change — promotion (Scenario 7)
    ✓ Last-admin guard (Scenario 8)
    ✓ Social signup produces role "user" (Scenario 9)
    ✓ DoctorProfile is gone (Scenario 10)

Tests: 10 passed
```

---

## Cleanup

```bash
# Stop the API server (Ctrl+C)
# Drop the test database
docker compose -f docker-compose.dev.yml down -v
```

---

## Reference

- Spec: [`spec.md`](./spec.md)
- Plan: [`plan.md`](./plan.md)
- Research: [`research.md`](./research.md)
- Data model: [`data-model.md`](./data-model.md)
- API contracts: [`contracts/admin-doctors-api.md`](./contracts/admin-doctors-api.md)
- Upstream auth contracts: [`../001-better-auth-system/contracts/auth-api.md`](../001-better-auth-system/contracts/auth-api.md)
- Social auth contracts: [`../002-social-oauth-login/contracts/social-auth-api.md`](../002-social-oauth-login/contracts/social-auth-api.md)
