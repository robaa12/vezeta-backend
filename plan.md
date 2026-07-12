# Full Application Plan — Doctor Appointment Booking App (Vezeeta-style)
**Stack:** NestJS + Prisma + PostgreSQL + Better Auth (session-based, `emailOTP` + `phoneNumber` plugins) via `@thallesp/nestjs-better-auth`

This document supersedes the earlier auth-only plan — auth is now Module 1 of the full system, updated to use Better Auth instead of hand-rolled JWT/OTP logic, and placed in context with everything else.

---

## Table of Contents
1. Roles & Scope Recap
2. Architecture & Module Map
3. Full Database Schema (Prisma)
4. Module 1 — Auth (recap)
5. Module 2 — Doctors (profile, search, filtering)
6. Module 3 — Appointments (slots & booking)
7. Module 4 — Reviews & Ratings
8. Module 5 — Payments
9. Module 6 — Notifications
10. Module 7 — Medical Records
11. Module 8 — Admin Dashboard (Super Admin)
12. Full API Endpoint Summary
13. Phased Build Roadmap
14. Open Decisions to Confirm

---

## 1. Roles & Scope Recap

- **PATIENT** — searches doctors, books appointments, leaves reviews, views own medical history
- **DOCTOR** — solo-practice owner: manages own profile/clinic info, defines available slots, manages appointments, views own patients' records they created
- **SUPER_ADMIN** — approves doctors, oversees platform, views stats, can suspend accounts

---

## 2. Architecture & Module Map

```
src/
  auth/            # Better Auth instance config, NestJS module wiring, custom guards
                    # (RolesGuard, DoctorApprovedGuard) layered on top of Better Auth's own
                    # session guards/decorators
  users/           # shared user-facing profile endpoints (thin wrapper over Better Auth user)
  doctors/         # doctor profile, specialties, search/filter
  appointments/    # slots, booking, status lifecycle
  reviews/         # ratings tied to completed appointments
  payments/        # booking fee payments, provider integration
  notifications/   # email/SMS dispatch, reminders
  medical-records/ # per-appointment patient notes/attachments
  admin/           # Super Admin endpoints, dashboard stats
  prisma/          # PrismaService
  common/          # guards, decorators, interceptors, filters shared across modules
```

Each feature module depends on `auth` (guards) and `prisma`, but modules don't depend on each other directly where avoidable — e.g. `appointments` triggers `notifications` via an event/queue, not a direct service call, to keep things decoupled as the app grows.

Note: there's no separate `otp/` module anymore — OTP generation, storage, and verification for both email and phone are handled internally by Better Auth's `emailOTP` and `phoneNumber` plugins. App code only needs to implement the delivery callbacks (`sendVerificationOTP`, `sendOTP`) that plug in an email/SMS provider.

---

## 3. Full Database Schema (Prisma)

```prisma
// ─────────────────────────────────────────────────────────────────
// IDENTITY TABLES — owned by Better Auth
// ─────────────────────────────────────────────────────────────────
// Do not hand-write these models. They are generated/updated by running:
//   npx @better-auth/cli generate --config src/auth/auth.config.ts
// against the Better Auth instance config (which enables the emailOTP and
// phoneNumber plugins, plus additionalFields for `role`). The shape below
// is illustrative of what gets generated, not something to copy verbatim —
// always regenerate via the CLI after changing plugin config.

enum Role {
  PATIENT
  DOCTOR
  SUPER_ADMIN
}

model User {
  id                String   @id @default(uuid())
  email             String   @unique
  emailVerified     Boolean  @default(false)
  phoneNumber       String?  @unique
  phoneNumberVerified Boolean @default(false)
  name              String
  role              Role     @default(PATIENT)   // additionalFields entry
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  sessions          Session[]
  accounts          Account[]

  doctorProfile     DoctorProfile?
  appointmentsAsPatient Appointment[] @relation("PatientAppointments")
  reviewsWritten    Review[]
  notifications     Notification[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
}

model Account {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  providerId        String   // "credential" for email/password
  accountId         String
  password          String?  // hashed, managed by Better Auth
  createdAt         DateTime @default(now())
}

model Verification {
  id         String   @id @default(uuid())
  identifier String   // email or phone number being verified
  value      String   // OTP code / token, hashed by Better Auth
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

// ─────────────────────────────────────────────────────────────────
// DOMAIN TABLES — owned by application code
// ─────────────────────────────────────────────────────────────────

enum DoctorStatus {
  PENDING
  APPROVED
  REJECTED
  SUSPENDED
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
  NO_SHOW
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum NotificationChannel {
  EMAIL
  SMS
  PUSH
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
}

model Specialty {
  id      String          @id @default(uuid())
  name    String          @unique   // e.g. "Dermatology", "Pediatrics"
  doctors DoctorProfile[]
}

model DoctorProfile {
  id             String       @id @default(uuid())
  userId         String       @unique
  user           User         @relation(fields: [userId], references: [id])
  status         DoctorStatus @default(PENDING)
  approvedById   String?
  approvedAt     DateTime?

  specialtyId    String?
  specialty      Specialty?   @relation(fields: [specialtyId], references: [id])
  bio            String?
  photoUrl       String?
  yearsExperience Int?
  consultationFee Decimal?    @db.Decimal(10, 2)

  clinicName     String?
  clinicAddress  String?
  clinicCity     String?
  clinicPhone    String?
  latitude       Float?
  longitude      Float?

  slots          DoctorSlot[]
  appointments   Appointment[] @relation("DoctorAppointments")
  reviews        Review[]
}

model DoctorSlot {
  id           String   @id @default(uuid())
  doctorId     String
  doctor       DoctorProfile @relation(fields: [doctorId], references: [id])
  date         DateTime          // specific calendar date this slot belongs to
  startTime    DateTime
  endTime      DateTime
  isBooked     Boolean  @default(false)
  appointment  Appointment?
  createdAt    DateTime @default(now())
}

model Appointment {
  id           String   @id @default(uuid())
  patientId    String
  patient      User     @relation("PatientAppointments", fields: [patientId], references: [id])
  doctorId     String
  doctor       DoctorProfile @relation("DoctorAppointments", fields: [doctorId], references: [id])
  slotId       String   @unique
  slot         DoctorSlot @relation(fields: [slotId], references: [id])
  status       AppointmentStatus @default(PENDING)
  reasonForVisit String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  payment      Payment?
  review       Review?
  medicalRecord MedicalRecord?
}

model Payment {
  id             String   @id @default(uuid())
  appointmentId  String   @unique
  appointment    Appointment @relation(fields: [appointmentId], references: [id])
  amount         Decimal  @db.Decimal(10, 2)
  status         PaymentStatus @default(PENDING)
  provider       String?         // e.g. "Paymob", "Stripe"
  providerTxnId  String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Review {
  id             String   @id @default(uuid())
  appointmentId  String   @unique
  appointment    Appointment @relation(fields: [appointmentId], references: [id])
  patientId      String
  patient        User     @relation(fields: [patientId], references: [id])
  doctorId       String
  doctor         DoctorProfile @relation(fields: [doctorId], references: [id])
  rating         Int             // 1-5
  comment        String?
  createdAt      DateTime @default(now())
}

model MedicalRecord {
  id             String   @id @default(uuid())
  appointmentId  String   @unique
  appointment    Appointment @relation(fields: [appointmentId], references: [id])
  notes          String?
  attachmentUrls String[]
  createdAt      DateTime @default(now())
}

model Notification {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  channel    NotificationChannel
  status     NotificationStatus @default(QUEUED)
  title      String
  body       String
  sentAt     DateTime?
  createdAt  DateTime @default(now())
}
```

**Notes on design choices:**
- `User`, `Session`, `Account`, and `Verification` are Better Auth's tables — regenerated via its CLI whenever plugin config changes, not hand-edited.
- `role` is added as a Better Auth `additionalFields` entry directly on `User`, since every user needs a role. Doctor-specific data (clinic info, approval status) lives in the separate `DoctorProfile` table instead, keeping Better Auth's core schema clean.
- `DoctorSlot` is a separate table rather than free-form time ranges, so booking is just "claim an unbooked slot" — avoids double-booking race conditions with a unique constraint + transaction.
- `Review` and `MedicalRecord` are 1:1 with `Appointment` — a review/record only makes sense tied to a specific completed visit, not floating freely.
- `Payment` is 1:1 with `Appointment` for now (single payment per booking); can be split into multiple line items later if needed.
- `Specialty` is its own table (not a free-text field) so search/filter by specialty stays clean and typo-free.

---

## 4. Module 1 — Auth

Built on **Better Auth** via the `@thallesp/nestjs-better-auth` NestJS adapter, using the Prisma adapter for storage.

**Configuration:**
- `emailOTP` plugin — handles email verification and OTP-based email sign-in. App code implements `sendVerificationOTP({ email, otp, type })` to plug in an email provider (type distinguishes `sign-in`, `email-verification`, `forget-password`).
- `phoneNumber` plugin — handles phone verification and OTP-based phone sign-in. App code implements `sendOTP({ phoneNumber, code })` to plug in an SMS provider.
- `emailAndPassword` enabled alongside both OTP plugins, so users register with email + password + phone, then verify both channels via OTP.
- `additionalFields.role` — adds the `Role` enum field to Better Auth's `User` model, set at sign-up.
- Sessions are the default: server-side session records in the `Session` table, HTTP-only cookies on the client. No manually managed JWT access/refresh pair — Better Auth's session handling replaces that entire design.

**Flows:**
- **Registration (patient/doctor):** sign up with email/password/phone/name/role → Better Auth creates `User` (unverified) → `emailOTP` and `phoneNumber` plugins send verification codes → user verifies both via their respective `verify` endpoints.
- **Doctor approval gate:** after verification, if `role = DOCTOR`, application code creates a `DoctorProfile` row with `status = PENDING`. The doctor has a valid session immediately but is blocked from doctor-only routes by a custom `DoctorApprovedGuard` until Super Admin approves.
- **Login:** Better Auth's standard email/password or phone/OTP sign-in issues a new session.
- **Password reset:** handled via `emailOTP`'s `forget-password` type or the `phoneNumber` plugin's `requestPasswordReset`, depending on which channel the user resets through.
- **Logout:** Better Auth's session revocation endpoint.

**Guards:**
- Better Auth's own session primitives from the NestJS adapter: `@Session()` to access the current session/user, `@AllowAnonymous()` and `@OptionalAuth()` for public/optional routes.
- Custom `RolesGuard` (checks `session.user.role`) and `DoctorApprovedGuard` (checks related `DoctorProfile.status === APPROVED`) layered on top for domain-specific access control.

**What this replaces from the earlier plan:** no custom `RefreshToken`/`OtpCode` tables, no hand-rolled token rotation logic, no custom `JwtAuthGuard` — Better Auth owns identity, sessions, and OTP delivery orchestration; app code only owns the doctor-approval gate and role checks on top.

---

## 5. Module 2 — Doctors (Profile, Search, Filtering)

**Doctor-side (self-management, requires `DoctorApprovedGuard` for most):**
- `PATCH /doctors/me` — update bio, photo, fee, clinic info, specialty
- `GET /doctors/me` — view own profile

**Patient-side (public/search):**
- `GET /doctors` — list with filters: `specialty`, `city`, `minFee`, `maxFee`, `minRating`, `search` (name text search)
- `GET /doctors/:id` — public doctor profile (bio, fee, clinic, rating average, reviews)
- `GET /specialties` — list all specialties for filter dropdown

**Notes:**
- Only `status = APPROVED` doctors appear in public search results.
- Rating average can be computed on read (aggregate `Review.rating`) or denormalized onto `DoctorProfile` for performance later — start with on-read aggregate, optimize when needed.

---

## 6. Module 3 — Appointments (Slots & Booking)

**Doctor-side:**
- `POST /doctors/me/slots` — create available slot(s) (single or bulk/recurring generation for a date range)
- `GET /doctors/me/slots` — view own slots (booked/unbooked)
- `DELETE /doctors/me/slots/:id` — remove an unbooked slot
- `GET /doctors/me/appointments` — view incoming appointments
- `PATCH /appointments/:id/confirm` — confirm a pending booking
- `PATCH /appointments/:id/complete` — mark visit completed (unlocks review + medical record entry)
- `PATCH /appointments/:id/no-show` — mark patient no-show

**Patient-side:**
- `GET /doctors/:id/slots?date=` — view available slots for a doctor on a given date
- `POST /appointments` — book a slot (`slotId`, `reasonForVisit`) → creates `Appointment` (status=PENDING), marks `DoctorSlot.isBooked = true` **inside a DB transaction** to prevent race conditions on concurrent bookings
- `PATCH /appointments/:id/cancel` — patient cancels (only allowed while PENDING/CONFIRMED, before appointment time — flag cutoff window as open decision)
- `GET /appointments/me` — patient's own appointment history

**Booking flow (critical path):**
1. Patient selects a slot → `POST /appointments`
2. Transaction: check `slot.isBooked === false` → create `Appointment` → set `slot.isBooked = true`
3. Fire `appointment.created` event → triggers notification (Module 6) and, if payments are required upfront, triggers payment intent creation (Module 5)
4. Doctor confirms → status → `CONFIRMED` → notification to patient
5. After visit time passes → doctor marks `COMPLETED` → unlocks review (Module 4) and medical record entry (Module 7)

---

## 7. Module 4 — Reviews & Ratings

- `POST /appointments/:id/review` — patient submits `rating` (1-5) + optional `comment`. **Only allowed if `appointment.status === COMPLETED`** and the appointment belongs to that patient, and no review already exists (1:1 enforced by schema).
- `GET /doctors/:id/reviews` — paginated list of a doctor's reviews (public)
- Rating average shown on doctor profile (Module 2) is computed from this data.

---

## 8. Module 5 — Payments

- `POST /appointments/:id/pay` — initiates payment (creates `Payment` record status=PENDING, returns provider checkout URL/token)
- `POST /payments/webhook` — provider webhook (e.g. Paymob/Stripe) to confirm payment success/failure, updates `Payment.status` and `providerTxnId`
- `GET /appointments/:id/payment` — check payment status

**Notes:**
- Webhook endpoint must verify provider signature — flagged in security section.
- Whether payment happens **before** doctor confirmation (pay-to-book) or **after** (pay-on-confirm) is a business decision — flagged as open decision below, since it changes the booking flow order in Module 3.
- Provider choice (Paymob is common for Egypt, or Stripe if going international) — flagged as open decision.

---

## 9. Module 6 — Notifications

- Internal event-driven: other modules emit events (`appointment.created`, `appointment.confirmed`, `appointment.reminder`, `payment.success`, `doctor.approved`) → `NotificationsModule` listens and creates `Notification` records, dispatches via `email.service.ts` / `sms.service.ts`
- `GET /notifications/me` — in-app notification list (optional, if you want an in-app inbox, not just email/SMS)
- Reminder notifications (e.g. "appointment tomorrow at 5pm") need a scheduled job — use `@nestjs/schedule` cron to scan upcoming appointments and queue reminders.

---

## 10. Module 7 — Medical Records

- `POST /appointments/:id/medical-record` — doctor adds notes + attachment URLs after a completed visit
- `GET /appointments/:id/medical-record` — doctor (own patients) or patient (own record) can view
- `GET /patients/me/medical-history` — patient's full history across all doctors they've seen

**Notes:**
- This is sensitive health data — even though full security hardening is deferred, access control here should be strict from day one: only the treating doctor and the patient themselves can ever read a given record. Flag this as a non-negotiable exception to the "security later" deferral.

---

## 11. Module 8 — Admin Dashboard (Super Admin)

- `GET /admin/doctors?status=PENDING` — list doctors awaiting approval
- `PATCH /admin/doctors/:id/approve` / `/reject` — from auth plan
- `PATCH /admin/doctors/:id/suspend` — suspend an approved doctor
- `GET /admin/users` — list/search all users
- `PATCH /admin/users/:id/deactivate` — deactivate any account
- `GET /admin/stats` — dashboard numbers: total patients, total doctors (by status), total appointments (by status), revenue (sum of PAID payments), signups over time

---

## 12. Full API Endpoint Summary

| Module | Endpoint | Method | Access |
|---|---|---|---|
| Auth | `/api/auth/sign-up/email` | POST | Public (Better Auth-mounted) |
| Auth | `/api/auth/email-otp/verify-email` | POST | Public (Better Auth-mounted) |
| Auth | `/api/auth/phone-number/send-otp` | POST | Public (Better Auth-mounted) |
| Auth | `/api/auth/phone-number/verify` | POST | Public (Better Auth-mounted) |
| Auth | `/api/auth/sign-in/email` | POST | Public (Better Auth-mounted) |
| Auth | `/api/auth/sign-out` | POST | Authenticated (Better Auth-mounted) |
| Auth | `/api/auth/email-otp/request-password-reset` | POST | Public (Better Auth-mounted) |
| Doctors | `/doctors` | GET | Public |
| Doctors | `/doctors/:id` | GET | Public |
| Doctors | `/doctors/me` | GET/PATCH | Doctor |
| Doctors | `/specialties` | GET | Public |
| Appointments | `/doctors/me/slots` | POST/GET | Doctor |
| Appointments | `/doctors/me/slots/:id` | DELETE | Doctor |
| Appointments | `/doctors/:id/slots` | GET | Public |
| Appointments | `/appointments` | POST | Patient |
| Appointments | `/appointments/me` | GET | Patient |
| Appointments | `/appointments/:id/confirm` | PATCH | Doctor |
| Appointments | `/appointments/:id/complete` | PATCH | Doctor |
| Appointments | `/appointments/:id/no-show` | PATCH | Doctor |
| Appointments | `/appointments/:id/cancel` | PATCH | Patient |
| Reviews | `/appointments/:id/review` | POST | Patient |
| Reviews | `/doctors/:id/reviews` | GET | Public |
| Payments | `/appointments/:id/pay` | POST | Patient |
| Payments | `/payments/webhook` | POST | Provider (signature-verified) |
| Payments | `/appointments/:id/payment` | GET | Patient/Doctor |
| Notifications | `/notifications/me` | GET | Authenticated |
| Medical Records | `/appointments/:id/medical-record` | POST/GET | Doctor/Patient |
| Medical Records | `/patients/me/medical-history` | GET | Patient |
| Admin | `/admin/doctors` | GET | Super Admin |
| Admin | `/admin/doctors/:id/approve` \| `/reject` \| `/suspend` | PATCH | Super Admin |
| Admin | `/admin/users` | GET | Super Admin |
| Admin | `/admin/users/:id/deactivate` | PATCH | Super Admin |
| Admin | `/admin/stats` | GET | Super Admin |

*Auth routes above are auto-mounted by Better Auth under its configured base path (`/api/auth/*` by default) — they aren't hand-written controllers. Exact paths depend on final plugin config; confirm against the generated OpenAPI/route list once the auth module is scaffolded.*

---

## 13. Phased Build Roadmap

### Phase 1 — MVP (core booking loop)
1. Auth module (full — as already planned)
2. Doctors module: profile management + public search/filter
3. Appointments module: slots + booking + confirm/cancel/complete
4. Seed script (Super Admin + a few specialties)

→ At the end of Phase 1 you have a working app: patients can find a doctor and book a real appointment.

### Phase 2 — Trust & communication
5. Reviews module (after completed appointments)
6. Notifications module (booking confirmations, reminders via cron)

### Phase 3 — Monetization & clinical data
7. Payments module (pick provider, integrate, webhook)
8. Medical records module (strict access control)

### Phase 4 — Operations
9. Admin dashboard (stats, user/doctor management beyond approval)
10. Phase-2-deferred security hardening from the auth plan (rate limiting, lockouts, device tracking)

---

## 14. Open Decisions to Confirm

**From auth plan (still open):**
- Patient registration: require both email + phone verified, or just one, before full access is granted?
- OTP expiry/resend cooldown (configurable per plugin — `expiresIn`, `allowedAttempts`) and session expiry duration — what values?
- Should doctors freely edit clinic info post-approval, or does editing key fields re-trigger review?
- Email/SMS provider choice for Better Auth's `sendVerificationOTP`/`sendOTP` callbacks (e.g. SendGrid/SES for email, Twilio/Vonage/local Egyptian SMS gateway for phone)?

**New, from full app scope:**
- Payment timing: pay-to-book (before doctor confirms) vs pay-on-confirm (after doctor confirms)?
- Payment provider: Paymob (common in Egypt) vs Stripe vs other?
- Appointment cancellation window: how close to the appointment time can a patient still cancel?
- Slot duration/granularity: fixed (e.g. 15/30 min) or doctor-defined per slot?
- Should patients be able to message doctors directly, or is all communication only through the booking flow? (out of scope unless you want it added)
- In-app notification inbox, or email/SMS only?