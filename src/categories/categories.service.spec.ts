import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';

const mockPrisma = () => {
  return {
    category: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    doctor: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
};

const baseCategory = {
  id: 'cat1',
  name: 'Cardiology',
  status: 'ACTIVE',
  createdAt: new Date('2026-07-12T00:00:00Z'),
  updatedAt: new Date('2026-07-12T00:00:00Z'),
};

describe('CategoriesService — listCategories', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('returns paginated categories with default page/pageSize', async () => {
    prisma.category.findMany.mockResolvedValueOnce([baseCategory]);
    prisma.category.count.mockResolvedValueOnce(1);
    const result = await service.listCategories({});
    expect(result.categories).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('applies status filter when supplied', async () => {
    prisma.category.findMany.mockResolvedValueOnce([]);
    prisma.category.count.mockResolvedValueOnce(0);
    await service.listCategories({ status: 'DEACTIVATED' });
    const where = prisma.category.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({ status: 'DEACTIVATED' });
  });

  it('applies search filter (case-insensitive substring) when supplied', async () => {
    prisma.category.findMany.mockResolvedValueOnce([]);
    prisma.category.count.mockResolvedValueOnce(0);
    await service.listCategories({ search: 'cardio' });
    const where = prisma.category.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      name: { contains: 'cardio', mode: 'insensitive' },
    });
  });
});

describe('CategoriesService — getCategory', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('returns the category when found', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    const result = await service.getCategory('cat1');
    expect(result.id).toBe('cat1');
    expect(result.name).toBe('Cardiology');
  });

  it('throws NotFound when missing', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(service.getCategory('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CategoriesService — createCategory', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('creates a category with status ACTIVE by default', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.create.mockResolvedValueOnce(baseCategory);
    const result = await service.createCategory({ name: 'Cardiology' });
    expect(result.name).toBe('Cardiology');
    expect(result.status).toBe('ACTIVE');
    const createArgs = prisma.category.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(createArgs).toMatchObject({
      data: { name: 'Cardiology', status: 'ACTIVE' },
    });
  });

  it('rejects a case-insensitive duplicate of an ACTIVE name', async () => {
    prisma.category.findFirst.mockResolvedValueOnce({ id: 'cat_existing' });
    await expect(
      service.createCategory({ name: 'cardiology' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('allows a name that collides with a DEACTIVATED row (the findFirst only matches ACTIVE)', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.create.mockResolvedValueOnce(baseCategory);
    await expect(
      service.createCategory({ name: 'Cardiology' }),
    ).resolves.toBeDefined();
    expect(prisma.category.create).toHaveBeenCalled();
  });

  it('honors an explicit DEACTIVATED status', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.create.mockResolvedValueOnce({
      ...baseCategory,
      status: 'DEACTIVATED',
    });
    const result = await service.createCategory({
      name: 'Retired',
      status: 'DEACTIVATED',
    });
    expect(result.status).toBe('DEACTIVATED');
  });
});

describe('CategoriesService — updateCategory', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('throws NotFound when the category does not exist', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.updateCategory('missing', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when no fields are supplied', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    await expect(service.updateCategory('cat1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects renaming to a name that collides with another ACTIVE category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    prisma.category.findFirst.mockResolvedValueOnce({ id: 'cat_other' });
    await expect(
      service.updateCategory('cat1', { name: 'Pediatrics' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('applies the update when no collision exists', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.update.mockResolvedValueOnce({
      ...baseCategory,
      name: 'Cardiology Plus',
    });
    const result = await service.updateCategory('cat1', {
      name: 'Cardiology Plus',
    });
    expect(result.name).toBe('Cardiology Plus');
    expect(prisma.category.update).toHaveBeenCalled();
  });

  it('rejects reactivation when another ACTIVE category with the same name exists', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      ...baseCategory,
      status: 'DEACTIVATED',
    });
    prisma.category.findFirst.mockResolvedValueOnce({ id: 'cat_other' });
    await expect(
      service.updateCategory('cat1', { status: 'ACTIVE' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('CategoriesService — deactivateCategory', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('sets status=DEACTIVATED on an ACTIVE category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    prisma.category.update.mockResolvedValueOnce({
      ...baseCategory,
      status: 'DEACTIVATED',
    });
    const result = await service.deactivateCategory('cat1');
    expect(result.status).toBe('DEACTIVATED');
  });

  it('is idempotent for an already-DEACTIVATED category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      ...baseCategory,
      status: 'DEACTIVATED',
    });
    const result = await service.deactivateCategory('cat1');
    expect(result.status).toBe('DEACTIVATED');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe('CategoriesService — deleteCategory', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('throws NotFound when the category does not exist', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(service.deleteCategory('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects with ConflictException when doctors reference the category (no delete)', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    prisma.$transaction.mockImplementationOnce(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const tx = {
          doctor: { count: jest.fn().mockResolvedValueOnce(2) },
          category: { delete: jest.fn() },
        } as unknown as typeof prisma;
        return fn(tx);
      },
    );
    await expect(service.deleteCategory('cat1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('deletes the category when no doctors reference it (uses $transaction)', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(baseCategory);
    const txDelete = jest.fn().mockResolvedValueOnce({ id: 'cat1' });
    const txCount = jest.fn().mockResolvedValueOnce(0);
    prisma.$transaction.mockImplementationOnce(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const tx = {
          doctor: { count: txCount },
          category: { delete: txDelete },
        } as unknown as typeof prisma;
        return fn(tx);
      },
    );
    await expect(service.deleteCategory('cat1')).resolves.toBeUndefined();
    expect(txCount).toHaveBeenCalled();
    expect(txDelete).toHaveBeenCalled();
  });
});

describe('CategoriesService — listPublicCategories', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('returns ACTIVE categories sorted case-insensitively', async () => {
    prisma.category.findMany.mockResolvedValueOnce([
      { id: 'c1', name: 'cardiology' },
      { id: 'c2', name: 'Bariatrics' },
      { id: 'c3', name: 'Allergy' },
    ]);
    const result = await service.listPublicCategories();
    expect(result.map((r) => r.name)).toEqual([
      'Allergy',
      'Bariatrics',
      'cardiology',
    ]);
  });

  it('queries with status=ACTIVE and selects only id + name', async () => {
    prisma.category.findMany.mockResolvedValueOnce([]);
    await service.listPublicCategories();
    const args = prisma.category.findMany.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });
  });

  it('returns an empty array when no ACTIVE categories exist', async () => {
    prisma.category.findMany.mockResolvedValueOnce([]);
    const result = await service.listPublicCategories();
    expect(result).toEqual([]);
  });
});
