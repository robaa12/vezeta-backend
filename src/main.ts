import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { validateEnv } from './common/env.js';

// Fail fast on missing or invalid environment variables.
validateEnv();

const MAX_BODY_SIZE = '1mb';

function resolveCorsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CORS_ORIGIN must be set in production to a comma-separated list of allowed origins.',
      );
    }
    return true;
  }
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error(
      'CORS_ORIGIN must be a non-empty comma-separated list of allowed origins.',
    );
  }
  return origins;
}

function isHttps(): boolean {
  return (process.env.BETTER_AUTH_URL ?? '').startsWith('https://');
}

function isSwaggerEnabled(): boolean {
  const flag = process.env.SWAGGER_ENABLED;
  if (flag === undefined) {
    return process.env.NODE_ENV !== 'production';
  }
  return flag === 'true' || flag === '1';
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: false,
  });

  app.use(
    helmet({
      hsts: isHttps()
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // Body size guard — runs before any body parsing, rejects oversized
  // payloads with 413. Express json() middleware is added here because
  // NestJS is started with bodyParser: false (Better Auth handles its
  // own parsing), so app routes need a controlled parser.
  app.use(json({ limit: MAX_BODY_SIZE }));

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vezeeta Backend API')
      .setDescription(
        'REST API for the Vezeeta backend. Auth is handled by Better Auth at /api/auth/* (sign-up, sign-in, sessions, OTP, etc.). Use the "Authorize" button below with a Better Auth session cookie to call protected endpoints.',
      )
      .setVersion('0.0.1')
      .addCookieAuth('vezeta.session_token', {
        type: 'apiKey',
        in: 'cookie',
        name: 'vezeta.session_token',
        description:
          'Better Auth session cookie set by /api/auth/* (prefix from auth.ts)',
      })
      .addTag('auth', 'Session and account endpoints exposed by the app')
      .addTag('admin', 'Admin-only management endpoints (require admin role)')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: false,
        withCredentials: true,
      },
    });
  }

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Vezeeta backend listening on :${port}`);
  if (isSwaggerEnabled()) {
    new Logger('Bootstrap').log(`Swagger UI available at :${port}/api/docs`);
  }
}

void bootstrap();
