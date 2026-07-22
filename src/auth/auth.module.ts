import { Module } from '@nestjs/common';
import { AuthModule as NestAuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { createAuth } from './auth.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { EmailService } from '../common/email/email.service.js';

@Module({
  imports: [
    NestAuthModule.forRootAsync({
      useFactory: (prisma: PrismaService, emailService: EmailService) => ({
        auth: createAuth(prisma, emailService),
        disableTrustedOriginsCors: true,
      }),
      inject: [PrismaService, EmailService],
      imports: [],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RolesGuard],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
