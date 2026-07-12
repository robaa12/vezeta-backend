import { Module } from '@nestjs/common';
import { AuthModule as NestAuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { createAuth } from './auth.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  imports: [
    NestAuthModule.forRootAsync({
      useFactory: (prisma: PrismaService) => ({
        auth: createAuth(prisma),
        disableTrustedOriginsCors: true,
      }),
      inject: [PrismaService],
      imports: [],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RolesGuard],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
