import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: false,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
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
      persistAuthorization: true,
      withCredentials: true,
    },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Vezeeta backend listening on :${port}`);
  new Logger('Bootstrap').log(`Swagger UI available at :${port}/api/docs`);
}

void bootstrap();
