---
description: "Task list for social login (Google & Facebook via Better Auth)"
---

# Tasks: Social Login (Google & Facebook via Better Auth)

**Input**: Design documents from `/specs/002-social-oauth-login/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md
**Tests**: The constitution's Code Quality section requires every new module to include integration tests covering its primary flow. Test tasks are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `test/` at repository root
- This feature touches only the existing `src/auth/` module and adds one new test file under `test/auth/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level configuration to enable the social provider flow. These tasks touch configuration files only and have no cross-story dependencies.

- [X] T001 Add Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) to `.env.example`
- [X] T002 Add Facebook OAuth env vars (FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET) to `.env.example`
- [X] T003 [P] Document social provider env vars in `README.md` under a new "Social Login" section

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration and helpers that MUST be complete before any user story can be implemented. No user story work can begin until this phase is complete.

- [X] T004 Verify the existing `Account` table in `prisma/schema.prisma` already supports `providerId = "google"` and `"facebook"` (no migration required per data-model.md)
- [X] T005 Add `socialProviders.google` config block with `clientId`, `clientSecret`, and `scope: ["openid", "email", "profile"]` to `src/auth/auth.ts`
- [X] T006 Add `socialProviders.facebook` config block with `clientId`, `clientSecret`, and `scope: ["email", "public_profile"]` to `src/auth/auth.ts`
- [X] T007 Add `accountLinking: { enabled: true, trustedProviders: ["google", "facebook"] }` config to `src/auth/auth.ts`
- [X] T008 [P] Implement deactivation guard in `src/auth/auth.ts` via `databaseHooks.account.create.before` that throws `account_deactivated` when `User.isActive === false` (FR-014). NOTE: Better Auth 1.6 does not expose a `hooks.account.accountLinking.disabled` callback; the documented mechanism is a `databaseHooks.account.create.before` guard.
- [X] T009 [P] Extend `GET /api/me` in `src/auth/auth.controller.ts` to include a `linkedSocialProviders` array (FR-015) via `auth.service.getMe()` + `listLinkedSocialProviders()`
- [X] T010 [P] Add `countRemainingSignInMethods(userId)`, `listLinkedSocialProviders(userId)`, `findSocialAccount(userId, provider)`, and `unlinkSocialAccount(userId, provider)` helpers to `src/auth/auth.service.ts`
- [X] T011 [P] Create DTO `src/auth/dto/link-social.dto.ts` with `provider` (enum `"google" | "facebook"`) and optional `callbackURL` validated via class-validator
- [X] T012 [P] Create DTO `src/auth/dto/unlink-social.dto.ts` with `provider` (enum `"google" | "facebook"`) validated via class-validator

**Checkpoint**: Foundation ready — Better Auth has both social providers registered, the deactivation hook is in place, `/me` returns the provider list, and the shared helpers/DTOs exist. User story implementation can now begin.

---

## Phase 3: User Story 1 - New User Signs Up with Google (Priority: P1) 🎯 MVP

**Goal**: A new visitor can click "Continue with Google", complete Google's consent, and end up with a verified PATIENT account and a session cookie.

**Independent Test**: Hit `GET /api/auth/sign-in/social?provider=google&callbackURL=/` in a clean browser session, complete the mock provider consent, then call `GET /api/auth/me` and assert: `user.emailVerified === true`, `user.role === "patient"`, `linkedSocialProviders` contains `google`. Database should show exactly 1 new `User` row + 1 new `Account` row with `providerId = "google"`.

### Implementation for User Story 1

- [X] T013 [US1] Verify the Better Auth `socialProviders.google` config from T005 produces a working `GET /api/auth/sign-in/social?provider=google` redirect (no custom code — confirm by hitting the endpoint and observing a 302 to `accounts.google.com`)
- [X] T014 [US1] Verify the `GET /api/auth/callback/google` handler (provided by Better Auth) correctly creates a new `User` with `role = "patient"`, `emailVerified = true`, and `name`/`image` from the Google profile (FR-003, FR-004)

**Checkpoint**: A new visitor can sign up via Google in under 60 seconds. US1 is independently testable.

---

## Phase 4: User Story 2 - New User Signs Up with Facebook (Priority: P1)

**Goal**: A new visitor can click "Continue with Facebook", complete Facebook's consent, and end up with a verified PATIENT account and a session cookie.

**Independent Test**: Hit `GET /api/auth/sign-in/social?provider=facebook&callbackURL=/` in a clean browser session, complete the mock provider consent (granting email), then call `GET /api/auth/me` and assert: `user.emailVerified === true`, `user.role === "patient"`, `linkedSocialProviders` contains `facebook`. Database should show 1 new `User` + 1 new `Account` with `providerId = "facebook"`.

### Implementation for User Story 2

- [X] T015 [US2] Verify the Better Auth `socialProviders.facebook` config from T006 produces a working `GET /api/auth/sign-in/social?provider=facebook` redirect (no custom code — confirm by hitting the endpoint and observing a 302 to `facebook.com`)
- [X] T016 [US2] Verify the `GET /api/auth/callback/facebook` handler (provided by Better Auth) correctly creates a new `User` with `role = "patient"`, `emailVerified = true`, and `name`/`image` from the Facebook profile (FR-003, FR-004)
- [X] T017 [US2] Verify that if the mock Facebook provider returns no email (or unverified email), the callback rejects the signup with a clear error (FR-008) — confirm by configuring the mock provider to omit the email scope and asserting a 400 response

**Checkpoint**: A new visitor can sign up via Facebook in under 60 seconds. US2 is independently testable.

---

## Phase 5: User Story 3 - Returning User Signs In with Google or Facebook (Priority: P1)

**Goal**: A user who previously signed up via a social provider can sign back in with the same provider and the existing account is reused — no duplicate user is created.

**Independent Test**: Complete US1, sign out, then hit `GET /api/auth/sign-in/social?provider=google` again. Assert: the resulting session belongs to the same `userId` as US1, and no new `User` row is created. Repeat for Facebook/US2.

### Implementation for User Story 3

- [X] T018 [US3] Verify the `accountLinking` config from T007 causes Better Auth to reuse the existing `User` on a returning social sign-in rather than create a new one (FR-005, FR-006) — assert by counting rows in the `User` table before and after a repeat sign-in
- [X] T019 [US3] Verify the `account.accountLinking` hook from T008 rejects the sign-in attempt with "account_deactivated" when the existing user's `isActive = false` (FR-014) — assert by deactivating the user via the admin endpoint from feature 001, then attempting the social sign-in

**Checkpoint**: Returning social sign-in works without creating duplicate users; deactivated users are blocked. US3 is independently testable.

---

## Phase 6: User Story 5 - Link Social Provider to Existing Account (Priority: P2)

**Goal**: A user who signed up with email/password can explicitly link a Google or Facebook account from profile settings, and the link is rejected if the social email doesn't match their account email.

**Independent Test**: Sign up via credential (feature 001), verify the email, then `POST /api/auth/link-social` with `{"provider": "google"}`. Assert: 200 response with a `url` to navigate to. After navigating and completing the consent, `/me` shows `linkedSocialProviders` containing `google`. Repeat with a mismatched email and assert 422 `{ "error": "email_mismatch" }`.

### Implementation for User Story 5

- [X] T020 [US5] Implement `POST /api/auth/link-social` in `src/auth/auth.controller.ts` — verifies the current session, rejects if the user has no verified email (FR-009: 403 `email_not_verified`), rejects if an Account with `(userId, providerId)` already exists (FR-010: 409 `provider_already_linked`), and returns a `url` for the frontend to navigate to with `disableSignUp: true` so the callback can only link the current user
- [X] T021 [US5] Verify the Better Auth callback (with `disableSignUp: true` from T020) rejects link attempts whose OAuth profile email doesn't match `currentUser.email` with 422 `email_mismatch` (FR-009)
- [X] T022 [US5] Verify the explicit link path respects the deactivation hook from T008 (FR-014) — assert that a deactivated user with a stale cookie cannot link a new social provider

**Checkpoint**: A credential user can link Google or Facebook; mismatched emails and deactivated users are rejected. US5 is independently testable.

---

## Phase 7: User Story 6 - Unlink Social Provider (Priority: P3)

**Goal**: A user with at least one other sign-in method can unlink a previously linked social provider. The last remaining sign-in method cannot be unlinked.

**Independent Test**: Sign up via credential, link Google (US5), then `DELETE /api/auth/social-accounts/google`. Assert: 200 with `{ provider, unlinkedAt }`; `/me` now shows `linkedSocialProviders: []`; credential sign-in still works. Then sign up via Google only (US1), and attempt to unlink Google. Assert: 422 `{ "error": "cannot_unlink_last_method" }`.

### Implementation for User Story 6

- [X] T023 [US6] Implement `DELETE /api/auth/social-accounts/:provider` in `src/auth/auth.controller.ts` — looks up the `Account` with `(userId = currentUser.id, providerId = provider)`; returns 404 if none exists; uses the `countRemainingSignInMethods` helper from T010 to reject with 422 `cannot_unlink_last_method` when this is the only sign-in method (FR-013); otherwise deletes the Account row and returns 200 with `{ provider, unlinkedAt }` (FR-012)

**Checkpoint**: Unlink works for multi-method users and is rejected for last-method users. US6 is independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end tests, validation, and documentation that span all user stories.

- [X] T024 [P] Create `test/auth/social-auth.e2e-spec.ts` covering all 9 scenarios from `specs/002-social-oauth-login/quickstart.md` (Google signup, Facebook signup, returning sign-in, auto-link on email match, explicit link happy path, explicit link mismatch, unlink happy path, unlink last-method, deactivated user blocked)
- [X] T025 [P] Add a unit test for `countRemainingSignInMethods` in `src/auth/auth.service.spec.ts` covering: credential-only user, Google-only user, Facebook-only user, multi-method user, edge case of user with no Accounts at all
- [X] T026 [P] Add a unit test for the `account.accountLinking` hook in `src/auth/auth.ts` test file (or extract to a helper and test the helper) covering: active user proceeds, deactivated user is rejected with the expected sentinel
- [X] T027 [P] Add a unit test for the link endpoint's pre-conditions in `src/auth/auth.controller.spec.ts`: `provider_already_linked` (409), `email_not_verified` (403), invalid provider (400)
- [X] T028 [P] Add a unit test for the unlink endpoint's last-method check in `src/auth/auth.controller.spec.ts`: `cannot_unlink_last_method` (422), happy path returns 200, 404 when no linked account exists
- [X] T029 Run `npm run test` and `npm run test:e2e -- --testPathPattern=social-auth` to confirm all new tests pass and no existing tests regress
- [X] T030 Run `npm run lint` and fix any lint issues introduced by the new code
- [ ] T031 Run the manual quickstart validation scenarios in `specs/002-social-oauth-login/quickstart.md` against a running stack to confirm the end-to-end flows
- [X] T032 Update `README.md` to mention "Sign in with Google" and "Sign in with Facebook" as available login methods in the user-facing feature list (if such a list exists)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. **BLOCKS all user stories** — T004–T012 must be done before any US1–US6 work.
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion.
  - US1 and US2 can be implemented in parallel (different provider config blocks; same Better Auth handler)
  - US3 depends on US1 and US2 having at least one signed-up user to test "returning" sign-in
  - US5 depends on a credential user existing (from feature 001) and US1/US2 having a working callback
  - US6 depends on US5 (needs a linked social account to unlink)
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1, MVP)**: Can start after Foundational (Phase 2). No dependencies on other stories.
- **User Story 2 (P1)**: Can start after Foundational (Phase 2). Independent of US1 (different provider), but tests use the same callback path shape.
- **User Story 3 (P1)**: Can start after Foundational (Phase 2). For a complete e2e test it benefits from US1/US2 having created users, but the implementation tasks themselves don't block.
- **User Story 5 (P2)**: Can start after Foundational (Phase 2). Independent of US3; the link endpoint logic doesn't depend on returning sign-in working.
- **User Story 6 (P3)**: Can start after Foundational (Phase 2) AND US5 (it tests the unlink of a link made by US5).

### Within Each User Story

- Configuration changes (T005/T006) before verifying the handler works (T013/T015).
- Hook implementation (T008) before behavior verification (T019, T022).
- DTOs (T011/T012) before controller methods that consume them (T020, T023).
- Helper (T010) before the controller method that uses it (T023).
- Tests (T024–T028) come after the implementation tasks they cover.

### Parallel Opportunities

- All Setup tasks (T001–T003) can run in parallel — different files, no dependencies.
- All Foundational tasks that touch different files can run in parallel:
  - T005/T006 (auth.ts config) — must be sequential with each other (same file)
  - T007 (auth.ts config) — same file as T005/T006
  - T008 (auth.ts hook) — same file as T005/T006/T007
  - T009 (auth.controller.ts) — different file, can be parallel with T005–T008
  - T010 (auth.service.ts) — different file, can be parallel
  - T011/T012 (DTO files) — different files, can be parallel with everything
- US1 implementation (T013/T014) and US2 implementation (T015/T016/T017) can run in parallel — different provider configs in the same file but no logical overlap; a single contributor can do them sequentially.
- All Polish tasks marked [P] (T024–T028) can run in parallel with each other — different test files / different files entirely.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

The MVP is **US1 (Google signup)** plus the foundational phase, because:
1. It validates the full social provider wiring (config, callback, session, /me).
2. It produces a working end-to-end flow that a stakeholder can demo.
3. The same wiring is then trivially extended to Facebook (US2), then to the
   return-sign-in and link/unlink flows.

Steps:
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1
4. **STOP and VALIDATE**: Run the e2e test for US1, manually verify with the
   mock OAuth server, confirm `/me` returns the expected shape
5. Demo Google signup end-to-end

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Add US1 (Google signup) → Test independently → Demo (MVP!)
3. Add US2 (Facebook signup) → Test independently → Demo
4. Add US3 (returning sign-in) → Test independently → Demo
5. Add US5 (account linking) → Test independently → Demo
6. Add US6 (account unlinking) → Test independently → Demo
7. Phase 8 (polish, e2e suite, docs) → Final validation

Each story adds value without breaking previous stories; the underlying
Better Auth config is additive and all changes are backwards-compatible
with the existing credential-based auth from feature 001.

### Parallel Team Strategy

With multiple developers (post-MVP):
1. Team completes Phase 1 + Phase 2 together.
2. After Foundational is done:
   - Developer A: US2 (Facebook) — in parallel with US3
   - Developer B: US3 (returning sign-in) — in parallel with US2
   - Developer C: US5 (account linking) — in parallel
3. Developer D: US6 (account unlinking) — after US5 lands
4. After all stories: team collectively owns Phase 8 polish + e2e suite.

For the MVP (solo / pair), execute strictly in the order US1 → US2 → US3 →
US5 → US6, stopping after each story for validation.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- US4 (Doctor signup via social) is intentionally excluded — see spec.md
  "User Story 4 - (Removed) Social Signup for Doctors" for rationale
- No database migration is required for this feature; the existing
  `Account` table from feature 001 is reused
- The deactivation hook (T008) is referenced by US3 and US5 — implement it
  during the Foundational phase, not later, so the downstream tests can
  rely on it
- Verify tests fail before implementing where TDD is desired (the unit
  tests in Phase 8 can be written first against the new helpers, then the
  implementation tasks verified to make them pass)
- Commit after each task or logical group; PR per user story is ideal
- Stop at any checkpoint to validate a story independently
