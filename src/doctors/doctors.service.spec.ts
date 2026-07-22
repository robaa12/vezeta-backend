import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { DoctorsService } from './doctors.service.js';

const mockPrisma = () => {
  return {
    doctor: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };
};

const baseRecord = {
  id: 'd1',
  name: 'Dr. Jane Smith',
  categoryId: 'cat1',
  category: { id: 'cat1', name: 'Cardiology' },
  bio: '20 years of experience.',
  imageUrl: null,
  status: 'ACTIVE',
  services: [],
  createdAt: new Date('2026-07-11T10:00:00Z'),
  updatedAt: new Date('2026-07-11T10:00:00Z'),
};

describe('DoctorsService — listPublicDoctors', () => {
  let service: DoctorsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoctorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DoctorsService);
  });

  it('returns paginated results with default page/pageSize', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([baseRecord]);
    prisma.doctor.count.mockResolvedValueOnce(1);
    const result = await service.listPublicDoctors({});
    expect(result.doctors).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.doctors[0]?.category).toEqual({
      id: 'cat1',
      name: 'Cardiology',
    });
  });

  it('filters by status=ACTIVE and category.status=ACTIVE in every query', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({});
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    });
  });

  it('applies the categoryId filter (FK equality)', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({ categoryId: 'cat1' });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      status: 'ACTIVE',
      categoryId: 'cat1',
      category: { status: 'ACTIVE' },
    });
  });

  it('applies the search filter as case-insensitive substring on name + category.name', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({ search: 'smith' });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      status: 'ACTIVE',
      OR: [
        { name: { contains: 'smith', mode: 'insensitive' } },
        { category: { name: { contains: 'smith', mode: 'insensitive' } } },
      ],
    });
  });

  it('combines categoryId + search with AND (category exact, search OR)', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({
      categoryId: 'cat1',
      search: 'Jane',
    });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      status: 'ACTIVE',
      categoryId: 'cat1',
      OR: [
        { name: { contains: 'Jane', mode: 'insensitive' } },
        { category: { name: { contains: 'Jane', mode: 'insensitive' } } },
      ],
    });
  });

  it('omits OR clause when search is empty string', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({ search: '' });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).not.toHaveProperty('OR');
  });

  it('sorts by createdAt DESC', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({});
    const args = prisma.doctor.findMany.mock.calls[0]?.[0];
    expect(args).toMatchObject({ orderBy: { createdAt: 'desc' } });
  });

  it('applies pagination (skip/take) based on page and pageSize', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listPublicDoctors({ page: 3, pageSize: 10 });
    const args = prisma.doctor.findMany.mock.calls[0]?.[0];
    expect(args).toMatchObject({ skip: 20, take: 10 });
  });

  it('handles empty result set', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    const result = await service.listPublicDoctors({});
    expect(result.doctors).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('DoctorsService — getPublicDoctor', () => {
  let service: DoctorsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoctorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DoctorsService);
  });

  it('returns the doctor when ACTIVE and category is ACTIVE', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce(baseRecord);
    const result = await service.getPublicDoctor('d1');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('d1');
    expect(result?.category).toEqual({ id: 'cat1', name: 'Cardiology' });
  });

  it('passes id, status=ACTIVE, and category.status=ACTIVE to the query', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce(null);
    await service.getPublicDoctor('d1');
    const args = prisma.doctor.findFirst.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(args).toMatchObject({
      where: { id: 'd1', status: 'ACTIVE', category: { status: 'ACTIVE' } },
    });
  });

  it('returns null when doctor is not found (or is DEACTIVATED — both are filtered)', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce(null);
    const result = await service.getPublicDoctor('missing');
    expect(result).toBeNull();
  });

  it('returns null when the doctor is ACTIVE but the category is DEACTIVATED (US6)', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce(null);
    const result = await service.getPublicDoctor('d-active-cat-deact');
    expect(result).toBeNull();
    const args = prisma.doctor.findFirst.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(args).toMatchObject({
      where: {
        id: 'd-active-cat-deact',
        status: 'ACTIVE',
        category: { status: 'ACTIVE' },
      },
    });
  });

  it('includes ACTIVE services with computed finalPrice', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce({
      ...baseRecord,
      services: [
        {
          id: 's1',
          name: 'Consultation',
          price: { toNumber: () => 100 },
          discountPercent: 10,
        },
        {
          id: 's2',
          name: 'Follow-up',
          price: null,
          discountPercent: null,
        },
        {
          id: 's3',
          name: 'Free check',
          price: { toNumber: () => 0 },
          discountPercent: 0,
        },
      ],
    });
    const result = await service.getPublicDoctor('d1');
    expect(result?.services).toHaveLength(3);
    expect(result?.services[0]).toEqual({
      id: 's1',
      name: 'Consultation',
      price: 100,
      discountPercent: 10,
      finalPrice: 90,
    });
    expect(result?.services[1]).toEqual({
      id: 's2',
      name: 'Follow-up',
      price: null,
      discountPercent: null,
      finalPrice: null,
    });
    expect(result?.services[2]).toEqual({
      id: 's3',
      name: 'Free check',
      price: 0,
      discountPercent: 0,
      finalPrice: 0,
    });
  });

  it('passes services: { status: "ACTIVE" } include so DEACTIVATED services are hidden', async () => {
    prisma.doctor.findFirst.mockResolvedValueOnce(baseRecord);
    await service.getPublicDoctor('d1');
    const args = prisma.doctor.findFirst.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(args).toMatchObject({
      include: expect.objectContaining({
        services: expect.objectContaining({
          where: { status: 'ACTIVE' },
        }),
      }),
    });
  });
});
