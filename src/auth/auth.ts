import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { APIError } from 'better-auth/api';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../common/email/email.service.js';
import { claimAllowedSignupName } from '../allowed-signup-names/signup-name-claim.js';
import { tidySignupName } from '../allowed-signup-names/name-normalization.js';
import {
  MIN_PASSWORD_LENGTH,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
  SESSION_TTL_SECONDS,
} from '../common/constants.js';

const INSECURE_DEV_SECRET = 'dev-only-insecure-secret-change-in-production';

// Origins the Better Auth routes (/api/auth/*) will accept requests from.
// In production BETTER_AUTH_TRUSTED_ORIGINS MUST be set to the real
// frontend origin(s) (comma-separated). In dev we default to the common
// Vite ports so `npm run dev` works out of the box.
const DEV_TRUSTED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
];

function resolveTrustedOrigins(): string[] {
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const explicit = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const set = new Set<string>([baseURL]);
  if (process.env.NODE_ENV !== 'production') {
    for (const origin of DEV_TRUSTED_ORIGINS) set.add(origin);
  }
  for (const origin of explicit) set.add(origin);
  return Array.from(set);
}

function resolveAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32',
    );
  }
  if (secret === INSECURE_DEV_SECRET || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET must be at least 32 random characters and not the committed dev placeholder.',
    );
  }
  return secret;
}

export interface CreateAuthOptions {
  /**
   * Enforce the signup allowlist in `databaseHooks.user.create.before`.
   *
   * Defaults to on outside tests. Two callers deliberately turn it off:
   * the Super Admin bootstrap in src/seed/seed.ts (which signs up through
   * Better Auth and would otherwise need to allowlist its own admin name),
   * and the e2e suites, which run with NODE_ENV=test and sign up throwaway
   * users. Mirrors how `requireEmailVerification` is relaxed below.
   */
  enforceSignupAllowlist?: boolean;
}

export const createAuth = (
  prismaService: PrismaService,
  emailService: EmailService,
  options: CreateAuthOptions = {},
): ReturnType<typeof betterAuth<Record<string, unknown>>> => {
  const enforceSignupAllowlist =
    options.enforceSignupAllowlist ?? process.env.NODE_ENV !== 'test';

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: resolveTrustedOrigins(),
    secret: resolveAuthSecret(),
    database: prismaAdapter(prismaService as unknown as PrismaClient, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // A credential account remains pending until its email OTP is
      // verified. Better Auth will not create a session at sign-up and
      // rejects password sign-in while emailVerified is false.
      // E2E seeds exercise authenticated booking flows directly. Production
      // and all non-test environments still require email verification.
      requireEmailVerification: process.env.NODE_ENV !== 'test',
      minPasswordLength: MIN_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
      // Disable Better Auth's signed cookie cache. When enabled,
      // request.user (and therefore RolesGuard's role + isActive
      // checks) is served from the HMAC-signed session cookie for
      // up to 5 minutes after a write, so demote / deactivate /
      // password-reset take effect with up to 5 minutes of lag.
      // The DB read per request is the right trade-off for an
      // authenticated backend.
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: 'vezeta',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: (
          process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
        ).startsWith('https://'),
      },
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'user',
          input: false,
        },
        phoneNumber: {
          type: 'string',
          required: false,
          input: true,
          // `input: true` allows the frontend to seed phoneNumber on
          // sign-up or via /api/auth/update-user. The phoneNumber
          // plugin's verify flow (send-otp + verify) is the only
          // path that flips phoneNumberVerified to true; setting
          // phoneNumber alone leaves it false.
        },
        phoneNumberVerified: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account',
      },
      facebook: {
        clientId: process.env.FACEBOOK_CLIENT_ID ?? '',
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? '',
        scope: ['email', 'public_profile'],
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'facebook'],
        disableImplicitLinking: true,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The registration allowlist is enforced here rather than in a Nest
          // guard, because sign-up is handled entirely by Better Auth and
          // never reaches a controller. This covers EVERY account-creation
          // path, social sign-in included: a brand-new Google/Facebook user
          // whose provider name is not on the list is rejected too. Signing
          // in with an existing account creates no user row, so it is
          // unaffected.
          before: async (user) => {
            const record = user as unknown as Record<string, unknown>;

            if (enforceSignupAllowlist) {
              const name = typeof record.name === 'string' ? record.name : '';
              const email =
                typeof record.email === 'string' ? record.email : '';

              const claimed = await claimAllowedSignupName(
                prismaService,
                name,
                email,
              );
              if (!claimed) {
                // Better Auth expects APIError from `better-auth/api` so the
                // request is rejected with the right HTTP status. A plain
                // Error surfaces as a 500.
                //
                // The body is serialised verbatim, so `error` is what the
                // SPA's axios interceptor reads (`data.error || data.code`),
                // while `code` is what Better Auth's OAuth callback forwards
                // as ?error= when a social signup is rejected.
                throw new APIError('FORBIDDEN', {
                  error: 'name_not_allowed',
                  code: 'NAME_NOT_ALLOWED',
                  message:
                    'This name is not allowed to sign up. Please contact the admin.',
                });
              }
              // Matching tolerates sloppy spacing, so store the tidied name
              // rather than persisting "  ahmed   ALI omar " as the account's
              // display name.
              return {
                data: { ...record, name: tidySignupName(name), role: 'user' },
              };
            }

            return { data: { ...record, role: 'user' } };
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            const acc = account as unknown as { userId?: string };
            if (!acc.userId) {
              return Promise.resolve({ data: account as never });
            }
            const user = await prismaService.user.findUnique({
              where: { id: acc.userId },
              select: { isActive: true },
            });
            if (user && user.isActive === false) {
              // Better Auth expects APIError from `better-auth/api` so
              // the request is rejected with the right HTTP status.
              // A plain Error surfaces as a 500.
              throw new APIError('FORBIDDEN', {
                message: 'account_deactivated',
              });
            }
            return Promise.resolve({ data: account as never });
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_TTL_SECONDS,
        sendVerificationOTP: async (data) => {
          await emailService.sendOtp(data);
        },
        sendVerificationOnSignUp: true,
        // Make the OTP plugin the implementation used by Better Auth's
        // required email-verification flow (instead of a link email).
        overrideDefaultEmailVerification: true,
      }),
    ],
  });
};

export type AppAuth = ReturnType<typeof createAuth>;
