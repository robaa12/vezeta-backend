import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware.js';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AdminModule,
    DoctorsModule,
    CategoriesModule,
    AppointmentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        '/api/auth/sign-in/email',
        '/api/auth/sign-in/phone-number',
        '/api/auth/email-otp/send-verification-otp',
        '/api/auth/phone-number/send-otp',
      );
  }
}
