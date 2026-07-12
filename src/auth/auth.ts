import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

const sendEmailOTP = (data: {
  email: string;
  otp: string;
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';
}): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[email-otp] type=${data.type} email=${data.email} otp=${data.otp}`,
    );
  }
  return Promise.resolve();
};

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

export const createAuth = (
  prismaService: PrismaService,
): ReturnType<typeof betterAuth<Record<string, unknown>>> => {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: [
      process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
      'http://localhost:3000',
    ],
    secret:
      process.env.BETTER_AUTH_SECRET ??
      'dev-only-insecure-secret-change-in-production',
    database: prismaAdapter(prismaService as unknown as PrismaClient, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
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
          input: true,
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
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            const record = user as unknown as Record<string, unknown>;
            const role = record.role as string | undefined;
            const allowedRoles = new Set(['user', 'admin']);
            if (role !== undefined && !allowedRoles.has(role)) {
              throw new Error('invalid_role');
            }
            return Promise.resolve({
              data: { ...record, role: role ?? 'user' },
            });
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
              throw new Error('account_deactivated');
            }
            return Promise.resolve({ data: account as never });
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        sendVerificationOTP: sendEmailOTP,
        overrideDefaultEmailVerification: true,
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: 600,
        sendOTP: sendPhoneOTP,
        sendPasswordResetOTP: sendPhonePasswordResetOTP,
      }),
    ],
  });
};

export type AppAuth = ReturnType<typeof createAuth>;
