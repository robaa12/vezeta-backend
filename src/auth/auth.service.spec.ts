import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthService as NestAuthService } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const mockPrisma = () => {
  return {
    account: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    session: { deleteMany: jest.fn() },
  };
};

describe('AuthService — social sign-in helpers', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: NestAuthService, useValue: { api: {} } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('countRemainingSignInMethods counts a credential account with a password', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'credential', password: 'hashed' },
    ]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(1);
  });

  it('countRemainingSignInMethods counts a Google social account', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'google', password: null },
    ]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(1);
  });

  it('countRemainingSignInMethods counts a Facebook social account', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'facebook', password: null },
    ]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(1);
  });

  it('countRemainingSignInMethods returns total across multiple methods', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'credential', password: 'hashed' },
      { providerId: 'google', password: null },
      { providerId: 'facebook', password: null },
    ]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(3);
  });

  it('countRemainingSignInMethods returns 0 for a user with no accounts', async () => {
    prisma.account.findMany.mockResolvedValueOnce([]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(0);
  });

  it('countRemainingSignInMethods ignores credential accounts with no password', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'credential', password: null },
    ]);
    const count = await service.countRemainingSignInMethods('u1');
    expect(count).toBe(0);
  });

  it('listLinkedSocialProviders returns google + facebook rows in order', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { providerId: 'google', createdAt: new Date('2026-01-01') },
      { providerId: 'facebook', createdAt: new Date('2026-01-02') },
    ]);
    const result = await service.listLinkedSocialProviders('u1');
    expect(result).toEqual([
      { provider: 'google', linkedAt: new Date('2026-01-01') },
      { provider: 'facebook', linkedAt: new Date('2026-01-02') },
    ]);
  });

  it('listLinkedSocialProviders returns empty array when no social accounts', async () => {
    prisma.account.findMany.mockResolvedValueOnce([]);
    const result = await service.listLinkedSocialProviders('u1');
    expect(result).toEqual([]);
  });

  it('findSocialAccount returns null when no matching account', async () => {
    prisma.account.findFirst.mockResolvedValueOnce(null);
    const result = await service.findSocialAccount('u1', 'google');
    expect(result).toBeNull();
  });

  it('unlinkSocialAccount throws when no rows deleted', async () => {
    prisma.account.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.unlinkSocialAccount('u1', 'google')).rejects.toThrow(
      /No linked account/,
    );
  });

  it('unlinkSocialAccount returns the provider and timestamp on success', async () => {
    prisma.account.deleteMany.mockResolvedValueOnce({ count: 1 });
    const result = await service.unlinkSocialAccount('u1', 'facebook');
    expect(result.provider).toBe('facebook');
    expect(result.unlinkedAt).toBeInstanceOf(Date);
  });
});
