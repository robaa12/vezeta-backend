# Data Model: Authentication System (Better Auth)

**Feature**: 001-better-auth-system
**Date**: 2026-07-11

## Overview

The data model consists of Better Auth's generated core tables (User, Session,
Account, Verification) plus one domain table (DoctorProfile). Better Auth manages
the core tables — they are generated via `npx auth generate` and must not be
manually edited. DoctorProfile is a custom model with a 1:1 relation to User.

## Entities

### User (Better Auth core)

Represents any platform participant. Managed by Better Auth.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| name | String | required | Full name |
| email | String | unique, required | Email address |
| emailVerified | Boolean | default: false | Email verification status |
| phoneNumber | String | unique, nullable | Phone number (added by phoneNumber plugin) |
| phoneNumberVerified | Boolean | nullable | Phone verification status (added by phoneNumber plugin) |
| role | String | default: "patient" | User role: "patient", "doctor", or "admin" |
| image | String | nullable | Profile photo URL |
| createdAt | DateTime | auto | Account creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Relationships**:
- 1:N → Session (user has many sessions)
- 1:N → Account (user has many auth accounts)
- 1:1 → DoctorProfile (user has at most one doctor profile)

**Validation rules**:
- Email must be unique across all users
- Phone number must be unique across all users (when present)
- Role must be one of: "patient", "doctor", "admin"
- Name must be non-empty

**State transitions**:
- emailVerified: false → true (after email OTP verification)
- phoneNumberVerified: null/false → true (after phone OTP verification)
- role: set at registration, never changes

---

### Session (Better Auth core)

Represents an authenticated user session. Managed by Better Auth.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| userId | String | FK → User.id, required | Session owner |
| token | String | unique, required | Session token (used in cookie) |
| expiresAt | DateTime | required | Session expiry timestamp |
| ipAddress | String | nullable | Client IP address |
| userAgent | String | nullable | Client user agent |
| createdAt | DateTime | auto | Session creation timestamp |
| updatedAt | DateTime | auto | Last activity timestamp |

**Relationships**:
- N:1 → User (session belongs to one user)

**Validation rules**:
- Token must be unique
- expiresAt must be in the future
- userId must reference an existing user

**State transitions**:
- Active: expiresAt > now()
- Expired: expiresAt <= now()
- Revoked: deleted from DB (on logout or password reset)

---

### Account (Better Auth core)

Represents an authentication provider account. For credential-based auth, stores
the hashed password.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| userId | String | FK → User.id, required | Account owner |
| accountId | String | required | Provider-specific account ID |
| providerId | String | required | Auth provider: "credential" for email/password |
| accessToken | String | nullable | OAuth access token (not used for credential) |
| refreshToken | String | nullable | OAuth refresh token (not used for credential) |
| accessTokenExpiresAt | DateTime | nullable | OAuth token expiry |
| refreshTokenExpiresAt | DateTime | nullable | OAuth token expiry |
| scope | String | nullable | OAuth scope |
| idToken | String | nullable | OAuth ID token |
| password | String | nullable | Hashed password (for credential provider) |
| createdAt | DateTime | auto | Account creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Relationships**:
- N:1 → User (account belongs to one user)

**Validation rules**:
- For credential provider: password must be non-null and hashed (scrypt)
- providerId must be "credential" for email/password auth
- userId must reference an existing user

**Notes**:
- Passwords are stored here, not in the User table
- Better Auth handles password hashing automatically (scrypt)

---

### Verification (Better Auth core)

Represents OTP codes for email/phone verification and password reset. Used by
emailOTP and phoneNumber plugins.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| identifier | String | required | Target identifier (email or phone number) |
| value | String | required | OTP code (hashed or encrypted) |
| expiresAt | DateTime | required | Code expiry timestamp |
| createdAt | DateTime | auto | Code creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Relationships**: None (standalone table)

**Validation rules**:
- identifier must be a valid email or phone number
- expiresAt must be in the future
- value must be the OTP code (managed by Better Auth)

**State transitions**:
- Active: expiresAt > now() and not yet consumed
- Expired: expiresAt <= now()
- Consumed: deleted from DB after successful verification

---

### DoctorProfile (custom)

Represents a doctor's platform standing and approval status. 1:1 with User.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| userId | String | FK → User.id, unique, required | Doctor's user account |
| status | String | required, default: "PENDING" | Approval status |
| approvedById | String | FK → User.id, nullable | Admin who approved/rejected |
| approvedAt | DateTime | nullable | When status was last changed |
| createdAt | DateTime | auto | Profile creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Relationships**:
- 1:1 → User (profile belongs to one user)
- N:1 → User (approvedBy, nullable)

**Validation rules**:
- userId must be unique (one profile per user)
- userId must reference a User with role = "doctor"
- status must be one of: "PENDING", "APPROVED", "REJECTED", "SUSPENDED"
- approvedById must reference a User with role = "admin" (when present)

**State transitions**:
- PENDING → APPROVED (by Super Admin)
- PENDING → REJECTED (by Super Admin)
- APPROVED → SUSPENDED (by Super Admin)
- SUSPENDED → APPROVED (by Super Admin, if re-approved)
- REJECTED → PENDING (if doctor re-applies, not in MVP scope)

**Notes**:
- Created automatically when a user registers as a doctor and completes verification
- Only doctors have this record — patients and admins do not
- Future features will add specialty, bio, clinic info, etc. to this table

---

## Entity Relationship Diagram

```
┌─────────────────┐
│      User       │
├─────────────────┤
│ id (PK)         │
│ name            │
│ email (unique)  │
│ emailVerified   │
│ phoneNumber     │
│ phoneNumberVer. │
│ role            │
│ createdAt       │
│ updatedAt       │
└────────┬────────┘
         │
         ├──────────────────┬──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Session      │ │    Account      │ │ DoctorProfile   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ id (PK)         │ │ id (PK)         │ │ id (PK)         │
│ userId (FK)     │ │ userId (FK)     │ │ userId (FK,uniq)│
│ token (unique)  │ │ accountId       │ │ status          │
│ expiresAt       │ │ providerId      │ │ approvedById    │
│ ipAddress       │ │ password        │ │ approvedAt      │
│ userAgent       │ │ ...             │ │ createdAt       │
│ createdAt       │ └─────────────────┘ │ updatedAt       │
│ updatedAt       │                     └─────────────────┘
└─────────────────┘

┌─────────────────┐
│  Verification   │
├─────────────────┤
│ id (PK)         │
│ identifier      │
│ value           │
│ expiresAt       │
│ createdAt       │
│ updatedAt       │
└─────────────────┘
```

---

## Enums

### Role (stored as String in User.role)

| Value | Description |
|-------|-------------|
| patient | Regular patient user |
| doctor | Doctor user (requires approval) |
| admin | Super Admin (seeded, not self-registered) |

### DoctorStatus (stored as String in DoctorProfile.status)

| Value | Description |
|-------|-------------|
| PENDING | Doctor registered and verified, awaiting admin review |
| APPROVED | Doctor approved by admin, can access doctor-only routes |
| REJECTED | Doctor rejected by admin, cannot access doctor-only routes |
| SUSPENDED | Previously approved doctor, suspended by admin |

---

## Migration Strategy

1. Initialize Prisma: `npx prisma init`
2. Generate Better Auth schema: `npx auth generate`
3. Add DoctorProfile model to `schema.prisma`
4. Create initial migration: `npx prisma migrate dev --name init`
5. Run seed script: `npx ts-node src/seed/seed.ts`

**Notes**:
- Better Auth tables are generated, not manually edited
- DoctorProfile is added manually after generation
- Future changes to Better Auth config require re-running `npx auth generate`
  (back up schema first)
