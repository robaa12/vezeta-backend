import { hasRequiredWordCount, normalizeSignupName } from './name-normalization.js';

/**
 * Minimal structural type for the Prisma client. Better Auth's `createAuth`
 * receives a PrismaService directly (see src/auth/auth.ts), so the claim is a
 * plain function rather than an injectable — typing it structurally keeps this
 * module free of a Nest dependency and trivial to unit-test.
 */
export interface AllowedSignupNameClaimClient {
  allowedSignupName: {
    updateMany(args: {
      where: { normalizedName: string; status: string };
      data: { status: string; usedByEmail: string; usedAt: Date };
    }): Promise<{ count: number }>;
  };
}

/**
 * Atomically consume the ACTIVE allowlist entry matching `rawName`.
 *
 * The `status: 'ACTIVE'` predicate inside `updateMany` IS the concurrency
 * guard: under READ COMMITTED a second signup racing for the same name
 * re-evaluates the predicate after the first commits, sees USED, and comes
 * back with `count: 0`. This mirrors how slot booking avoids double-booking
 * (src/appointments/appointments.service.ts).
 *
 * @returns true when this caller won the claim and may proceed to register.
 */
export async function claimAllowedSignupName(
  prisma: AllowedSignupNameClaimClient,
  rawName: string,
  email: string,
): Promise<boolean> {
  // Stored names are always four words, so a name of any other shape cannot
  // match. Bailing early also keeps a blank name from hitting the database.
  if (!hasRequiredWordCount(rawName)) {
    return false;
  }

  const claimed = await prisma.allowedSignupName.updateMany({
    where: { normalizedName: normalizeSignupName(rawName), status: 'ACTIVE' },
    data: { status: 'USED', usedByEmail: email, usedAt: new Date() },
  });

  return claimed.count === 1;
}
