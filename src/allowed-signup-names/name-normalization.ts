/**
 * The signup allowlist matches on a normalized form of the full name, so a
 * visitor typing "  ahmed   ALI hassan Omar " still matches the entry the
 * admin saved as "Ahmed Ali Hassan Omar".
 *
 * This is the single source of truth for the rule: the admin service writes
 * `normalizedName` with it, and the Better Auth signup hook looks up with it.
 * The two must never drift apart.
 */

/** Every allowed name is a four-part full name (first + father + grandfather + family). */
export const REQUIRED_NAME_WORDS = 4;

/**
 * Trim, collapse runs of whitespace to a single space, and lowercase.
 * `toLowerCase()` is a no-op for Arabic script, so Arabic names match as
 * written — diacritics and letter variants are deliberately NOT folded.
 */
export function normalizeSignupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Trim and collapse whitespace but keep the original capitalization. Used for
 * the value stored on the account, so a sloppily-typed "  ahmed   ALI omar "
 * is not persisted verbatim as the user's display name.
 */
export function tidySignupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Word count of the normalized name. */
export function countNameWords(value: string): number {
  const normalized = normalizeSignupName(value);
  return normalized === '' ? 0 : normalized.split(' ').length;
}

/** True when the name has exactly the required number of words. */
export function hasRequiredWordCount(value: string): boolean {
  return countNameWords(value) === REQUIRED_NAME_WORDS;
}
