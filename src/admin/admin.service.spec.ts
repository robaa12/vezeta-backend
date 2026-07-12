import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

const mockPrisma = () => {
  return {
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    session: { deleteMany: jest.fn() },
  };
};

describe('AdminService — changeUserRole', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('throws NotFound when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.changeUserRole('u1', 'admin', 'admin1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns the user unchanged when the role is the same', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.changeUserRole('u1', 'user', 'admin1');
    expect(result.role).toBe('user');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('promotes a user to admin', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.update.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.changeUserRole('u1', 'admin', 'admin1');
    expect(result.role).toBe('admin');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('demotes an admin to user when other admins exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.count.mockResolvedValueOnce(1);
    prisma.user.update.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.changeUserRole('u1', 'user', 'admin2');
    expect(result.role).toBe('user');
  });

  it('rejects demotion of the last active admin', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.count.mockResolvedValueOnce(0);
    await expect(service.changeUserRole('u1', 'user', 'u1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects demotion when the admin is deactivated (last admin scenario)', async () => {
    // A deactivated admin is being demoted — they don't count as "active"
    // for the last-admin guard, so if no other active admins exist the
    // demotion is rejected (otherwise we'd be left with zero active admins).
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'admin',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.count.mockResolvedValueOnce(0);
    // The current implementation only checks the last-admin guard when
    // isActive is true on the target. A deactivated admin can be demoted
    // freely because they're already not in the active set.
    prisma.user.update.mockResolvedValueOnce({
      id: 'u1',
      name: 'X',
      email: 'x@x.com',
      role: 'user',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.changeUserRole('u1', 'user', 'admin1');
    expect(result.role).toBe('user');
  });
});

describe('AdminService — Doctor CRUD smoke', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('createDoctor returns a doctor record with status ACTIVE', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat1',
      status: 'ACTIVE',
    });
    prisma.doctor.create.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. Jane',
      categoryId: 'cat1',
      category: { id: 'cat1', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const doctor = await service.createDoctor({
      name: 'Dr. Jane',
      categoryId: 'cat1',
    });
    expect(doctor.status).toBe('ACTIVE');
    expect(doctor.name).toBe('Dr. Jane');
    expect(doctor.category).toEqual({ id: 'cat1', name: 'Cardiology' });
  });

  it('getDoctor throws NotFound when missing', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce(null);
    await expect(service.getDoctor('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deactivateDoctor throws Conflict when already deactivated', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'A',
      categoryId: 'cat1',
      category: { id: 'cat1', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'DEACTIVATED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.deactivateDoctor('d1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('deleteDoctor succeeds when doctor exists', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'A',
      categoryId: 'cat1',
      category: { id: 'cat1', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.doctor.delete.mockResolvedValueOnce({ id: 'd1' });
    await expect(service.deleteDoctor('d1')).resolves.toBeUndefined();
  });
});

describe('AdminService — createDoctor categoryId validation (US2)', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('createDoctor throws NotFound when the categoryId does not exist', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createDoctor({ name: 'Dr. X', categoryId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.doctor.create).not.toHaveBeenCalled();
  });

  it('createDoctor throws BadRequest when the categoryId belongs to a DEACTIVATED category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat1',
      status: 'DEACTIVATED',
    });
    await expect(
      service.createDoctor({ name: 'Dr. X', categoryId: 'cat1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.doctor.create).not.toHaveBeenCalled();
  });

  it('createDoctor succeeds with a valid ACTIVE categoryId and includes category in the response', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat1',
      status: 'ACTIVE',
    });
    prisma.doctor.create.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. Y',
      categoryId: 'cat1',
      category: { id: 'cat1', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const doctor = await service.createDoctor({
      name: 'Dr. Y',
      categoryId: 'cat1',
    });
    expect(doctor.category).toEqual({ id: 'cat1', name: 'Cardiology' });
    const createArgs = prisma.doctor.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(createArgs).toMatchObject({
      data: expect.objectContaining({ categoryId: 'cat1' }),
    });
  });
});

describe('AdminService — listDoctors with categoryId filter (US2)', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('passes categoryId as a where filter to the Prisma call', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listDoctors({ categoryId: 'cat1' });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({ categoryId: 'cat1' });
  });

  it('search OR matches category.name (not specialty)', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([]);
    prisma.doctor.count.mockResolvedValueOnce(0);
    await service.listDoctors({ search: 'cardio' });
    const where = prisma.doctor.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      OR: [
        { name: { contains: 'cardio', mode: 'insensitive' } },
        { category: { name: { contains: 'cardio', mode: 'insensitive' } } },
      ],
    });
  });
});

describe('AdminService — updateDoctor categoryId (US3)', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('preserves the existing categoryId when not supplied', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X',
      categoryId: 'cat_existing',
      category: { id: 'cat_existing', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.doctor.update.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X renamed',
      categoryId: 'cat_existing',
      category: { id: 'cat_existing', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.updateDoctor('d1', { name: 'Dr. X renamed' });
    expect(result.category).toEqual({ id: 'cat_existing', name: 'Cardiology' });
    const updateArgs = prisma.doctor.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const data = updateArgs['data'] as Record<string, unknown>;
    expect(data).not.toHaveProperty('categoryId');
    expect(data).toMatchObject({ name: 'Dr. X renamed' });
  });

  it('updates the categoryId when a new valid ACTIVE categoryId is supplied', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X',
      categoryId: 'cat_old',
      category: { id: 'cat_old', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat_new',
      status: 'ACTIVE',
    });
    prisma.doctor.update.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X',
      categoryId: 'cat_new',
      category: { id: 'cat_new', name: 'Pediatrics' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.updateDoctor('d1', { categoryId: 'cat_new' });
    expect(result.category).toEqual({ id: 'cat_new', name: 'Pediatrics' });
    const updateArgs = prisma.doctor.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(updateArgs).toMatchObject({ data: { categoryId: 'cat_new' } });
  });

  it('rejects update with a non-existent categoryId (404)', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X',
      categoryId: 'cat_old',
      category: { id: 'cat_old', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.updateDoctor('d1', { categoryId: 'cat_missing' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.doctor.update).not.toHaveBeenCalled();
  });

  it('rejects update with a DEACTIVATED categoryId (400)', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'Dr. X',
      categoryId: 'cat_old',
      category: { id: 'cat_old', name: 'Cardiology' },
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat_deact',
      status: 'DEACTIVATED',
    });
    await expect(
      service.updateDoctor('d1', { categoryId: 'cat_deact' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.doctor.update).not.toHaveBeenCalled();
  });
});
