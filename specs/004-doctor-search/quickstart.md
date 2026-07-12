# Quickstart: Doctor Search & Discovery (Module 2)

**Feature**: 004-doctor-search
**Date**: 2026-07-12

This document describes the runnable validation scenarios that
prove the doctor search & discovery feature works end-to-end.
Each scenario is a sequence of shell commands + expected
outcomes. Refer to
[`data-model.md`](./data-model.md) and
[`contracts/doctor-search-api.md`](./contracts/doctor-search-api.md)
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

3. **Migrations applied** (includes the 003 migration that
   created the `Doctor` table):
   ```bash
   npm run db:migrate
   ```

4. **Seed the Super Admin** (idempotent):
   ```bash
   npm run db:seed
   ```

5. **API server running**:
   ```bash
   npm run start:dev
   ```

6. **At least one ACTIVE doctor in the catalog**: Use the
   admin endpoints (feature 003) or insert directly via
   Prisma Studio. For the scenarios below, the test data
   should include:
   - 3 Cardiologists
   - 2 Pediatricians
   - 1 Dermatologist
   - 1 DEACTIVATED Cardiologist (for the 404 test)

---

## Scenario 1: List doctors with no filter (US1)

**Acceptance criterion**: An anonymous visitor can list all
ACTIVE doctors without authentication.

### Steps

```bash
# No auth header — should still work
curl -s http://localhost:3000/api/doctors | jq
```

**Expected** (200):
```json
{
  "doctors": [
    { "id": "...", "name": "Dr. ...", "specialty": "...", "status": "ACTIVE", ... },
    ...
  ],
  "total": 6,
  "page": 1,
  "pageSize": 20
}
```

**Pass / Fail**:
- ✅ Pass: 6 doctors (3 Cardio + 2 Pediatrics + 1 Derma),
  none of them the DEACTIVATED one.
- ❌ Fail: DEACTIVATED doctor appears; or auth is required;
  or pagination fields are missing.

---

## Scenario 2: Filter by specialty (US2)

**Acceptance criterion**: `?specialty=Cardiology` returns
exactly the 3 Cardiologists.

### Steps

```bash
curl -s "http://localhost:3000/api/doctors?specialty=Cardiology" | jq
```

**Expected** (200):
```json
{
  "doctors": [ /* 3 Cardiologists */ ],
  "total": 3,
  "page": 1,
  "pageSize": 20
}
```

### Negative: unmatched specialty

```bash
curl -s "http://localhost:3000/api/doctors?specialty=Neurology" | jq
```

**Expected** (200):
```json
{
  "doctors": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

**Pass / Fail**:
- ✅ Pass: 3 Cardio doctors only, no Pediatrics or Derma.
- ❌ Fail: Other specialties leak through.

---

## Scenario 3: Search by name (US3)

**Acceptance criterion**: `?search=Smith` returns doctors
whose name contains "Smith" (case-insensitive).

### Steps

```bash
# Pre-populate: ensure at least 2 doctors have "Smith" in their name
# e.g. "Dr. Jane Smith" (Cardiology) and "Dr. John Smith" (Pediatrics)
curl -s "http://localhost:3000/api/doctors?search=Smith" | jq
```

**Expected** (200):
```json
{
  "doctors": [ /* both Smiths */ ],
  "total": 2,
  "page": 1,
  "pageSize": 20
}
```

### Specialty-as-search

```bash
# Search for "Cardio" should match "Cardiology" doctors
curl -s "http://localhost:3000/api/doctors?search=Cardio" | jq
```

**Expected** (200): 3 doctors (all Cardiologists).

**Pass / Fail**:
- ✅ Pass: Both Smiths included; case-insensitive (also
  matches "smith", "SMITH"); the `search=Cardio` query
  matches all 3 Cardiologists.
- ❌ Fail: Case sensitivity breaks the search; specialty
  substring doesn't match.

---

## Scenario 4: Combined filters (US3 + US2)

**Acceptance criterion**: `?specialty=Cardiology&search=Jane`
returns only Cardiologists whose name contains "Jane".

### Steps

```bash
# Pre-populate: "Dr. Jane Smith" (Cardio), "Dr. John Smith" (Cardio),
# "Dr. Jane Doe" (Pediatrics)
curl -s "http://localhost:3000/api/doctors?specialty=Cardiology&search=Jane" | jq
```

**Expected** (200): 1 doctor ("Dr. Jane Smith" — the
Cardiologist named Jane). "Dr. Jane Doe" is excluded because
she's a Pediatrician, not a Cardiologist.

**Pass / Fail**:
- ✅ Pass: 1 doctor, exactly the Cardio-Jane intersection.
- ❌ Fail: Specialty OR search applied instead of AND.

---

## Scenario 5: Public profile — ACTIVE doctor (US4)

**Acceptance criterion**: A known ACTIVE doctor id returns
200 with the full public record.

### Steps

```bash
DOCTOR_ID="<paste-id-from-scenario-1>"
curl -s "http://localhost:3000/api/doctors/${DOCTOR_ID}" | jq
```

**Expected** (200):
```json
{
  "doctor": {
    "id": "...",
    "name": "...",
    "specialty": "...",
    "bio": "...",
    "imageUrl": "...",
    "status": "ACTIVE",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Pass / Fail**:
- ✅ Pass: 200 with full record, `status: "ACTIVE"`.
- ❌ Fail: 404 returned for a known active doctor; or the
  `doctor` key is missing.

---

## Scenario 6: Public profile — DEACTIVATED doctor returns 404 (US4)

**Acceptance criterion**: A DEACTIVATED doctor id returns 404
(indistinguishable from non-existent).

### Steps

```bash
# 1. As admin, deactivate a doctor:
DEACTIVATED_ID="<paste-id-of-deactivated-doctor>"
# Confirm via the admin endpoint that the doctor is DEACTIVATED:
curl -s -b cookies.txt "http://localhost:3000/api/admin/doctors/${DEACTIVATED_ID}" | jq '.doctor.status'

# 2. Hit the public profile (no auth):
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/doctors/${DEACTIVATED_ID}"
```

**Expected**: 404.

**Pass / Fail**:
- ✅ Pass: 404 — the deactivated doctor is not visible to the
  public.
- ❌ Fail: 200 (the doctor is still exposed); or 410 (which
  would leak that the id used to exist).

---

## Scenario 7: Specialties endpoint (US5)

**Acceptance criterion**: The specialties endpoint returns
the distinct list of specialties from ACTIVE doctors, sorted
alphabetically.

### Steps

```bash
curl -s http://localhost:3000/api/specialties | jq
```

**Expected** (200):
```json
{
  "specialties": [
    "Cardiology",
    "Dermatology",
    "Pediatrics"
  ]
}
```

**Pass / Fail**:
- ✅ Pass: 3 distinct specialties, alphabetically sorted.
  The DEACTIVATED doctor's specialty is excluded only if all
  doctors with that specialty are deactivated.
- ❌ Fail: Duplicates; unsorted; includes a specialty whose
  only doctors are deactivated.

---

## Scenario 8: Pagination (US1)

**Acceptance criterion**: `pageSize=2` returns 2 doctors, and
the response includes correct `total`, `page`, and `pageSize`.

### Steps

```bash
curl -s "http://localhost:3000/api/doctors?page=1&pageSize=2" | jq
```

**Expected** (200):
```json
{
  "doctors": [ /* 2 doctors */ ],
  "total": 6,
  "page": 1,
  "pageSize": 2
}
```

### Page 2

```bash
curl -s "http://localhost:3000/api/doctors?page=2&pageSize=2" | jq
```

**Expected** (200): 2 different doctors (the next 2 in the
newest-first order). `page: 2`, `pageSize: 2`.

**Pass / Fail**:
- ✅ Pass: Correct slicing, correct metadata.
- ❌ Fail: Page 2 returns the same as page 1; or `total` is
  inconsistent across pages.

---

## Scenario 9: Cache freshness after admin action (US6)

**Acceptance criterion**: A newly created doctor appears in
the listing within 5 seconds; a newly deactivated doctor
disappears within 5 seconds.

### Steps (create)

```bash
# 1. As admin, create a new doctor:
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/doctors \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Cache Test","specialty":"TestCache"}' | jq '.doctor.id'

# 2. Immediately hit the public listing (no cache busting — rely on the 5s target):
sleep 1
curl -s "http://localhost:3000/api/doctors?specialty=TestCache" | jq '.total'
```

**Expected**: `total: 1` within 5 seconds.

### Steps (deactivate)

```bash
# 1. As admin, deactivate a doctor:
curl -s -b cookies.txt -X PATCH \
  "http://localhost:3000/api/admin/doctors/${DOCTOR_ID}/deactivate" > /dev/null

# 2. Immediately hit the public profile:
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/doctors/${DOCTOR_ID}"
```

**Expected**: 404 within 5 seconds.

**Pass / Fail**:
- ✅ Pass: 5-second freshness target met.
- ❌ Fail: A cached response hides the change for more than 5
  seconds; or the public profile still returns 200 for a
  deactivated doctor.

---

## Scenario 10: Validation — invalid query params (FR-009/011/012)

**Acceptance criterion**: Invalid query parameters return 400,
not 500.

### Steps

```bash
# page < 1
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/doctors?page=0"

# pageSize > 100
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/doctors?pageSize=101"

# search > 120 chars
LONG=$(printf 'a%.0s' {1..121})
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/doctors?search=${LONG}"

# specialty > 100 chars
LONG=$(printf 'a%.0s' {1..101})
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/doctors?specialty=${LONG}"
```

**Expected**: All return 400.

**Pass / Fail**:
- ✅ Pass: 400 for every invalid input.
- ❌ Fail: 500 (server error) for any of the above.

---

## Scenario 11: No auth required (FR-009)

**Acceptance criterion**: All three endpoints work without any
authentication header.

### Steps

```bash
# List — no cookie, no Authorization header
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/doctors

# Profile
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/doctors/${DOCTOR_ID}

# Specialties
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/specialties
```

**Expected**: All return 200 (or 404 for the profile if the id
is unknown / deactivated).

**Pass / Fail**:
- ✅ Pass: 200/404 without auth.
- ❌ Fail: 401 returned for any of the three.

---

## Test Suite (npm)

The integration tests cover all of the above scenarios
hermetically. Run them with:

```bash
npm run test:e2e -- --testPathPatterns=doctors-public
```

Expected output:
```
PASS test/doctors-public.e2e-spec.ts
  Doctor Search & Discovery (004-doctor-search)
    ✓ List doctors with no filter (Scenario 1)
    ✓ Filter by specialty (Scenario 2)
    ✓ Search by name (Scenario 3)
    ✓ Combined filters (Scenario 4)
    ✓ Public profile — ACTIVE doctor (Scenario 5)
    ✓ Public profile — DEACTIVATED returns 404 (Scenario 6)
    ✓ Specialties endpoint (Scenario 7)
    ✓ Pagination (Scenario 8)
    ✓ Cache freshness after admin action (Scenario 9)
    ✓ Validation — invalid query params (Scenario 10)
    ✓ No auth required (Scenario 11)

Tests: 11 passed
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
- API contracts: [`contracts/doctor-search-api.md`](./contracts/doctor-search-api.md)
- Upstream (admin doctor CRUD): [`../003-remove-doctor-role/contracts/admin-doctors-api.md`](../003-remove-doctor-role/contracts/admin-doctors-api.md)
