import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AllowedSignupNamesService } from './allowed-signup-names.service.js';

interface AllowedSignupNameRow {
  id: string;
  name: string;
  normalizedName: string;
  status: string;
  usedByEmail: string | null;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockPrisma = () => ({
  allowedSignupName: {
    findMany: jest.fn<() => Promise<AllowedSignupNameRow[]>>(),
    count: jest.fn<() => Promise<number>>(),
    findUnique: jest.fn<() => Promise<AllowedSignupNameRow | null>>(),
    findFirst: jest.fn<() => Promise<{ id: string } | null>>(),
    create: jest.fn<() => Promise<AllowedSignupNameRow>>(),
    update: jest.fn<() => Promise<AllowedSignupNameRow>>(),
    delete: jest.fn<() => Promise<AllowedSignupNameRow>>(),
  },
});

const baseEntry: AllowedSignupNameRow = {
  id: 'asn1',
  name: 'Ahmed Ali Hassan Omar',
  normalizedName: 'ahmed ali hassan omar',
  status: 'ACTIVE',
  usedByEmail: null,
  usedAt: null,
  createdAt: new Date('2026-08-13T00:00:00Z'),
  updatedAt: new Date('2026-08-13T00:00:00Z'),
};

async function buildService(prisma: ReturnType<typeof mockPrisma>) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AllowedSignupNamesService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return moduleRef.get(AllowedSignupNamesService);
}

describe('AllowedSignupNamesService — createAllowedSignupName', () => {
  let service: AllowedSignupNamesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    service = await buildService(prisma);
  });

  it('stores the normalized name alongside the display name', async () => {
    prisma.allowedSignupName.findFirst.mockResolvedValue(null);
    prisma.allowedSignupName.create.mockResolvedValue(baseEntry);

    await service.createAllowedSignupName({ name: 'Ahmed  ALI Hassan Omar' });

    const args = prisma.allowedSignupName.create.mock.calls[0]?.[0] as {
      data: { name: string; normalizedName: string; status: string };
    };
    expect(args.data.name).toBe('Ahmed  ALI Hassan Omar');
    expect(args.data.normalizedName).toBe('ahmed ali hassan omar');
    expect(args.data.status).toBe('ACTIVE');
  });

  it('rejects a name that is not exactly four words', async () => {
    await expect(
      service.createAllowedSignupName({ name: 'Ahmed Ali Hassan' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.allowedSignupName.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate of an ACTIVE entry', async () => {
    prisma.allowedSignupName.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.createAllowedSignupName({ name: 'Ahmed Ali Hassan Omar' }),
    ).rejects.toThrow(ConflictException);
  });

  it('checks for duplicates on the normalized name only', async () => {
    prisma.allowedSignupName.findFirst.mockResolvedValue(null);
    prisma.allowedSignupName.create.mockResolvedValue(baseEntry);

    await service.createAllowedSignupName({ name: 'AHMED ALI HASSAN OMAR' });

    const args = prisma.allowedSignupName.findFirst.mock.calls[0]?.[0] as {
      where: { normalizedName: string; status: string };
    };
    expect(args.where).toMatchObject({
      normalizedName: 'ahmed ali hassan omar',
      status: 'ACTIVE',
    });
  });
});

describe('AllowedSignupNamesService — updateAllowedSignupName', () => {
  let service: AllowedSignupNamesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    service = await buildService(prisma);
  });

  it('404s for an unknown id', async () => {
    prisma.allowedSignupName.findUnique.mockResolvedValue(null);

    await expect(
      service.updateAllowedSignupName('nope', { status: 'ACTIVE' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an empty patch', async () => {
    prisma.allowedSignupName.findUnique.mockResolvedValue(baseEntry);

    await expect(
      service.updateAllowedSignupName('asn1', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('clears the consumption record when a USED entry is released', async () => {
    const used: AllowedSignupNameRow = {
      ...baseEntry,
      status: 'USED',
      usedByEmail: 'someone@example.com',
      usedAt: new Date('2026-08-13T10:00:00Z'),
    };
    prisma.allowedSignupName.findUnique.mockResolvedValue(used);
    prisma.allowedSignupName.findFirst.mockResolvedValue(null);
    prisma.allowedSignupName.update.mockResolvedValue(baseEntry);

    await service.updateAllowedSignupName('asn1', { status: 'ACTIVE' });

    const args = prisma.allowedSignupName.update.mock.calls[0]?.[0] as {
      data: { usedByEmail: string | null; usedAt: Date | null };
    };
    expect(args.data.usedByEmail).toBeNull();
    expect(args.data.usedAt).toBeNull();
  });

  it('refuses to release an entry when the name is ACTIVE elsewhere', async () => {
    prisma.allowedSignupName.findUnique.mockResolvedValue({
      ...baseEntry,
      status: 'USED',
    });
    prisma.allowedSignupName.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.updateAllowedSignupName('asn1', { status: 'ACTIVE' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects renaming to a name that is not four words', async () => {
    prisma.allowedSignupName.findUnique.mockResolvedValue(baseEntry);

    await expect(
      service.updateAllowedSignupName('asn1', { name: 'Only Two' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.allowedSignupName.update).not.toHaveBeenCalled();
  });
});

describe('AllowedSignupNamesService — list and deactivate', () => {
  let service: AllowedSignupNamesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    service = await buildService(prisma);
  });

  it('paginates and filters by status and search', async () => {
    prisma.allowedSignupName.findMany.mockResolvedValue([baseEntry]);
    prisma.allowedSignupName.count.mockResolvedValue(1);

    const result = await service.listAllowedSignupNames({
      status: 'USED',
      search: 'ahmed',
      page: 2,
      pageSize: 10,
    });

    const args = prisma.allowedSignupName.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(args.where).toMatchObject({ status: 'USED' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(result.allowedSignupNames).toHaveLength(1);
  });

  it('is idempotent when deactivating an already-deactivated entry', async () => {
    prisma.allowedSignupName.findUnique.mockResolvedValue({
      ...baseEntry,
      status: 'DEACTIVATED',
    });

    await service.deactivateAllowedSignupName('asn1');

    expect(prisma.allowedSignupName.update).not.toHaveBeenCalled();
  });
});
