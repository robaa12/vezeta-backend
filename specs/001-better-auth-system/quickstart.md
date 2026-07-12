# Quickstart: Authentication System Validation

**Feature**: 001-better-auth-system
**Date**: 2026-07-11

## Overview

This guide provides runnable validation scenarios to prove the authentication
system works end-to-end. Each scenario can be executed manually via HTTP
requests (curl, Postman, or similar) after the system is implemented.

**Prerequisites**:
- PostgreSQL database running
- Environment variables configured (`.env` file)
- Dependencies installed (`npm install`)
- Database migrated (`npx prisma migrate dev`)
- Super Admin seeded (`npx ts-node src/seed/seed.ts`)
- Application running (`npm run start:dev`)

---

## Scenario 1: Patient Registration & Verification

**Goal**: Verify a patient can register, verify both email and phone, and log in.

### Steps

1. **Register a new patient**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Patient",
       "email": "patient@test.com",
       "password": "password123",
       "role": "patient"
     }'
   ```
   **Expected**: 200 OK, user object returned, session cookie set.

2. **Send email verification OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/email-otp/send-verification-otp \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "type": "email-verification"
     }'
   ```
   **Expected**: 200 OK, OTP sent to email (check logs or email service).

3. **Verify email with OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/email-otp/verify-email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "otp": "123456"
     }'
   ```
   **Expected**: 200 OK, email marked as verified.

4. **Send phone verification OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/phone-number/send-otp \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+201234567890"
     }'
   ```
   **Expected**: 200 OK, OTP sent to phone (check logs or SMS service).

5. **Verify phone with OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/phone-number/verify \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+201234567890",
       "code": "123456"
     }'
   ```
   **Expected**: 200 OK, phone marked as verified.

6. **Access protected "who am I" endpoint**:
   ```bash
   curl http://localhost:3000/api/auth/me \
     -H "Cookie: <session-cookie-from-step-1>"
   ```
   **Expected**: 200 OK, user profile returned with `emailVerified: true`,
   `phoneNumberVerified: true`, `role: "patient"`.

### Validation Checklist

- [ ] Patient account created successfully
- [ ] Email OTP sent and verified
- [ ] Phone OTP sent and verified
- [ ] Protected route accessible after verification
- [ ] User profile shows both verifications complete

---

## Scenario 2: Doctor Registration & Approval Gate

**Goal**: Verify a doctor can register, verify both channels, but is blocked from
doctor-only routes until approved by a Super Admin.

### Steps

1. **Register a new doctor**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Dr. Test",
       "email": "doctor@test.com",
       "password": "password123",
       "role": "doctor"
     }'
   ```
   **Expected**: 200 OK, user created with `role: "doctor"`.

2. **Verify email and phone** (same as Scenario 1, steps 2-5):
   - Send email OTP → verify email
   - Send phone OTP → verify phone
   **Expected**: Both verified, DoctorProfile created with `status: "PENDING"`.

3. **Sign out**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-out \
     -H "Cookie: <session-cookie>"
   ```
   **Expected**: 200 OK, session destroyed.

4. **Sign in as doctor**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "doctor@test.com",
       "password": "password123"
     }'
   ```
   **Expected**: 200 OK, response includes `doctorProfile.status: "PENDING"`.

5. **Attempt to access doctor-only route** (e.g., a test endpoint):
   ```bash
   curl http://localhost:3000/api/doctors/test-route \
     -H "Cookie: <session-cookie-from-step-4>"
   ```
   **Expected**: 403 Forbidden, error message indicates "pending approval".

6. **Check "who am I" endpoint**:
   ```bash
   curl http://localhost:3000/api/auth/me \
     -H "Cookie: <session-cookie-from-step-4>"
   ```
   **Expected**: 200 OK, profile shows `doctorProfile.status: "PENDING"`.

### Validation Checklist

- [ ] Doctor account created and verified
- [ ] DoctorProfile created with PENDING status
- [ ] Login succeeds and shows pending status
- [ ] Doctor-only routes blocked with clear error
- [ ] "Who am I" endpoint shows pending approval

---

## Scenario 3: Admin Doctor Approval

**Goal**: Verify a Super Admin can list, approve, and manage doctors.

### Prerequisites

- Super Admin seeded (run `npx ts-node src/seed/seed.ts`)
- Doctor registered and verified (Scenario 2, steps 1-2)

### Steps

1. **Sign in as Super Admin**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@test.com",
       "password": "adminPassword123"
     }'
   ```
   **Expected**: 200 OK, session created for admin.

2. **List pending doctors**:
   ```bash
   curl "http://localhost:3000/api/admin/doctors?status=PENDING" \
     -H "Cookie: <admin-session-cookie>"
   ```
   **Expected**: 200 OK, list includes the doctor from Scenario 2.

3. **Approve the doctor**:
   ```bash
   curl -X PATCH http://localhost:3000/api/admin/doctors/<doctor-profile-id>/approve \
     -H "Cookie: <admin-session-cookie>"
   ```
   **Expected**: 200 OK, doctor status changed to "APPROVED".

4. **Verify doctor can now access doctor-only routes**:
   - Sign in as doctor again (step 4 from Scenario 2)
   - Attempt to access doctor-only route
   **Expected**: 200 OK, route accessible.

5. **Suspend the doctor**:
   ```bash
   curl -X PATCH http://localhost:3000/api/admin/doctors/<doctor-profile-id>/suspend \
     -H "Cookie: <admin-session-cookie>"
   ```
   **Expected**: 200 OK, doctor status changed to "SUSPENDED".

6. **Verify doctor is blocked again**:
   - Attempt to access doctor-only route
   **Expected**: 403 Forbidden.

### Validation Checklist

- [ ] Super Admin can sign in
- [ ] Admin can list pending doctors
- [ ] Admin can approve a doctor
- [ ] Approved doctor can access doctor-only routes
- [ ] Admin can suspend a doctor
- [ ] Suspended doctor is blocked from doctor-only routes

---

## Scenario 4: Password Reset (Email)

**Goal**: Verify a user can reset their password via email OTP.

### Steps

1. **Request password reset**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/email-otp/request-password-reset \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com"
     }'
   ```
   **Expected**: 200 OK, OTP sent to email.

2. **Reset password with OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/email-otp/reset-password \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "otp": "123456",
       "password": "newPassword456"
     }'
   ```
   **Expected**: 200 OK, password updated, all sessions revoked.

3. **Attempt to log in with old password**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "password": "password123"
     }'
   ```
   **Expected**: 401 Unauthorized.

4. **Log in with new password**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "password": "newPassword456"
     }'
   ```
   **Expected**: 200 OK, login succeeds.

### Validation Checklist

- [ ] Password reset OTP sent via email
- [ ] Password updated successfully
- [ ] Old password no longer works
- [ ] New password works
- [ ] All previous sessions invalidated

---

## Scenario 5: Password Reset (Phone)

**Goal**: Verify a user can reset their password via phone OTP.

### Steps

1. **Request password reset via phone**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/phone-number/request-password-reset \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+201234567890"
     }'
   ```
   **Expected**: 200 OK, OTP sent to phone.

2. **Reset password with phone OTP**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/phone-number/reset-password \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+201234567890",
       "code": "123456",
       "newPassword": "anotherPassword789"
     }'
   ```
   **Expected**: 200 OK, password updated.

3. **Log in with new password**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/phone-number \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+201234567890",
       "password": "anotherPassword789"
     }'
   ```
   **Expected**: 200 OK, login succeeds.

### Validation Checklist

- [ ] Password reset OTP sent via phone
- [ ] Password updated successfully
- [ ] New password works for phone-based login

---

## Scenario 6: Super Admin Seeding

**Goal**: Verify the seed script creates a Super Admin idempotently.

### Steps

1. **Run seed script**:
   ```bash
   npx ts-node src/seed/seed.ts
   ```
   **Expected**: Super Admin created, credentials logged.

2. **Run seed script again**:
   ```bash
   npx ts-node src/seed/seed.ts
   ```
   **Expected**: No duplicate created, message indicates admin already exists.

3. **Log in as Super Admin**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "<seed-admin-email>",
       "password": "<seed-admin-password>"
     }'
   ```
   **Expected**: 200 OK, login succeeds, user has `role: "admin"`.

4. **Access admin endpoint**:
   ```bash
   curl http://localhost:3000/api/admin/doctors \
     -H "Cookie: <admin-session-cookie>"
   ```
   **Expected**: 200 OK, admin can access admin routes.

### Validation Checklist

- [ ] Seed script creates Super Admin
- [ ] Seed script is idempotent (no duplicates)
- [ ] Super Admin can log in
- [ ] Super Admin can access admin endpoints

---

## Edge Case: Duplicate Email/Phone Registration

**Goal**: Verify the system rejects duplicate email or phone registration.

### Steps

1. **Register with existing email**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Duplicate User",
       "email": "patient@test.com",
       "password": "password123",
       "role": "patient"
     }'
   ```
   **Expected**: 409 Conflict, error message indicates email already registered.

2. **Register with existing phone**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Duplicate User",
       "email": "newuser@test.com",
       "password": "password123",
       "role": "patient",
       "phoneNumber": "+201234567890"
     }'
   ```
   **Expected**: 409 Conflict, error message indicates phone already registered.

### Validation Checklist

- [ ] Duplicate email rejected with clear error
- [ ] Duplicate phone rejected with clear error

---

## Edge Case: Deactivated User Login

**Goal**: Verify deactivated users cannot log in.

### Steps

1. **Deactivate a user** (as Super Admin):
   ```bash
   curl -X PATCH http://localhost:3000/api/admin/users/<user-id>/deactivate \
     -H "Cookie: <admin-session-cookie>"
   ```
   **Expected**: 200 OK, user deactivated.

2. **Attempt to log in as deactivated user**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "patient@test.com",
       "password": "newPassword456"
     }'
   ```
   **Expected**: 401 Unauthorized, error message indicates account deactivated.

### Validation Checklist

- [ ] Deactivated user cannot log in
- [ ] Clear error message returned

---

## Running Automated Tests

After implementation, automated tests can validate these scenarios:

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- auth.e2e-spec.ts
```

**Test files**:
- `test/auth.e2e-spec.ts` — Scenarios 1, 2, 4, 5, edge cases
- `test/admin.e2e-spec.ts` — Scenario 3, Scenario 6

---

## Troubleshooting

### OTP not received

- Check email/SMS service configuration in `src/auth/auth.ts`
- Check application logs for OTP codes (development mode)
- Verify email/phone format is correct

### Session cookie not set

- Ensure `bodyParser: false` is set in `NestFactory.create()`
- Check CORS configuration if testing from different origin
- Verify Better Auth `baseURL` matches the request origin

### Doctor approval gate not working

- Verify DoctorProfile is created after both verifications
- Check DoctorApprovedGuard is applied to doctor-only routes
- Verify guard checks `DoctorProfile.status === "APPROVED"`

### Super Admin cannot access admin routes

- Verify seed script ran successfully
- Check user has `role: "admin"` in database
- Verify admin routes use `@Roles(["admin"])` decorator
