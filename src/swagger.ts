import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export const OPENAPI_VERSION = '0.0.1';

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
        'For the social OAuth flow, the browser hits `GET /api/auth/oauth/start?provider=google` (or `facebook`) — a Better Auth standard route — and follows the 302 redirect.',
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
  return SwaggerModule.createDocument(app, buildSwaggerConfig());
}
