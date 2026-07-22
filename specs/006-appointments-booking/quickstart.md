# Quickstart: Appointments & Booking

**Feature**: 006-appointments-booking
**Date**: 2026-07-12

This document describes the runnable validation scenarios that
prove the booking loop works end-to-end. Each scenario is a
sequence of shell commands + expected outcomes. Refer to
[`data-model.md`](./data-model.md),
[`contracts/patient-appointments-api.md`](./contracts/patient-appointments-api.md),
and
[`contracts/admin-appointments-api.md`](./contracts/admin-appointments-api.md)
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
   `add_appointments` migration):
   ```bash
   npm run db:migrate
   ```

4. **Seed the Super Admin and the default categories**
   (idempotent):
   ```bash
   npm run db:seed
   ```

5. **API server running**:
   ```bash
   npm run start:dev
   ```

6. **An admin session cookie** (for the admin scenarios):
   ```bash
   curl -s -c cookies-admin.txt -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@vezeta.local","password":"ChangeMe123!"}' \
     > /dev/null
   ```

7. **A patient session cookie** (for the patient scenarios). Use
   `POST /api/auth/sign-up/email` then sign-in to create one:
   ```bash
   # Sign up
   curl -s -c cookies-patient.txt -X POST http://localhost:3000/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -d '{"email":"patient1@example.com","password":"Patient123!"}'
   # Sign in (creates a session cookie)
   curl -s -c cookies-patient.txt -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"patient1@example.com","password":"Patient123!"}'
   ```

---

## Scenario 1: Admin creates slots for a doctor

```bash
# List doctors to find an ACTIVE one
DOCTOR_ID=$(curl -s -b cookies-admin.txt \
  http://localhost:3000/api/admin/doctors?pageSize=1 | jq -r '.doctors[0].id')
echo "DOCTOR_ID=$DOCTOR_ID"

# Create 3 future slots
curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d '{
    "startsAt": "2026-08-01T09:00:00.000Z",
    "endsAt":   "2026-08-01T09:30:00.000Z"
  }' | jq
```

**Expected:** HTTP 201, response body contains the slot with
`status: "AVAILABLE"`, `doctorId` matching `$DOCTOR_ID`, and the
two timestamps.

```bash
# Reject past-time slot
curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d '{
    "startsAt": "2020-01-01T09:00:00.000Z",
    "endsAt":   "2020-01-01T09:30:00.000Z"
  }' -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 400.

```bash
# Reject endsAt <= startsAt
curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d '{
    "startsAt": "2026-08-01T09:30:00.000Z",
    "endsAt":   "2026-08-01T09:00:00.000Z"
  }' -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 400.

---

## Scenario 2: Public slot listing

```bash
# Public, anonymous
curl -s "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" | jq '.slots | length'
```

**Expected:** the count of AVAILABLE slots (3 if Scenario 1 was
just run). The response body is `{ slots: [...] }`.

```bash
# Cache-Control header
curl -sI "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" | grep -i cache-control
```

**Expected:** `Cache-Control: public, max-age=60`.

```bash
# Non-existent doctor
curl -s "http://localhost:3000/api/doctors/doctor_does_not_exist/slots" -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404.

---

## Scenario 3: Patient browses and books a slot

```bash
# Find an AVAILABLE slot
SLOT_ID=$(curl -s "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" | jq -r '.slots[0].id')
echo "SLOT_ID=$SLOT_ID"

# Patient books it
curl -s -b cookies-patient.txt -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d "{\"slotId\":\"$SLOT_ID\",\"patientNotes\":\"Annual checkup\"}" | jq
```

**Expected:** HTTP 201, response body contains `appointment.id`,
`status: "PENDING"`, and the nested `doctor` object.

```bash
# The slot is now BOOKED (no longer in the public listing)
curl -s "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" | jq -r '.slots[].id'
```

**Expected:** the booked `$SLOT_ID` is NOT in the output.

---

## Scenario 4: Concurrent booking — exactly one wins

```bash
# Use a fresh slot
SLOT_ID=$(curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d '{
    "startsAt": "2026-08-02T09:00:00.000Z",
    "endsAt":   "2026-08-02T09:30:00.000Z"
  }' | jq -r '.slot.id')

# Fire 10 simultaneous booking requests
for i in $(seq 1 10); do
  curl -s -b cookies-patient.txt -X POST http://localhost:3000/api/appointments \
    -H "Content-Type: application/json" \
    -d "{\"slotId\":\"$SLOT_ID\"}" \
    -o /dev/null -w "%{http_code}\n" &
done
wait | sort | uniq -c
```

**Expected:** exactly 1 request returns 201 and 9 return 409.
(The shell command above may need tweaking depending on the
local `bash` version — the principle is "10 concurrent
requests, exactly 1 wins".)

---

## Scenario 5: Admin confirms a PENDING appointment

```bash
APPT_ID=$(curl -s -b cookies-patient.txt \
  http://localhost:3000/api/appointments | jq -r '.appointments[0].id')

curl -s -b cookies-admin.txt -X PATCH \
  "http://localhost:3000/api/admin/appointments/$APPT_ID/confirm" | jq '.appointment.status'
```

**Expected:** `"CONFIRMED"`.

```bash
# Second confirm returns 409
curl -s -b cookies-admin.txt -X PATCH \
  "http://localhost:3000/api/admin/appointments/$APPT_ID/confirm" \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 409.

---

## Scenario 6: Patient lists their own appointments

```bash
curl -s -b cookies-patient.txt http://localhost:3000/api/appointments | jq
```

**Expected:** HTTP 200, response body contains the appointments
scoped to the patient (no other patient's bookings).

```bash
# Filter by status
curl -s -b cookies-patient.txt "http://localhost:3000/api/appointments?status=CONFIRMED" | jq '.appointments | length'
```

**Expected:** the count of CONFIRMED appointments for the
patient.

---

## Scenario 7: Patient cancels within 24 hours — rejected

```bash
# Create a slot starting in 1 hour
SLOT_ID=$(curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d "{
    \"startsAt\": \"$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"endsAt\":   \"$(date -u -d '+1 hour 30 min' +%Y-%m-%dT%H:%M:%S.000Z)\"
  }" | jq -r '.slot.id')

APPT_ID=$(curl -s -b cookies-patient.txt -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d "{\"slotId\":\"$SLOT_ID\"}" | jq -r '.appointment.id')

# Patient tries to cancel
curl -s -b cookies-patient.txt -X PATCH \
  "http://localhost:3000/api/appointments/$APPT_ID/cancel" \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 403 (within 24h cutoff).

---

## Scenario 8: Patient cancels > 24 hours ahead — succeeds

```bash
# Create a slot starting in 48 hours
SLOT_ID=$(curl -s -b cookies-admin.txt -X POST \
  "http://localhost:3000/api/admin/doctors/$DOCTOR_ID/slots" \
  -H "Content-Type: application/json" \
  -d "{
    \"startsAt\": \"$(date -u -d '+48 hours' +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"endsAt\":   \"$(date -u -d '+48 hours 30 min' +%Y-%m-%dT%H:%M:%S.000Z)\"
  }" | jq -r '.slot.id')

APPT_ID=$(curl -s -b cookies-patient.txt -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d "{\"slotId\":\"$SLOT_ID\"}" | jq -r '.appointment.id')

# Patient cancels
curl -s -b cookies-patient.txt -X PATCH \
  "http://localhost:3000/api/appointments/$APPT_ID/cancel" | jq
```

**Expected:** HTTP 200, response body contains
`status: "CANCELLED"`, `cancelledBy: "USER"`, `cancelledAt: <now>`.

```bash
# The slot is now AVAILABLE again
curl -s "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" | jq -r '.slots[].id' | grep -q "$SLOT_ID" && echo "available again" || echo "still booked (BUG)"
```

**Expected:** "available again".

---

## Scenario 9: Cross-patient privacy

```bash
# Patient B signs up + signs in
curl -s -c cookies-patient-b.txt -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"patient2@example.com","password":"Patient456!"}' > /dev/null
curl -s -c cookies-patient-b.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"patient2@example.com","password":"Patient456!"}' > /dev/null

# Patient B tries to view patient A's appointment
curl -s -b cookies-patient-b.txt \
  -X PATCH "http://localhost:3000/api/appointments/$APPT_ID/cancel" \
  -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404 (the appointment does not exist for
patient B, even though it does exist in the database).

---

## Scenario 10: Admin marks a past-time appointment as completed

```bash
# Create a slot in the past via direct DB (admin endpoint rejects past-time)
PAST_SLOT_ID=$(DATABASE_URL='postgresql://postgres:postgres@localhost:5432/vezeta_auth?schema=public' \
  npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const slot = await p.doctorSlot.create({ data: {
  doctorId: '$DOCTOR_ID', startsAt: new Date('2020-01-01T09:00:00Z'),
  endsAt: new Date('2020-01-01T09:30:00Z'), status: 'BOOKED',
}});
console.log(slot.id);
await p.\$disconnect();
")

# Manually create an appointment for the past slot
APPT_ID=$(DATABASE_URL='postgresql://postgres:postgres@localhost:5432/vezeta_auth?schema=public' \
  npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const user = await p.user.findFirst({ where: { email: 'patient1@example.com' } });
const appt = await p.appointment.create({ data: {
  userId: user.id, doctorId: '$DOCTOR_ID', slotId: '$PAST_SLOT_ID',
  scheduledAt: new Date('2020-01-01T09:00:00Z'), status: 'CONFIRMED',
}});
console.log(appt.id);
await p.\$disconnect();
")

# Admin marks complete
curl -s -b cookies-admin.txt -X PATCH \
  "http://localhost:3000/api/admin/appointments/$APPT_ID/complete" | jq '.appointment.status'
```

**Expected:** `"COMPLETED"`.

---

## Scenario 11: Deactivation cascade

```bash
# Deactivate a category
CAT_ID=$(curl -s -b cookies-admin.txt \
  http://localhost:3000/api/admin/categories | jq -r '.categories[0].id')

curl -s -b cookies-admin.txt -X PATCH \
  "http://localhost:3000/api/admin/categories/$CAT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"DEACTIVATED"}' | jq '.category.status'
```

```bash
# Public slot listing for a doctor in that category returns 404
curl -s "http://localhost:3000/api/doctors/$DOCTOR_ID/slots" -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 404 (consistent with feature 005's
deactivation cascade).

---

## Cleanup

After running the scenarios, you may want to clean up the test
data:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/vezeta_auth?schema=public' \
  npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const r1 = await p.appointment.deleteMany({});
const r2 = await p.doctorSlot.deleteMany({});
console.log('deleted', r1.count, 'appointments and', r2.count, 'slots');
await p.\$disconnect();
"
```
