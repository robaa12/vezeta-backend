import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CORS_ORIGIN: z.string().optional().default(''),

  SWAGGER_ENABLED: z.enum(['true', 'false', '1', '0']).optional(),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z
    .string()
    .min(1, 'BETTER_AUTH_URL is required')
    .default('http://localhost:3000'),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('Vezeeta <onboarding@resend.dev>'),

  SMS_PROVIDER_API_KEY: z.string().optional().default(''),
  SMS_PROVIDER_SENDER_ID: z.string().optional().default('Vezeeta'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  FACEBOOK_CLIENT_ID: z.string().optional().default(''),
  FACEBOOK_CLIENT_SECRET: z.string().optional().default(''),

  RUN_SEED: z.enum(['true', 'false']).optional().default('false'),
  SEED_ADMIN_EMAIL: z.string().email().optional().default('admin@vezeta.local'),
  SEED_ADMIN_PHONE: z.string().optional().default('+201000000000'),
  SEED_ADMIN_PASSWORD: z.string().optional().default('ChangeMe123!'),
  SEED_ADMIN_NAME: z.string().optional().default('Super Admin'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function validateEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${errors}`);
  }

  _env = parsed.data;

  // Extra: warn on known-insecure defaults in production
  if (_env.NODE_ENV === 'production') {
    if (
      _env.SEED_ADMIN_PASSWORD === 'ChangeMe123!' &&
      _env.RUN_SEED === 'true'
    ) {
      console.warn(
        '[env] WARNING: SEED_ADMIN_PASSWORD is the documented default. Change it before deploying.',
      );
    }
  }

  return _env;
}

export function getEnv(): Env {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}
