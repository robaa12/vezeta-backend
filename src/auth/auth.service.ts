import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthService as NestAuthService } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AuthSession,
  LinkedSocialProvider,
  SessionUser,
} from '../common/interfaces/session.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly nestAuth: NestAuthService,
    private readonly prisma: PrismaService,
  ) {}

  get api() {
    return this.nestAuth.api;
  }

  async getMe(session: AuthSession | undefined): Promise<SessionUser> {
    if (!session?.user) {
      throw new NotFoundException('No active session');
    }
    const user = session.user;
    const linkedSocialProviders = await this.listLinkedSocialProviders(user.id);
    return { ...user, linkedSocialProviders };
  }

  async countRemainingSignInMethods(userId: string): Promise<number> {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { providerId: true, password: true },
    });
    let count = 0;
    for (const acc of accounts) {
      if (acc.providerId === 'credential' && acc.password) {
        count += 1;
      } else if (acc.providerId === 'google' || acc.providerId === 'facebook') {
        count += 1;
      }
    }
    return count;
  }

  async listLinkedSocialProviders(
    userId: string,
  ): Promise<LinkedSocialProvider[]> {
    const rows = await this.prisma.account.findMany({
      where: { userId, providerId: { in: ['google', 'facebook'] } },
      select: { providerId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      provider: r.providerId as 'google' | 'facebook',
      linkedAt: r.createdAt,
    }));
  }

  async findSocialAccount(
    userId: string,
    provider: 'google' | 'facebook',
  ): Promise<{ id: string } | null> {
    return this.prisma.account.findFirst({
      where: { userId, providerId: provider },
      select: { id: true },
    });
  }

  async unlinkSocialAccount(
    userId: string,
    provider: 'google' | 'facebook',
  ): Promise<{ provider: 'google' | 'facebook'; unlinkedAt: Date }> {
    const result = await this.prisma.account.deleteMany({
      where: { userId, providerId: provider },
    });
    if (result.count === 0) {
      throw new NotFoundException('No linked account for this provider');
    }
    return { provider, unlinkedAt: new Date() };
  }
}
