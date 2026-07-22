// Shared numeric / time constants. The aim is to keep magic numbers out
// of business code so they can be tuned in one place and the search hits
// the same name across all callers. Naming: <domain>_<purpose>_<unit>.

/** Patient can self-cancel up to this many hours before scheduledAt. */
export const APPOINTMENT_CANCEL_CUTOFF_HOURS = 24;

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for list endpoints. */
export const MAX_PAGE_SIZE = 100;

/** Doctor profile — bio (about section) cap. */
export const MAX_DOCTOR_BIO_LENGTH = 2000;

/** Doctor profile — imageUrl cap. */
export const MAX_URL_LENGTH = 2048;

/** Medical record — clinical notes cap. */
export const MAX_MEDICAL_NOTES_LENGTH = 10_000;

/** Medical record — max number of attachment URLs. */
export const MAX_MEDICAL_ATTACHMENT_URLS = 25;

/** OTP length (digits). */
export const OTP_LENGTH = 6;

/** OTP time-to-live, seconds. */
export const OTP_TTL_SECONDS = 600;

/** Session lifetime, seconds (7 days). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Session refresh threshold, seconds (1 day). */
export const SESSION_REFRESH_AGE_SECONDS = 60 * 60 * 24;

/** Minimum password length (also enforced by Better Auth). */
export const MIN_PASSWORD_LENGTH = 8;

/** Minimum name length for register / create-doctor. */
export const MIN_NAME_LENGTH = 2;

/** Maximum name length for register / create-doctor. */
export const MAX_NAME_LENGTH = 120;

/** Maximum category name length. */
export const MAX_CATEGORY_NAME_LENGTH = 100;

/** Search query min length — protects against single-char `ILIKE` scans. */
export const MIN_SEARCH_LENGTH = 2;

/** ThrottlerModule default — requests per window per IP. */
export const THROTTLER_DEFAULT_LIMIT = 120;

/** ThrottlerModule window, ms. */
export const THROTTLER_DEFAULT_WINDOW_MS = 60_000;
