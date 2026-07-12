# API Contracts: Authentication System (Better Auth)

**Feature**: 001-better-auth-system
**Date**: 2026-07-11

## Overview

This document defines the API endpoints for the authentication system. Endpoints
are grouped by concern: Better Auth managed routes (handled automatically by the
library), custom auth routes (our wrappers), and admin routes.

**Base URL**: `http://localhost:3000` (development)

**Authentication**: Session-based via HTTP-only cookies. Protected routes require
a valid session cookie. Admin routes require SUPER_ADMIN role.

---

## Better Auth Managed Routes

These endpoints are handled automatically by Better Auth and its plugins. No
custom controller code needed — the NestJS adapter routes these to Better Auth.

### Registration & Sign-In

#### POST /api/auth/sign-up/email

Register a new user with email and password.

**Request**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "patient"
}
```

**Response** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "role": "patient",
    "createdAt": "2026-07-11T10:00:00Z"
  },
  "token": "session-token..."
}
```

**Notes**:
- `role` must be "patient" or "doctor" (not "admin")
- Better Auth creates User + Account (with hashed password) records
- Session cookie is set automatically
- If role is "doctor", a DoctorProfile with status "PENDING" is created after
  both email and phone are verified (via database hook)

---

#### POST /api/auth/sign-in/email

Sign in with email and password.

**Request**:
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response** (200):
```json
{
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": true,
    "role": "doctor",
    "doctorProfile": {
      "status": "PENDING"
    }
  },
  "token": "session-token..."
}
```

**Notes**:
- Session cookie is set automatically
- For doctors, response includes `doctorProfile.status` so frontend can show
  "pending approval" message
- Login succeeds regardless of doctor approval status

---

#### POST /api/auth/sign-in/phone-number

Sign in with phone number and password.

**Request**:
```json
{
  "phoneNumber": "+201234567890",
  "password": "securePassword123"
}
```

**Response**: Same as `/sign-in/email`

---

#### POST /api/auth/sign-out

Sign out (destroy current session).

**Request**: No body (session identified by cookie)

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Session cookie is cleared
- Session is deleted from database

---

### Email Verification (emailOTP plugin)

#### POST /api/auth/email-otp/send-verification-otp

Send OTP code to email for verification.

**Request**:
```json
{
  "email": "john@example.com",
  "type": "email-verification"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- `type` can be "email-verification", "sign-in", or "forget-password"
- OTP is sent via email (callback configured in auth.ts)
- Default: 6-digit code, expires in 5 minutes

---

#### POST /api/auth/email-otp/verify-email

Verify email with OTP code.

**Request**:
```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Marks `emailVerified = true` on User record
- If user is a doctor and phone is also verified, DoctorProfile is created

---

### Phone Verification (phoneNumber plugin)

#### POST /api/auth/phone-number/send-otp

Send OTP code to phone number.

**Request**:
```json
{
  "phoneNumber": "+201234567890"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- OTP is sent via SMS (callback configured in auth.ts)
- Default: 6-digit code, expires in 5 minutes

---

#### POST /api/auth/phone-number/verify

Verify phone number with OTP code.

**Request**:
```json
{
  "phoneNumber": "+201234567890",
  "code": "123456"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Marks `phoneNumberVerified = true` on User record
- If user is a doctor and email is also verified, DoctorProfile is created

---

### Password Reset

#### POST /api/auth/email-otp/request-password-reset

Request password reset via email OTP.

**Request**:
```json
{
  "email": "john@example.com"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- OTP is sent via email
- Does not reveal whether email exists (security)

---

#### POST /api/auth/email-otp/reset-password

Reset password with email OTP.

**Request**:
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "password": "newSecurePassword456"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Updates password in Account table
- All existing sessions are revoked (if `revokeSessionsOnPasswordReset: true`)

---

#### POST /api/auth/phone-number/request-password-reset

Request password reset via phone OTP.

**Request**:
```json
{
  "phoneNumber": "+201234567890"
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

#### POST /api/auth/phone-number/reset-password

Reset password with phone OTP.

**Request**:
```json
{
  "phoneNumber": "+201234567890",
  "code": "123456",
  "newPassword": "newSecurePassword456"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Updates password in Account table
- All existing sessions are revoked

---

## Custom Auth Routes

These endpoints are implemented in our `AuthController` and wrap Better Auth's
API for custom logic.

### GET /api/auth/me

Get current authenticated user's profile ("who am I").

**Authentication**: Required (session cookie)

**Response** (200):
```json
{
  "id": "clx...",
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "+201234567890",
  "role": "doctor",
  "emailVerified": true,
  "phoneNumberVerified": true,
  "doctorProfile": {
    "status": "PENDING"
  },
  "createdAt": "2026-07-11T10:00:00Z"
}
```

**Notes**:
- Returns user profile from session
- If user is a doctor, includes `doctorProfile.status`
- If user is not a doctor, `doctorProfile` is null/absent

**Error responses**:
- 401: No session or session expired

---

## Admin Routes

These endpoints are implemented in `AdminController` and require SUPER_ADMIN role.

### GET /api/admin/doctors

List doctors filtered by approval status.

**Authentication**: Required (session cookie)
**Authorization**: SUPER_ADMIN role

**Query parameters**:
- `status` (optional): Filter by status ("PENDING", "APPROVED", "REJECTED", "SUSPENDED")

**Response** (200):
```json
{
  "doctors": [
    {
      "id": "clx...",
      "userId": "cly...",
      "status": "PENDING",
      "user": {
        "id": "cly...",
        "name": "Dr. Smith",
        "email": "smith@example.com",
        "phoneNumber": "+201234567890"
      },
      "createdAt": "2026-07-11T10:00:00Z"
    }
  ],
  "total": 5
}
```

**Error responses**:
- 401: No session or session expired
- 403: Not a Super Admin

---

### PATCH /api/admin/doctors/:id/approve

Approve a pending doctor.

**Authentication**: Required (session cookie)
**Authorization**: SUPER_ADMIN role

**Path parameters**:
- `id`: DoctorProfile ID

**Response** (200):
```json
{
  "success": true,
  "doctor": {
    "id": "clx...",
    "status": "APPROVED",
    "approvedById": "clz...",
    "approvedAt": "2026-07-11T12:00:00Z"
  }
}
```

**Notes**:
- Sets `status = "APPROVED"`, `approvedById = current admin`, `approvedAt = now()`
- Doctor can now access doctor-only routes

**Error responses**:
- 401: No session or session expired
- 403: Not a Super Admin
- 404: DoctorProfile not found

---

### PATCH /api/admin/doctors/:id/reject

Reject a pending doctor.

**Authentication**: Required (session cookie)
**Authorization**: SUPER_ADMIN role

**Path parameters**:
- `id`: DoctorProfile ID

**Response** (200):
```json
{
  "success": true,
  "doctor": {
    "id": "clx...",
    "status": "REJECTED",
    "approvedById": "clz...",
    "approvedAt": "2026-07-11T12:00:00Z"
  }
}
```

**Error responses**:
- 401: No session or session expired
- 403: Not a Super Admin
- 404: DoctorProfile not found

---

### PATCH /api/admin/doctors/:id/suspend

Suspend a previously approved doctor.

**Authentication**: Required (session cookie)
**Authorization**: SUPER_ADMIN role

**Path parameters**:
- `id`: DoctorProfile ID

**Response** (200):
```json
{
  "success": true,
  "doctor": {
    "id": "clx...",
    "status": "SUSPENDED",
    "approvedById": "clz...",
    "approvedAt": "2026-07-11T12:00:00Z"
  }
}
```

**Notes**:
- Doctor loses access to doctor-only routes immediately
- Existing sessions remain valid for non-doctor routes (if applicable)

**Error responses**:
- 401: No session or session expired
- 403: Not a Super Admin
- 404: DoctorProfile not found

---

### PATCH /api/admin/users/:id/deactivate

Deactivate any user account.

**Authentication**: Required (session cookie)
**Authorization**: SUPER_ADMIN role

**Path parameters**:
- `id`: User ID

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com",
    "isActive": false
  }
}
```

**Notes**:
- Sets a flag on User record (e.g., `isActive = false` or similar)
- Deactivated users cannot log in
- Does not delete the user record

**Error responses**:
- 401: No session or session expired
- 403: Not a Super Admin
- 404: User not found

---

## Error Response Format

All error responses follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Invalid email or password",
  "error": "Bad Request"
}
```

**Common status codes**:
- 400: Bad Request (validation error, invalid input)
- 401: Unauthorized (no session, session expired, invalid credentials)
- 403: Forbidden (insufficient permissions, doctor not approved)
- 404: Not Found (resource does not exist)
- 409: Conflict (email or phone already registered)
- 500: Internal Server Error

---

## Authentication Flow Summary

### Patient Registration Flow

1. `POST /api/auth/sign-up/email` → create account
2. `POST /api/auth/email-otp/send-verification-otp` → send email OTP
3. `POST /api/auth/email-otp/verify-email` → verify email
4. `POST /api/auth/phone-number/send-otp` → send phone OTP
5. `POST /api/auth/phone-number/verify` → verify phone
6. `GET /api/auth/me` → confirm fully verified

### Doctor Registration Flow

1. `POST /api/auth/sign-up/email` (role: "doctor") → create account
2. `POST /api/auth/email-otp/send-verification-otp` → send email OTP
3. `POST /api/auth/email-otp/verify-email` → verify email
4. `POST /api/auth/phone-number/send-otp` → send phone OTP
5. `POST /api/auth/phone-number/verify` → verify phone → DoctorProfile created (PENDING)
6. `POST /api/auth/sign-out` → sign out
7. `POST /api/auth/sign-in/email` → sign in → response includes `doctorProfile.status: "PENDING"`
8. `GET /api/auth/me` → confirm pending approval
9. (Wait for admin approval)
10. `GET /api/auth/me` → confirm `doctorProfile.status: "APPROVED"`

### Admin Approval Flow

1. `POST /api/auth/sign-in/email` (as Super Admin)
2. `GET /api/admin/doctors?status=PENDING` → list pending doctors
3. `PATCH /api/admin/doctors/:id/approve` → approve doctor
4. Doctor can now access doctor-only routes
