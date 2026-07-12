# Data Model: Simplify Auth Model (Remove Doctor Role)

**Feature**: 003-remove-doctor-role
**Date**: 2026-07-11
**Upstream**: 001-better-auth-system, 002-social-oauth-login

## Overview

This feature is a **schema and code amendment** to the auth model
established in feature 001 and extended in feature 002. It:
- Reduces the `User.role` column's allowed values from
  `{patient, doctor, admin}` to `{user, admin}`.
- Drops the `DoctorProfile` table (which was 1:1 with `User`) and
  introduces a new standalone `Doctor` table.
- Removes the `DoctorApprovedGuard` and the doctor verification flow.
- Adds a role-change endpoint with a last-admin guard.

A new Prisma migration is required. **Data migration of existing rows
is out of scope** per the spec and is the operator's responsibility.

## Entities

### User (Better Auth core, modified)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| name | String | required | Full name |
| email | String | unique, required | Email address |
| emailVerified | Boolean | default: false | Email verification status |
| phoneNumber | String? | unique, nullable | Phone number (added by phoneNumber plugin) |
| phoneNumberVerified | Boolean | nullable | Phone verification status (added by phoneNumber plugin) |
| **role** | String | **default: "user"** | **Reduced enum: only `"user"` or `"admin"`** |
| isActive | Boolean | default: true | Account active flag |
| image | String? | nullable | Profile photo URL |
| createdAt | DateTime | auto | Account creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Changes from feature 001**:
- `role` default value changes from `"patient"` to `"user"`.
- The role string is still a free-form column at the Prisma level
  (no Postgres ENUM type), but the **application layer** rejects any
  value other than `"user"` or `"admin"` via the
  `databaseHooks.user.create.before` callback in `src/auth/auth.ts`
  (and a new server-side check on the `PATCH /api/admin/users/:id/role`
  endpoint).
- The `User.doctorProfile` and `User.approvedDoctors` relations are
  **removed** (the `DoctorProfile` model no longer exists).

**New validation rules**:
- Self-registration: `role` field on the request body is ignored. If
  the submitted value is anything other than `"user"` (or omitted), the
  application coerces omitted → `"user"` and rejects any other value
  with 400 (per the spec assumption).
- Role change endpoint: accepts only `"user"` or `"admin"`. Any other
  value → 400.
- Last-admin guard: rejecting a `role` change to `"user"` if it would
  leave the system with zero active admins (`role = "admin"` AND
  `isActive = true`).

**State transitions**:
- `role`: `"user"` → `"admin"` (promotion; always allowed)
- `role`: `"admin"` → `"user"` (demotion; blocked if last active admin)
- `isActive`: `true` → `false` (deactivation; not affected by this feature)

**Removed (from feature 001)**:
- The `user.emailVerified → DoctorProfile.auto-create` flow is removed
  (no doctor role to trigger against).

---

### Doctor (new, custom)

A standalone domain entity representing a doctor that patients can
browse and book. **No relation to `User`** — doctors are data records,
not user accounts.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK, auto | Unique identifier |
| name | String | required, 2-120 chars | Doctor's full name |
| specialty | String | required, max 100 chars | Specialty (free-text in v1) |
| bio | String? | nullable, max 2000 chars | Short biography / about |
| imageUrl | String? | nullable, max 2048 chars | Profile photo URL |
| status | String | default: `"ACTIVE"` | Enum: `"ACTIVE"` or `"DEACTIVATED"` |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Validation rules**:
- `name` must be non-empty (2-120 chars).
- `specialty` must be non-empty (max 100 chars).
- `bio` is optional, max 2000 chars.
- `imageUrl` is optional, must be a valid URL if present.
- `status` must be `"ACTIVE"` or `"DEACTIVATED"`.

**State transitions**:
- `status`: `"ACTIVE"` → `"DEACTIVATED"` (admin soft-delete; reversible
  by re-activating via PATCH)
- `status`: `"DEACTIVATED"` → `"ACTIVE"` (admin re-activation)
- Hard delete: allowed only when the doctor has zero historical
  bookings. (For v1, no booking system exists, so hard delete is
  always allowed; the controller's check is a stub for future use.)

**Indexes**:
- `@@index([status])` for fast filtering of active vs deactivated
  doctors in patient-facing browse.
- `@@index([specialty])` for specialty-based filtering in the admin
  listing.

---

### DoctorProfile (REMOVED)

The `DoctorProfile` model from feature 001 is removed entirely.
Migration: `DROP TABLE "doctor_profile";` (in the new migration).

**Affected code paths to clean up**:
- `src/auth/auth.ts` — remove the `databaseHooks.user.update.after`
  callback that auto-creates `DoctorProfile` rows.
- `src/common/guards/doctor-approved.guard.ts` — delete the file (no
  more doctor-only routes).
- `src/auth/auth.controller.ts` — remove the `/api/doctors/test-route`
  smoke endpoint.
- `src/auth/auth.service.ts` — remove the `enrichSessionUser` doctor
  profile branch.
- `src/common/interfaces/session.interface.ts` — remove the
  `DoctorProfileSummary` type and the `doctorProfile` field on
  `SessionUser`.
- `src/admin/admin.controller.ts` — remove the doctor-profile
  approval/reject/suspend endpoints (replaced by new doctor CRUD).
- `src/admin/admin.service.ts` — remove `listDoctors(status)` and
  `setDoctorStatus(...)`; add the new doctor CRUD methods.
- `prisma/schema.prisma` — drop the `DoctorProfile` model and the
  `User.doctorProfile` / `User.approvedDoctors` relations.

---

### Session / Account / Verification (Better Auth core, unchanged)

No schema changes. Sessions and accounts still belong to `User`
records. The change in role enum does not affect session creation or
validation.

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
│ role: user|admin│  ← reduced enum (was: patient|doctor|admin)
│ isActive        │
│ image           │
│ createdAt       │
│ updatedAt       │
└────────┬────────┘
         │
         ├──────────────────┐
         ▼                  ▼
┌─────────────────┐ ┌─────────────────┐
│    Session      │ │    Account      │
├─────────────────┤ ├─────────────────┤
│ id (PK)         │ │ id (PK)         │
│ userId (FK)     │ │ userId (FK)     │
│ token (unique)  │ │ accountId       │
│ expiresAt       │ │ providerId      │
│ ipAddress       │ │   "credential"  │
│ userAgent       │ │   "google"      │
│ createdAt       │ │   "facebook"    │
│ updatedAt       │ │ accessToken?    │
└─────────────────┘ │ ...             │
                    │ password?       │
                    │ createdAt       │
                    │ updatedAt       │
                    └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  Doctor (new)   │     │  Verification   │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ name            │     │ identifier      │
│ specialty       │     │ value           │
│ bio?            │     │ expiresAt       │
│ imageUrl?       │     │ createdAt       │
│ status          │     │ updatedAt       │
│   ACTIVE        │     └─────────────────┘
│   DEACTIVATED   │
│ createdAt       │   ← NO foreign key to User
│ updatedAt       │   ← standalone CRUD record
└─────────────────┘
```

Doctors and Users are now completely separate entities. A patient who
happens to be a doctor (e.g. a doctor booking another doctor) signs
up as a `user` and has a separate `Doctor` record managed by an
admin — there is no link between the two.

## Enums

### Role (stored as String in User.role)

| Value | Description |
|-------|-------------|
| **user** | Regular platform user (replaces the previous "patient" value) |
| **admin** | Super Admin — seeded or promoted by an existing admin |

The values `patient` and `doctor` are **removed** from this enum and
MUST NOT be insertable or updatable.

### DoctorStatus (stored as String in Doctor.status)

| Value | Description |
|-------|-------------|
| ACTIVE | Visible in patient-facing search and bookable |
| DEACTIVATED | Hidden from patient-facing search; visible to admins with a "deactivated" indicator |

The previous `PENDING / APPROVED / REJECTED / SUSPENDED` enum from
feature 001 is replaced by the simpler `ACTIVE / DEACTIVATED` pair.
The "approval gate" concept is gone — doctors are added to the
platform only when an admin creates them, and they are immediately
active (no approval needed).

## Migration Strategy

**Two migrations are bundled in this feature**:

1. **Schema migration** (this feature, applied by `prisma migrate dev`):
   ```prisma
   // In schema.prisma:
   // - drop model DoctorProfile
   // - drop relation User.doctorProfile, User.approvedDoctors
   // - change User.role default from "patient" to "user"
   // - add model Doctor (new standalone entity)
   ```
   The generated migration includes `DROP TABLE "doctor_profile"` and
   `CREATE TABLE "doctor" (...)`.

2. **Data migration** (out of scope for this feature, operator's
   responsibility — see assumptions in `spec.md`):
   ```sql
   -- Run BEFORE applying the schema migration if existing data exists:
   UPDATE "user" SET role = 'user' WHERE role IN ('patient', 'doctor');
   -- Convert existing DoctorProfile rows to Doctor rows (mapping TBD
   -- by the operator based on the production data shape).
   ```

The schema migration alone is safe on a fresh database (no
`DoctorProfile` rows to drop, no `role` strings to coerce). On a
populated database, the operator MUST run the data migration first.

## Validation Rules (consolidated)

| Entity.Field | Rule |
|--------------|------|
| User.email | Unique across all users (existing from feature 001) |
| User.emailVerified | Set to true after email OTP verification (existing) |
| User.role | **Reduced to `"user"` or `"admin"` only**; any other value rejected at the boundary |
| User.isActive | Social and credential sign-in rejected if `false` (from feature 001/002) |
| User.role (change) | Cannot demote the last active admin (FR-011) |
| Doctor.name | Required, 2-120 chars |
| Doctor.specialty | Required, max 100 chars |
| Doctor.bio | Optional, max 2000 chars |
| Doctor.imageUrl | Optional, must be a valid URL if present |
| Doctor.status | `"ACTIVE"` or `"DEACTIVATED"` only |
| Account.userId | Must reference an existing User (FK, existing) |
| Account.providerId | `"credential"`, `"google"`, or `"facebook"` (from feature 001/002) |
