import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { DoctorServicesModule } from './doctor-services/doctor-services.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MedicalRecordsModule } from './medical-records/medical-records.module.js';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware.js';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware.js';
import { EmailModule } from './common/email/email.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    EmailModule,
    AuthModule,
    AdminModule,
    DoctorsModule,
    CategoriesModule,
    DoctorServicesModule,
    AppointmentsModule,
    ReviewsModule,
    NotificationsModule,
    MedicalRecordsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
