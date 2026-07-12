# Quickstart: Doctor Categories

**Feature**: 005-doctor-categories
**Date**: 2026-07-12

This document describes the runnable validation scenarios that
prove the doctor categories feature works end-to-end. Each
scenario is a sequence of shell commands + expected outcomes.
Refer to
[`data-model.md`](./data-model.md),
[`contracts/admin-categories-api.md`](./contracts/admin-categories-api.md),
and
[`contracts/public-categories-api.md`](./contracts/public-categories-api.md)
for the underlying data and contract details.

## Prerequisites

1. **PostgreSQL running** (Docker Compose from the project
   root works):
   ```bash
   docker compose -f docker-compose.dev.yml up -d postgres
   ```

2. **Environment variables** in `.env`:
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/vezeeta
   BETTER_AUTH_SECRET=replace-with-32-byte-secret
   BETTER_AUTH_URL=http://localhost:3000
   ```

3. **Migrations applied** (this includes the new
   `add_categories` migration with the data backfill):
   ```bash
   npm run db:migrate
   ```

4. **Seed the Super Admin AND the default categories**
   (idempotent):
   ```bash
   npm run db:seed
   ```
   The seed creates 5 default categories: Cardiology,
   Pediatrics, Dermatology, Orthopedics, General Practice.

5. **API server running**:
   ```bash
   npm run start:dev
   ```

6. **An admin session cookie** is needed for the admin
   scenarios. Save the cookie after signing in as the Super
   Admin:
   ```bash
   curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"..."}' \
     > /dev/null
   ```
   Replace the credentials with the values used by
   `npm run db:seed`.

---

## Scenario 1: Admin lists default categories (US1)

**Acceptance criterion**: A Super Admin can list the seeded
default categories.

### Steps

```bash
curl -s -b cookies.txt http://localhost:3000/api/admin/categories | jq
```

**Expected** (200):
```json
{
  "categories": [
    { "id": "...", "name": "Cardiology", "status": "ACTIVE", ... },
    { "id": "...", "name": "Dermatology", "status": "ACTIVE", ... },
    { "id": "...", "name": "General Practice", "status": "ACTIVE", ... },
    { "id": "...", "name": "Orthopedics", "status": "ACTIVE", ... },
    { "id": "...", "name": "Pediatrics", "status": "ACTIVE", ... }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

**Pass / Fail**:
- ✅ Pass: 5 ACTIVE categories, alphabetically sorted by name.
- ❌ Fail: Wrong count; missing categories; not sorted; any
  DEACTIVATED status.

---

## Scenario 2: Admin creates a new category (US1)

**Acceptance criterion**: A Super Admin can create a new
category with a unique name.

### Steps

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Neurology"}' | jq
```

**Expected** (201):
```json
{
  "category": {
    "id": "cat_...",
    "name": "Neurology",
    "status": "ACTIVE",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### Negative: duplicate name (case-insensitive)

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"neurology"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 409 with
`{"message":"A category with this name already exists","error":"duplicate_category"}`.

### Negative: empty name

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"   "}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 400 (validation error — empty after trim).

**Pass / Fail**:
- ✅ Pass: First request 201; duplicate (case-insensitive)
  returns 409; whitespace-only returns 400.
- ❌ Fail: Duplicate accepted; whitespace-only accepted;
  status field defaults incorrectly.

---

## Scenario 3: Admin creates a doctor with a categoryId (US2)

**Acceptance criterion**: A Super Admin can create a doctor by
supplying a valid `categoryId`. Missing or invalid `categoryId`
is rejected.

### Steps

```bash
# 1. Get a category id (e.g. Cardiology)
CATEGORY_ID=$(curl -s -b cookies.txt http://localhost:3000/api/admin/categories | jq -r '.categories[] | select(.name=="Cardiology") | .id')

# 2. Create a doctor with that category
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Dr. Test\",\"categoryId\":\"${CATEGORY_ID}\"}" | jq
```

**Expected** (201):
```json
{
  "doctor": {
    "id": "clx_...",
    "name": "Dr. Test",
    "category": { "id": "<CATEGORY_ID>", "name": "Cardiology" },
    "status": "ACTIVE",
    ...
  }
}
```

### Negative: missing categoryId

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. NoCategory"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 400.

### Negative: non-existent categoryId

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Bogus","categoryId":"cat_does_not_exist"}' \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 404 (`Category not found`).

### Negative: DEACTIVATED category

```bash
# 1. Deactivate a category
DEACTIVATED_ID="<id of any seeded category>"
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/categories/${DEACTIVATED_ID}/deactivate" > /dev/null

# 2. Try to create a doctor with that category
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Dr. DeactivatedCat\",\"categoryId\":\"${DEACTIVATED_ID}\"}" \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 400 (`Cannot assign a doctor to a deactivated
category`).

**Pass / Fail**:
- ✅ Pass: First request 201 with nested `category`; missing
  → 400; bogus → 404; deactivated → 400.
- ❌ Fail: Any 2xx on a negative case; missing `category` in
  the response.

---

## Scenario 4: Admin updates a doctor's category (US3)

**Acceptance criterion**: A Super Admin can change a doctor's
category via `PATCH`.

### Steps

```bash
# 1. Pick two categories
CAT_A_ID="<Cardiology id>"
CAT_B_ID="<Pediatrics id>"

# 2. Create a doctor under CAT_A
DOCTOR_ID=$(curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Dr. Switchy\",\"categoryId\":\"${CAT_A_ID}\"}" | jq -r '.doctor.id')

# 3. Patch the doctor to CAT_B
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"categoryId\":\"${CAT_B_ID}\"}" | jq
```

**Expected** (200): Doctor record with
`category: { id: <CAT_B_ID>, name: "Pediatrics" }`.

### Negative: omit categoryId (preserves existing)

```bash
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}" \
  -H "Content-Type: application/json" \
  -d '{"bio":"updated bio"}' | jq
```

**Expected** (200): Doctor record with the new bio AND the
existing `category` (Pediatrics) preserved.

**Pass / Fail**:
- ✅ Pass: Patch changes the category; omitting the field
  preserves it.
- ❌ Fail: Category is reset to null/empty when omitted;
  unrelated fields are unexpectedly changed.

---

## Scenario 5: Patient filters the listing by categoryId (US4)

**Acceptance criterion**: `?categoryId=<id>` returns only
doctors in that category.

### Steps

```bash
CARDIOLOGY_ID="<Cardiology id>"

# Create 3 doctors under Cardiology
for i in 1 2 3; do
  curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Dr. Cardio ${i}\",\"categoryId\":\"${CARDIOLOGY_ID}\"}" > /dev/null
done

# Public listing filtered by category
curl -s "http://localhost:3000/api/doctors?categoryId=${CARDIOLOGY_ID}" | jq '.total'
```

**Expected**: `total` reflects the number of Cardiology
doctors (at least 3, plus any others created earlier).

### Negative: unknown categoryId

```bash
curl -s "http://localhost:3000/api/doctors?categoryId=cat_does_not_exist" | jq
```

**Expected** (200):
```json
{ "doctors": [], "total": 0, "page": 1, "pageSize": 20 }
```

### Negative: DEACTIVATED category (US4 + FR-014)

```bash
# Deactivate Cardiology
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/categories/${CARDIOLOGY_ID}/deactivate" > /dev/null

# Listing — should be empty because the category is DEACTIVATED
curl -s "http://localhost:3000/api/doctors?categoryId=${CARDIOLOGY_ID}" | jq '.total'
```

**Expected**: `0` (no doctors visible under a DEACTIVATED
category, even if the doctors themselves are ACTIVE).

**Pass / Fail**:
- ✅ Pass: Filter returns the right doctors; unknown id
  returns empty; deactivated category returns empty.
- ❌ Fail: Deactivated category's doctors still appear.

---

## Scenario 6: Patient browses the public categories dropdown (US5)

**Acceptance criterion**: `GET /api/categories` returns the
ACTIVE categories as `{ id, name }` records, sorted.

### Steps

```bash
curl -s http://localhost:3000/api/categories | jq
```

**Expected** (200):
```json
{
  "categories": [
    { "id": "...", "name": "Cardiology" },
    { "id": "...", "name": "Dermatology" },
    { "id": "...", "name": "General Practice" },
    { "id": "...", "name": "Neurology" },
    { "id": "...", "name": "Orthopedics" },
    { "id": "...", "name": "Pediatrics" }
  ]
}
```

Note: Cardiology is included only if it has not been
deactivated in the previous scenario. If it has, expect 5
entries (Cardiology excluded).

### Negative: old endpoint is gone

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/specialties
```

**Expected**: 404.

**Pass / Fail**:
- ✅ Pass: ACTIVE only, sorted, structured records; old
  endpoint 404.
- ❌ Fail: DEACTIVATED categories included; not sorted; old
  endpoint still returns 200.

---

## Scenario 7: Public doctor profile exposes the category (US6)

**Acceptance criterion**: The public profile includes a
`category: { id, name }` object.

### Steps

```bash
# Use a known doctor id (from scenario 3 or 4)
DOCTOR_ID="<paste-id>"

curl -s "http://localhost:3000/api/doctors/${DOCTOR_ID}" | jq
```

**Expected** (200):
```json
{
  "doctor": {
    "id": "...",
    "name": "Dr. ...",
    "category": { "id": "...", "name": "Cardiology" },
    "bio": "...",
    "imageUrl": "...",
    "status": "ACTIVE",
    ...
  }
}
```

### Negative: DEACTIVATED doctor → 404 (inherited from feature 004)

```bash
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}/deactivate" > /dev/null
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/doctors/${DOCTOR_ID}"
```

**Expected**: 404.

**Pass / Fail**:
- ✅ Pass: 200 with `category` object; deactivated doctor →
  404.
- ❌ Fail: Missing `category`; deactivated doctor → 200.

---

## Scenario 8: Admin cannot delete a category that is in use (US1, edge case)

**Acceptance criterion**: `DELETE /api/admin/categories/:id`
returns 409 if any doctor references the category.

### Steps

```bash
# 1. Create a doctor under the (reactivated) Cardiology category
curl -s -b cookies.txt -X PATCH "http://localhost:3000/api/admin/categories/${CARDIOLOGY_ID}" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}' > /dev/null  # only if previously deactivated

curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Dr. InUse\",\"categoryId\":\"${CARDIOLOGY_ID}\"}" > /dev/null

# 2. Attempt to delete Cardiology
curl -s -b cookies.txt -X DELETE "http://localhost:3000/api/admin/categories/${CARDIOLOGY_ID}" \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 409 with
`{"message":"Cannot delete a category that is still in use...","error":"category_in_use"}`.

### Positive: empty category can be deleted

```bash
# Create a throwaway category, delete it
NEW_ID=$(curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Throwaway"}' | jq -r '.category.id')

curl -s -b cookies.txt -X DELETE "http://localhost:3000/api/admin/categories/${NEW_ID}" \
  -w "\nHTTP %{http_code}\n"
```

**Expected**: 204.

**Pass / Fail**:
- ✅ Pass: 409 when in use; 204 when empty.
- ❌ Fail: 204 when in use (data loss); 404 when category
  exists but has no doctors.

---

## Scenario 9: Unauthenticated access to admin endpoints (FR-005, FR-008)

**Acceptance criterion**: Admin endpoints return 401/403
without an admin session.

### Steps

```bash
# No cookies
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/categories
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}'
```

**Expected**: 401 (no session) for both.

### Negative: authenticated non-admin (e.g. regular user)

```bash
# Sign in as a regular user
curl -s -c user-cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"..."}' > /dev/null

curl -s -b user-cookies.txt -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/categories
```

**Expected**: 403 (wrong role).

**Pass / Fail**:
- ✅ Pass: 401/403 for unauthenticated / non-admin; 200 only
  for admin.
- ❌ Fail: 200 for unauthenticated or non-admin.

---

## Scenario 10: Public categories endpoint is anonymous (FR-011)

**Acceptance criterion**: `GET /api/categories` works without
any authentication.

### Steps

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/categories
```

**Expected**: 200.

**Pass / Fail**:
- ✅ Pass: 200 without auth.
- ❌ Fail: 401 without auth.

---

## Test Suite (npm)

The integration tests cover all of the above scenarios
hermetically. Run them with:

```bash
npm run test:e2e -- --testPathPatterns=categories
```

Expected output:
```
PASS test/categories.e2e-spec.ts
  Doctor Categories (005-doctor-categories)
    ✓ Admin lists default categories (Scenario 1)
    ✓ Admin creates a new category (Scenario 2)
    ✓ Admin creates a doctor with a categoryId (Scenario 3)
    ✓ Admin updates a doctor's category (Scenario 4)
    ✓ Patient filters by categoryId (Scenario 5)
    ✓ Patient browses the public categories dropdown (Scenario 6)
    ✓ Public doctor profile exposes the category (Scenario 7)
    ✓ Admin cannot delete a category that is in use (Scenario 8)
    ✓ Unauthenticated access to admin endpoints (Scenario 9)
    ✓ Public categories endpoint is anonymous (Scenario 10)

Tests: 10 passed
```

The legacy `test/doctors-public.e2e-spec.ts` (from feature
004) is also updated:

- `?specialty=...` scenarios are removed (or rewritten to use
  `?categoryId=...`).
- The `specialties` endpoint scenario is removed (or rewritten
  to call `/api/categories`).
- The public response shape is updated to expect
  `category: { id, name }` instead of `specialty: "..."`.

Run both suites together:
```bash
npm run test:e2e
```

---

## Data Migration Validation (separate test)

A separate test (`test/categories-migration.e2e-spec.ts`,
gated on `RUN_MIGRATION_TESTS=1`) validates the data
migration. The test:

1. Starts from a database with the `doctor` table containing
   legacy `specialty` values (e.g. "Cardiology", "Pediatrics",
   "Cardiology", "").
2. Runs the migration.
3. Asserts:
   - The `category` table has rows for "Cardiology",
     "Pediatrics", and "General" (the fallback for the empty
     value).
   - Each doctor has a non-null `categoryId`.
   - The `specialty` column no longer exists on the `doctor`
     table.
   - The doctors' `categoryId` values match the expected
     `Category` rows.

Run with:
```bash
RUN_MIGRATION_TESTS=1 npm run test:e2e -- --testPathPatterns=categories-migration
```

This test is NOT part of the default CI pipeline (which uses
a fresh database and the migration runs against no data).
The migration's idempotency is the property under test; the
test ensures running it twice doesn't duplicate categories.

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
- API contracts: [`contracts/`](./contracts/)
  - [`admin-categories-api.md`](./contracts/admin-categories-api.md)
  - [`public-categories-api.md`](./contracts/public-categories-api.md)
- Upstream (admin doctor CRUD): [`../003-remove-doctor-role/contracts/admin-doctors-api.md`](../003-remove-doctor-role/contracts/admin-doctors-api.md)
- Upstream (public doctor CRUD): [`../004-doctor-search/contracts/doctor-search-api.md`](../004-doctor-search/contracts/doctor-search-api.md)
