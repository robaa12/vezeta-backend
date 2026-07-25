import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export const OPENAPI_VERSION = '0.0.1';

const betterAuthPaths: OpenAPIObject['paths'] = {
  '/api/auth/sign-up/email': {
    post: {
      tags: ['auth'],
      summary: 'Sign up with email and password',
      description:
        'Creates a new user account and sends an OTP email for verification. Auto-signs in the user on success.',
      operationId: 'signUpEmail',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password', 'name'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
                password: {
                  type: 'string',
                  format: 'password',
                  minLength: 8,
                  example: 'MyStr0ngP@ss',
                },
                name: { type: 'string', example: 'John Doe' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Sign-up successful. Session cookie set.' },
        '400': {
          description:
            'Validation error (e.g. password too short, email already taken).',
        },
        '422': { description: 'Invalid input.' },
      },
    },
  },
  '/api/auth/sign-in/email': {
    post: {
      tags: ['auth'],
      summary: 'Sign in with email and password',
      description:
        'Authenticates a user by email and password. Sets a session cookie on success.',
      operationId: 'signInEmail',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
                password: {
                  type: 'string',
                  format: 'password',
                  example: 'MyStr0ngP@ss',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Sign-in successful. Session cookie set.' },
        '401': { description: 'Invalid credentials.' },
      },
    },
  },
  '/api/auth/sign-out': {
    post: {
      tags: ['auth'],
      summary: 'Sign out',
      description:
        'Invalidates the current session and clears the session cookie.',
      operationId: 'signOut',
      responses: {
        '200': { description: 'Signed out successfully.' },
      },
    },
  },
  '/api/auth/forget-password': {
    post: {
      tags: ['auth'],
      summary: 'Request password reset',
      description: "Sends a password reset OTP to the user's email.",
      operationId: 'forgetPassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Password reset email sent (if account exists).',
        },
      },
    },
  },
  '/api/auth/reset-password': {
    post: {
      tags: ['auth'],
      summary: 'Reset password with OTP',
      description: 'Resets the user password using the OTP sent via email.',
      operationId: 'resetPassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'otp', 'newPassword'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
                otp: {
                  type: 'string',
                  description: '6-digit code from the forget-password email.',
                  example: '123456',
                },
                newPassword: {
                  type: 'string',
                  format: 'password',
                  minLength: 8,
                  example: 'NewStr0ngP@ss',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Password reset successfully.' },
        '400': { description: 'Invalid or expired OTP.' },
      },
    },
  },
  '/api/auth/email-otp/send-verification-otp': {
    post: {
      tags: ['auth'],
      summary: 'Send email verification OTP',
      description:
        "Sends a 6-digit OTP to the user's email for verification. Used for sign-in, email verification, and other flows.",
      operationId: 'sendVerificationOtp',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'type'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
                type: {
                  type: 'string',
                  enum: [
                    'sign-in',
                    'email-verification',
                    'forget-password',
                    'change-email',
                  ],
                  example: 'sign-in',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OTP sent to email.' },
      },
    },
  },
  '/api/auth/email-otp/verify-email': {
    post: {
      tags: ['auth'],
      summary: 'Verify email with OTP',
      description:
        'Verifies the email address using the OTP code. Completes sign-in or email verification flow.',
      operationId: 'verifyEmailOtp',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'otp'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'user@example.com',
                },
                otp: {
                  type: 'string',
                  description: '6-digit code from the email.',
                  example: '123456',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Email verified. Sets session cookie for sign-in flow.',
        },
        '400': { description: 'Invalid or expired OTP.' },
      },
    },
  },
  '/api/auth/phone-number/send-otp': {
    post: {
      tags: ['auth'],
      summary: 'Send phone-number OTP',
      description:
        'Sends a 6-digit OTP via SMS to the supplied phone number (E.164, e.g. `+201234567890`). Used to add or change a phone number on the account, and to start phone-based password reset. Requires an active session for the add/change flow; the forget-password variant does not. In dev the OTP is logged to the server console.',
      operationId: 'phoneNumberSendOtp',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber'],
              properties: {
                phoneNumber: {
                  type: 'string',
                  description:
                    'Phone number in E.164 format. Will be normalized server-side.',
                  example: '+201234567890',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OTP sent.' },
        '400': { description: 'Invalid phone number format.' },
        '401': { description: 'No active session.' },
      },
    },
  },
  '/api/auth/phone-number/verify': {
    post: {
      tags: ['auth'],
      summary: 'Verify phone-number OTP',
      description:
        'Verifies the OTP code and sets the user `phoneNumber` + `phoneNumberVerified: true`. Requires an active session. If the user already has a phone number attached, the new one replaces it only after successful verification.',
      operationId: 'phoneNumberVerify',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber', 'code'],
              properties: {
                phoneNumber: {
                  type: 'string',
                  example: '+201234567890',
                },
                code: {
                  type: 'string',
                  description: '6-digit code from the SMS.',
                  example: '123456',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description:
            'Phone number verified. `phoneNumber` and `phoneNumberVerified: true` are now set on the user.',
        },
        '400': { description: 'Invalid or expired OTP.' },
        '401': { description: 'No active session.' },
      },
    },
  },
  '/api/auth/phone-number/forget-password': {
    post: {
      tags: ['auth'],
      summary: 'Start phone-based password reset',
      description:
        'Sends a 6-digit OTP via SMS to the supplied phone number. The user must already have a verified phone number on the account. Use `reset-password` with the code to set a new password.',
      operationId: 'phoneNumberForgetPassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber'],
              properties: {
                phoneNumber: {
                  type: 'string',
                  example: '+201234567890',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OTP sent (if the phone number is on file).' },
      },
    },
  },
  '/api/auth/phone-number/reset-password': {
    post: {
      tags: ['auth'],
      summary: 'Reset password via phone OTP',
      description:
        'Resets the password for the account that owns the phone number. Requires the OTP sent by `forget-password`.',
      operationId: 'phoneNumberResetPassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber', 'otp', 'newPassword'],
              properties: {
                phoneNumber: {
                  type: 'string',
                  example: '+201234567890',
                },
                otp: {
                  type: 'string',
                  description: '6-digit code from the SMS.',
                  example: '123456',
                },
                newPassword: {
                  type: 'string',
                  format: 'password',
                  minLength: 8,
                  example: 'NewStr0ngP@ss',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Password reset. Session cookie set.' },
        '400': { description: 'Invalid or expired OTP.' },
      },
    },
  },
  '/api/auth/session': {
    get: {
      tags: ['auth'],
      summary: 'Get current session',
      description:
        'Returns the current authenticated session data, including user info.',
      operationId: 'getSession',
      responses: {
        '200': { description: 'Current session.' },
        '401': { description: 'No active session.' },
      },
    },
  },
  '/api/oauth/{provider}': {
    get: {
      tags: ['auth'],
      summary: 'Initiate social OAuth login (GET redirect)',
      description:
        'Redirects the browser to Google or Facebook to start the OAuth flow. The state cookie is set on the 302 response so the callback succeeds. Frontend usage: `<a href="/api/oauth/google?callbackURL=/dashboard">Sign in with Google</a>`.',
      operationId: 'oauthInitiate',
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['google', 'facebook'] },
          example: 'google',
        },
        {
          name: 'callbackURL',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          example: '/dashboard',
          description:
            'Frontend route to redirect to after successful sign-in. Defaults to `/`.',
        },
      ],
      responses: {
        '302': {
          description: 'Redirect to OAuth provider with the state cookie set.',
          headers: {
            Location: {
              description: 'URL of the OAuth provider (Google or Facebook).',
              schema: { type: 'string', format: 'uri' },
            },
            'Set-Cookie': {
              description:
                'Sets the `vezeta.state` cookie required for the callback.',
              schema: { type: 'string' },
            },
          },
        },
        '404': { description: 'Unknown or unconfigured provider.' },
      },
    },
  },
};

export function addBetterAuthPaths(document: OpenAPIObject): OpenAPIObject {
  return {
    ...document,
    paths: {
      ...document.paths,
      ...betterAuthPaths,
    },
  };
}

export function buildSwaggerConfig(): Omit<
  OpenAPIObject,
  'paths' | 'components'
> {
  return new DocumentBuilder()
    .setTitle('Vezeeta Backend API')
    .setDescription(
      [
        'REST API for the Vezeeta backend.',
        '',
        '## Auth',
        '',
        'Auth is handled by [Better Auth](https://www.better-auth.com/) and exposed under `/api/auth/*`.',
        'After `sign-in/email` or `sign-in/phone-number`, the server sets an HTTP-only session cookie.',
        'The frontend must send the cookie on every subsequent request (use `credentials: "include"` in fetch / `withCredentials: true` in axios).',
        '',
        'For the social OAuth flow, navigate the browser to `GET /api/oauth/google?callbackURL=/dashboard` (or `facebook`). The state cookie is set on the 302 response, so the callback succeeds without a cookie race condition. Use it as a direct link: `<a href="/api/oauth/google?callbackURL=/dashboard">Sign in with Google</a>`.',
        '',
        'Use the **Authorize** button below to paste the session cookie value if you want to call protected endpoints from Swagger UI.',
        '',
        '## Tags',
        '',
        '- `auth` — current-session, social linking, health',
        '- `doctors` — public doctor catalog',
        '- `categories` — public category dropdown',
        '- `slots` — public slot picker for a doctor',
        '- `doctor-services` — per-doctor service catalog (admin)',
        '- `appointments` — patient booking flow',
        '- `reviews` — patient reviews + public doctor rating',
        '- `medical-records` — patient-facing read of their records',
        '- `notifications` — in-app inbox',
        '- `admin` — admin-only management (requires the `admin` role)',
      ].join('\n'),
    )
    .setVersion(OPENAPI_VERSION)
    .addCookieAuth('vezeta.session_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'vezeta.session_token',
      description:
        'Better Auth session cookie set by /api/auth/* (prefix configured in src/auth/auth.ts).',
    })
    .addTag('auth', 'Session and account endpoints exposed by the app.')
    .addTag('doctors', 'Public doctor catalog (browse, search, profile).')
    .addTag('categories', 'Public category vocabulary.')
    .addTag('slots', 'Public slot picker for a doctor.')
    .addTag('doctor-services', 'Per-doctor service catalog (admin CRUD).')
    .addTag('appointments', 'Patient booking flow (book, list, cancel).')
    .addTag('reviews', 'Patient reviews and public doctor rating.')
    .addTag('medical-records', 'Patient read of their own medical records.')
    .addTag('notifications', 'In-app notifications inbox.')
    .addTag('admin', 'Admin-only management endpoints (require admin role).')
    .build();
}

export function getOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  return addBetterAuthPaths(document);
}
