import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { APIError } from 'better-auth/api';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../common/email/email.service.js';
import {
  MIN_PASSWORD_LENGTH,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
  SESSION_TTL_SECONDS,
} from '../common/constants.js';

const sendPhoneOTP = (data: {
  phoneNumber: string;
  code: string;
}): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[phone-otp] phone=${data.phoneNumber} code=${data.code}`);
  }
  return Promise.resolve();
};

const sendPhonePasswordResetOTP = (data: {
  phoneNumber: string;
  code: string;
}): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[phone-password-reset] phone=${data.phoneNumber} code=${data.code}`,
    );
  }
  return Promise.resolve();
};

const INSECURE_DEV_SECRET = 'dev-only-insecure-secret-change-in-production';

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

export const createAuth = (
  prismaService: PrismaService,
  emailService: EmailService,
): ReturnType<typeof betterAuth<Record<string, unknown>>> => {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: [
      process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
      'http://localhost:3000',
    ],
    secret: resolveAuthSecret(),
    database: prismaAdapter(prismaService as unknown as PrismaClient, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
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
          input: false,
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
          before: (user) => {
            const record = user as unknown as Record<string, unknown>;
            return Promise.resolve({ data: { ...record, role: 'user' } });
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
        overrideDefaultEmailVerification: true,
      }),
      phoneNumber({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_TTL_SECONDS,
        sendOTP: sendPhoneOTP,
        sendPasswordResetOTP: sendPhonePasswordResetOTP,
      }),
    ],
  });
};

export type AppAuth = ReturnType<typeof createAuth>;
