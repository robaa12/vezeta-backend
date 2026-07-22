# Frontend Integration Guide

Everything the frontend needs to talk to the Vezeeta backend. This document is the human-readable companion to [`openapi.json`](./openapi.json) — the OpenAPI 3.0 spec is the **source of truth** for every endpoint, request body, and response shape.

> **Authoritative source:** the OpenAPI spec. If this file and the spec disagree, the spec wins. Regenerate it with `npm run docs:export`.

---

## 1. The two files your AI agent should consume

| File | Purpose | How to read it |
| --- | --- | --- |
| [`openapi.json`](./openapi.json) | Machine-readable contract: every route, every body, every response, every status code. | `openapi-typescript ./openapi.json -o ./src/api/schema.ts` for types, or feed it directly to your AI agent. |
| [`INTEGRATION.md`](./INTEGRATION.md) (this file) | Everything the spec can't express: auth flow, cookies, error semantics, pagination, lifecycle rules, social-OAuth details. | Skim once, reference when needed. |

**Regenerate the spec after backend changes:**

```bash
npm run docs:export         # rebuilds dist/ and writes openapi.json
npm run docs:serve          # live UI at http://localhost:3000/api/docs
```

---

## 2. Environments & base URL

| Env | Base URL (typical) | Notes |
| --- | --- | --- |
| Local dev | `http://localhost:3000` | Default `PORT=3000`, `BETTER_AUTH_URL=http://localhost:3000`. |
| Docker dev | `http://localhost:3000` | Same as local; `docker compose up`. |
| Staging | _TBD by DevOps_ | Set in your `.env.production`. |
| Production | _TBD by DevOps_ | HTTPS-only — cookies are `Secure` automatically. |

**Important:** the backend reads `BETTER_AUTH_URL` for OAuth callback construction. The frontend's **public** origin (what the browser sees) must match the value the backend was started with, or social-OAuth callbacks will mis-route.

Configure the frontend with a single `API_BASE_URL` (or `NEXT_PUBLIC_API_URL`, `VITE_API_URL`, etc. — your framework's convention).

---

## 3. CORS & cookies — the two things that always trip people up

- **CORS** is enabled for everything by default in dev (`CORS_ORIGIN` unset → `*` with `credentials: true`). In production, set `CORS_ORIGIN` to a comma-separated list of allowed origins.
- **The session cookie is HTTP-only and `SameSite=Lax`.** The frontend cannot read it via `document.cookie` — and it should not need to. The browser sends it automatically on every same-origin request.
- **Cross-origin requests must opt in explicitly:**
  ```ts
  await fetch(`${API_BASE_URL}/api/me`, {
    credentials: 'include',           // <-- required
  });
  ```
  or with axios: `axios.create({ withCredentials: true })`.
- **Cookie name:** `vezeta.session_token` (prefix `vezeta` from `src/auth/auth.ts`). The Swagger UI "Authorize" button accepts the cookie value if you want to drive the API by hand.
- In production, cookies are `Secure` (HTTPS-only) automatically. The backend detects this from `BETTER_AUTH_URL` starting with `https://`.

---

## 4. Authentication flow

Auth is **Better Auth** under the hood, mounted at `/api/auth/*`. There are three sign-in paths plus a current-user helper.

### 4.1 Sign in with email + password

```
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "jane@example.com", "password": "..." }
```

- On success: `200 OK`, response body has the session user, and the server sets the `vezeta.session_token` cookie.
- On failure: `401` (bad credentials) or `429` (rate-limited — this route is throttled).

### 4.2 Sign in with phone + password

```
POST /api/auth/sign-in/phone-number
{ "phoneNumber": "+201234567890", "password": "..." }
```

Throttled. Same cookie behavior.

### 4.3 Email OTP (passwordless / verification)

```
POST /api/auth/email-otp/send-verification-otp   { "email": "..." }
POST /api/auth/email-otp/verify-email            { "email": "...", "otp": "123456" }
POST /api/auth/email-otp/sign-in/verify          { "email": "...", "otp": "123456" }
```

OTP is 6 digits, 10-minute TTL. The `send-verification-otp` route is throttled. In dev, the email is sent through Resend; in local dev, the OTP is **also** visible in the server console (`[email-otp] …`).

### 4.4 Phone OTP (passwordless)

```
POST /api/auth/phone-number/send-otp            { "phoneNumber": "+201234567890" }
POST /api/auth/phone-number/verify              { "phoneNumber": "...", "code": "123456" }
POST /api/auth/phone-number/forget-password     { "phoneNumber": "..." }
POST /api/auth/phone-number/reset-password      { "phoneNumber": "...", "otp": "...", "newPassword": "..." }
```

In dev, the OTP is logged to the console (`[phone-otp] …`).

### 4.5 Social login (Google / Facebook)

Two approaches — pick whichever fits your frontend architecture:

**Simple redirect (static/SSR pages):**
```
<a href="${BETTER_AUTH_URL}/api/auth/oauth/start?provider=google&callbackURL=${encodeURIComponent('/dashboard')}">
  Continue with Google
</a>
```

This is a Better Auth standard route that issues the CSRF cookie and **302-redirects** the browser to Google. The callback lands on `/api/auth/callback/google`, sets the session cookie, and redirects to `callbackURL`.

**SPA / JS-initiated flow (React, Vue, etc.):**
```
POST /api/auth/sign-in/social
{ "provider": "google", "callbackURL": "/dashboard" }
→ { "url": "https://accounts.google.com/o/oauth2/..." }
```

Call this endpoint, then `window.location.href = result.url` to start the OAuth flow in the browser.

### 4.6 Linking a social account to an existing user

Useful for "Link Google to my account" in profile settings. Requires an active session.

```
POST /api/auth/link-social              { "provider": "google", "callbackURL": "/profile" }
→ { "url": "https://accounts.google.com/o/oauth2/..." }

DELETE /api/auth/social-accounts/google
→ { "provider": "google", "unlinkedAt": "2026-..." }
```

- `POST /api/auth/link-social` returns a URL — the frontend should `window.location.href = url` it.
- Unlinking the **last** sign-in method is rejected with `422` (`cannot_unlink_last_method`).
- Linking requires the user's email to be **verified**.

### 4.7 Current user

```
GET /api/me
→ SessionUser
```

Always call this on app boot to know whether the user is signed in. Returns the full user shape including `emailVerified`, `phoneNumberVerified`, `role`, `isActive`, and `linkedSocialProviders[]`.

### 4.8 Sign out

```
POST /api/auth/sign-out
```

Clears the session cookie. Safe to call repeatedly (idempotent).

### 4.9 Session management

```
GET /api/auth/sessions
→ { sessions: [{ id, ipAddress, userAgent, createdAt, ... }] }

DELETE /api/auth/sessions/:id
→ 204 No Content
```

### 4.10 Account management

- `POST /api/auth/forget-password` — `{ email }` → sends reset OTP/email
- `POST /api/auth/reset-password` — `{ token, newPassword }` (token comes from the email link) or `{ phoneNumber, otp, newPassword }` for phone
- `POST /api/auth/change-password` — `{ currentPassword, newPassword, revokeOtherSessions? }`
- `POST /api/auth/change-email` — `{ newEmail, callbackURL? }` → sends verification email

---

## 5. Roles & authorization

There are exactly two roles: `user` (default) and `admin`. Doctors are **not** platform users — they're rows in the `doctor` table managed by the admin.

- **`user`** — can browse public catalog, book slots, leave reviews, read own medical records, manage own notifications.
- **`admin`** — all of the above, plus everything under `/api/admin/*` (doctor CRUD, slot CRUD, appointment lifecycle, user management, reviews moderation, category management, medical-record authoring).

The role is included in the `SessionUser` shape from `GET /api/me`. Frontends should hide admin UI based on `user.role === 'admin'`. **Never** trust the frontend for authorization — the backend re-checks every admin route with the `RolesGuard`.

---

## 6. Error response shape

Every error from this API has the same shape:

```json
{
  "statusCode": 422,
  "message": "A linked account for this provider already exists",
  "error": "Unprocessable Entity"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `statusCode` | number | HTTP status (mirrors the response code). |
| `message` | string | Human-readable, may be `;`-joined for multi-field validation errors. |
| `error` | string | HTTP status name. For our custom business errors, sometimes an error code (e.g. `email_not_verified`, `account_deactivated`, `cannot_unlink_last_method`, `provider_already_linked`, `provider_not_linked`). |

| Status | When |
| --- | --- |
| `400` | Validation error (invalid body / query). `forbidNonWhitelisted: true` — extra fields are rejected. |
| `401` | No active session. |
| `403` | Authenticated but forbidden — wrong role, account deactivated, within 24h cancellation window, email not verified, etc. |
| `404` | Resource not found **or** not visible to the caller (we use 404 to avoid leaking existence). |
| `409` | State conflict — slot already booked, last admin demotion rejected, review already exists, etc. |
| `422` | Semantic validation failure — unprocessable but well-formed. |
| `429` | Rate limit exceeded (`@nestjs/throttler`). Headers include `Retry-After`. |
| `500` | Unhandled exception. The body is the generic shape; details are in the server logs. |

**Frontend pattern:** if `statusCode === 401`, force a re-auth. If `statusCode === 403` with `error === 'account_deactivated'`, show a "your account is suspended" screen. Otherwise, surface `message` to the user.

---

## 7. Pagination

All list endpoints use **page-based pagination** with the same envelope:

```json
{
  "items": [ ... ],
  "total": 137,
  "page": 1,
  "pageSize": 20
}
```

Query parameters: `page` (1-based, default `1`) and `pageSize` (default `20`, max `100`).

Not every endpoint uses the literal field name `items` — check the spec:
- Doctors: `{ doctors, total, page, pageSize }`
- Categories: `{ categories, total, page, pageSize }` (admin); `{ categories: [...] }` (public, unpaginated)
- Slots: `{ slots, total, page, pageSize }` (admin); `{ slots: [...] }` (public, unpaginated)
- Appointments: `{ appointments, total, page, pageSize }`
- Reviews: `{ reviews, total, page, pageSize, averageRating }`
- Medical history: `{ records, total, page, pageSize }`
- Notifications: `{ notifications, total, page, pageSize, unreadCount }`

**Frontend pattern:** treat `page * pageSize >= total` as "no more pages." `averageRating` on reviews is `null` when the doctor has no reviews yet.

---

## 8. Date & time format

- All timestamps are **ISO 8601 in UTC**, suffix `Z` (e.g. `2026-08-01T09:00:00.000Z`).
- Input dates (slot creation, slot listing) must also be ISO 8601 UTC. Send them in the local zone converted to UTC — the backend will reject future-zone ambiguity.
- The server stores everything as `Date` in Prisma; JSON serializes as ISO 8601 strings.
- Durations: slot start/end are absolute timestamps. The slot picker should not assume any fixed duration — read `endsAt - startsAt` per slot.

---

## 9. Rate limits

Configured in `src/app.module.ts` via `@nestjs/throttler`:

| Scope | Limit | Notes |
| --- | --- | --- |
| Global | 120 req / 60s per IP | Everything counts. |
| `POST /api/auth/sign-in/email` | tighter | Explicit middleware in `app.module.ts`. |
| `POST /api/auth/sign-in/phone-number` | tighter | Same. |
| `POST /api/auth/email-otp/send-verification-otp` | tighter | Same. |
| `POST /api/auth/phone-number/send-otp` | tighter | Same. |
| `GET /api/doctors` (list) | 60 / 60s per IP | Controller-level `@Throttle`. |
| `GET /api/doctors/:id` | 120 / 60s per IP | |
| `GET /api/doctors/:id/slots` | 60 / 60s per IP | |
| `GET /api/doctors/:id/reviews` | 60 / 60s per IP | |
| `GET /api/categories` | 60 / 60s per IP | |
| `POST /api/appointments` (book) | 60 / 60s per IP | Protects slot-grab race. |
| `POST /api/appointments/:id/review` | 30 / 60s per IP | |

When exceeded: `429` with `Retry-After` header. The frontend should back off and retry, not spam.

---

## 10. Domain reference

### 10.1 `auth` — `/api/me`, `/api/health`, `/api/health/ready`, `/api/auth/*`

See [section 4](#4-authentication-flow) above for the full flow. The custom routes are:
- `GET /api/me` — current session user
- `GET /api/health` — liveness probe (HTTP server alive, no DB check)
- `GET /api/health/ready` — readiness probe (checks database connectivity)
- `POST /api/auth/link-social` — start linking Google/Facebook to current account
- `DELETE /api/auth/social-accounts/:provider` — unlink

### 10.2 `doctors` — public catalog

- `GET /api/doctors?categoryId=&search=&page=&pageSize=` — anonymous, ACTIVE doctors only, sorted.
- `GET /api/doctors/:id` — anonymous, single doctor. 404 for DEACTIVATED doctors or DEACTIVATED-category doctors.

Both endpoints are `Cache-Control: public, max-age=…` advisory headers (60s for the list, 300s for the detail). The frontend can use them as a hint for an HTTP cache; the backend does not have an in-process cache.

### 10.3 `categories` — public vocabulary + admin CRUD

**Public:**
- `GET /api/categories` — anonymous, ACTIVE categories, sorted A→Z. 5-minute `Cache-Control` hint. Used to populate the search dropdown.

**Admin** (`/api/admin/categories`, role: `admin`):
- `GET /api/admin/categories?status=&search=&page=&pageSize=` — list all categories, paginated
- `GET /api/admin/categories/:id` — get a single category
- `POST /api/admin/categories` — create (`{ name, status? }`)
- `PATCH /api/admin/categories/:id` — partial update
- `PATCH /api/admin/categories/:id/deactivate` — soft-deactivate (idempotent)
- `DELETE /api/admin/categories/:id` — hard delete (204, fails 409 if in use by doctors)

### 10.4 `doctor-services` — per-doctor service catalog (admin)

**Admin** (`/api/admin/doctors/:doctorId/services`, role: `admin`):
- `GET /api/admin/doctors/:doctorId/services?status=&page=&pageSize=` — list services for a doctor
- `POST /api/admin/doctors/:doctorId/services` — create (`{ name, price?, discountPercent?, status? }`)
- `GET /api/admin/doctors/:doctorId/services/:serviceId` — get one service
- `PATCH /api/admin/doctors/:doctorId/services/:serviceId` — partial update
- `PATCH /api/admin/doctors/:doctorId/services/:serviceId/deactivate` — soft-deactivate
- `DELETE /api/admin/doctors/:doctorId/services/:serviceId` — hard delete (204)

Each service has a `finalPrice` (computed: price minus discount). `discountPercent` is only settable when `price` is present.

### 10.4 `slots` — public slot picker

- `GET /api/doctors/:doctorId/slots` — anonymous, AVAILABLE slots for an ACTIVE doctor in an ACTIVE category, sorted ascending by start time. 60s `Cache-Control` hint. 404 for missing/DEACTIVATED doctors.

The slot id is what the patient posts to book.

### 10.5 `appointments` — patient booking flow

- `POST /api/appointments` — book a slot. Body: `{ slotId, patientNotes? }`. Returns `{ appointment }`. Atomic — exactly one of N concurrent bookers wins, the rest get `409`.
- `GET /api/appointments?status=&page=&pageSize=` — list **my** appointments.
- `PATCH /api/appointments/:id/cancel` — cancel **my** appointment. Returns 403 within 24h of `scheduledAt`. The slot is released back to AVAILABLE.

Appointment status lifecycle: `PENDING` (after booking) → `CONFIRMED` (admin confirms) → `COMPLETED` (admin marks done) | `CANCELLED` (either side). Only `COMPLETED` appointments can be reviewed.

### 10.6 `reviews` — patient reviews

- `POST /api/appointments/:id/review` — body: `{ rating: 1..5, comment? }`. Allowed only on `COMPLETED` appointments, only by the owning patient, only one review per appointment.
- `GET /api/doctors/:id/reviews?page=&pageSize=` — public list of a doctor's reviews, with `averageRating` inlined.
- `GET /api/admin/reviews?doctorId=&userId=&page=&pageSize=` — admin moderation list.
- `DELETE /api/admin/reviews/:id` — admin moderation delete (204).

### 10.7 `medical-records` — patient read

- `GET /api/appointments/:id/medical-record` — read the record for one appointment. Returns 404 to anyone other than the owning patient or an admin.
- `GET /api/patients/me/medical-history?page=&pageSize=` — the caller's full history, newest first.

Records are written by admins via `POST/PATCH /api/admin/appointments/:id/medical-record` (see admin section).

### 10.8 `notifications` — in-app inbox + automated reminders

**User-facing API:**
- `GET /api/notifications?unreadOnly=&page=&pageSize=` — paginated, newest first. Response includes `unreadCount` for the badge.
- `PATCH /api/notifications/:id/read` — body: `{ read?: boolean }` (default `true`).
- `PATCH /api/notifications/read-all` — marks everything read, returns `{ updated: number }`.

**Server-sent (automated) notifications:**

The backend sends these notifications automatically via cron + event listeners. The frontend does not trigger them — it only displays them.

| Trigger | Notification title | `metadata.kind` | Channel |
|---|---|---|---|
| Appointment booked | "Appointment request received" | `appointment.created` | EMAIL + IN_APP |
| Appointment confirmed | "Appointment confirmed" | `appointment.confirmed` | EMAIL + IN_APP |
| Appointment cancelled | "Appointment cancelled" | `appointment.cancelled` | EMAIL + IN_APP |
| Appointment completed | "How was your visit?" | `appointment.completed` | EMAIL + IN_APP |
| Review posted | "Review submitted" | `review.posted` | EMAIL + IN_APP |
| Medical record added | "Medical record added" | `medical.record.created` | EMAIL + IN_APP |
| **~24h before appointment** | "Upcoming appointment tomorrow" | `appointment.reminder.24h` | EMAIL + IN_APP |
| **~1h before appointment** | "Appointment in 1 hour" | `appointment.reminder.1h` | EMAIL + IN_APP |

**Cron schedule:** The 24h and 1h reminder jobs run every 15 minutes and scan CONFIRMED appointments whose `scheduledAt` falls within the respective window. Each appointment receives at most one of each reminder kind — the `metadata.kind` acts as an idempotency key.

### 10.9 `admin` — `/api/admin/*` (role: `admin`)

All routes require the `admin` role **and** an active account. The list below is grouped by surface — see the spec for the full DTOs.

**Doctors:** list/create/get/update/deactivate (soft)/hard-delete
**Slots:** create/list/get/update/block (soft)/hard-delete
**Appointments:** list/get + lifecycle transitions: `confirm` (PENDING→CONFIRMED), `cancel` (any→CANCELLED), `complete` (CONFIRMED→COMPLETED, only if `scheduledAt` is in the past)
**Users:** get/change-role (last-active-admin demotion rejected)/deactivate
**Categories:** full CRUD + soft-deactivate (see §10.3)
**Doctor services:** full CRUD + soft-deactivate (see §10.4)
**Reviews:** list moderation / delete
**Medical records:** create/update (admin authors on behalf of the treating doctor; patients read via the public read endpoints)
**Ping:** `GET /api/admin/ping` — liveness (anonymous, no auth — used by ops)

---

## 11. Caching & the front-end cache layer

The backend sends `Cache-Control` advisory headers on the public catalog endpoints:

| Endpoint | `Cache-Control` |
| --- | --- |
| `GET /api/doctors` | `public, max-age=60` |
| `GET /api/doctors/:id` | `public, max-age=300` |
| `GET /api/doctors/:id/slots` | `public, max-age=60` |
| `GET /api/doctors/:id/reviews` | `public, max-age=60` |
| `GET /api/categories` | `public, max-age=300` |

These are **hints to intermediaries** (CDN, browser HTTP cache). The backend itself does not cache in-process. If the frontend wants to cache, prefer the browser's HTTP cache over an in-memory one to keep the freshness contract clean.

---

## 12. File uploads

The API does **not** accept multipart uploads. Attachments (e.g. lab results on medical records) are URLs — the frontend uploads to its own object store (S3, R2, etc.) and posts the resulting URL in the body. The `imageUrl` field on doctors behaves the same way.

---

## 13. Versioning

The OpenAPI `info.version` is `0.0.1` and tracks the backend `package.json` version. There is no URL-based version prefix (no `/v1/`). Breaking changes will be communicated by:
1. Bumping `info.version` in `src/swagger.ts`
2. Regenerating `openapi.json`
3. A note in the changelog

The frontend should treat unknown fields as a non-error (be tolerant on read) and rely on `required` markers in the spec for write paths.

---

## 14. Cheat sheet for common flows

### Sign in → fetch me → book a slot
```ts
const API = process.env.NEXT_PUBLIC_API_URL!;
const f = (url: string, init: RequestInit = {}) =>
  fetch(`${API}${url}`, { credentials: 'include', ...init });

// 1. sign in
await f('/api/auth/sign-in/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

// 2. fetch me
const me = await (await f('/api/me')).json();

// 3. browse doctors
const { doctors } = await (await f('/api/doctors?page=1&pageSize=20')).json();

// 4. list slots
const { slots } = await (await f(`/api/doctors/${doctorId}/slots`)).json();

// 5. book
const { appointment } = await (
  await f('/api/appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slotId: slots[0].id }),
  })
).json();
```

### OAuth login from a "Continue with Google" button
```tsx
<a href={`${API}/api/auth/oauth/start?provider=google&callbackURL=${encodeURIComponent('/dashboard')}`}>
  Continue with Google
</a>
```

### Drive admin actions
```ts
await f('/api/admin/doctors', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, categoryId }),
});
// 401 → not signed in
// 403 → not an admin or account deactivated
```

---

## 15. Regenerating the spec

```bash
# rebuilds dist/ (so the @nestjs/swagger plugin runs over the source) and writes openapi.json
npm run docs:export

# custom path
npm run docs:export -- --out=./specs/openapi.json
```

The script needs a reachable `DATABASE_URL` because `PrismaService` connects on `onModuleInit` — it's the same as running the server.

The OpenAPI UI at `/api/docs` is regenerated automatically by `npm run docs:serve` (or `npm run start:dev`).

---

## 16. Contact / questions

If a behavior is unclear:
1. Search the spec (`openapi.json`) for the route — the description and `tags` are usually enough.
2. Search the controller (`src/<module>/<thing>.controller.ts`) for the `@ApiOperation` summary.
3. Search the DTO (`src/<module>/dto/*.ts`) for the per-field constraints.
4. If still unclear, ask in the backend channel with the route and the spec link.
