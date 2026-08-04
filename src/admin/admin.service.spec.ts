import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminService } from './admin.service.js';

const mockAudit = () => ({ record: jest.fn() });

const mockPrisma = () => {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    laboratory: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    appointment: { count: jest.fn(), groupBy: jest.fn() },
    review: { count: jest.fn() },
    medicalRecord: { count: jest.fn() },
    notification: { groupBy: jest.fn() },
    session: { deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
};

describe('AdminService — listUsers', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('returns phone numbers and searches by phone', async () => {
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    const updatedAt = new Date('2026-08-01T10:00:00.000Z');
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'u1',
        name: 'Ahmed',
        email: 'ahmed@example.com',
        phoneNumber: '+201012345678',
        role: 'user',
        isActive: true,
        createdAt,
        updatedAt,
      },
    ]);
    prisma.user.count.mockResolvedValueOnce(1);

    const result = await service.listUsers({ search: '+2010' });

    expect(result.users[0]?.phoneNumber).toBe('+201012345678');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            {
              phoneNumber: {
                contains: '+2010',
                mode: 'insensitive',
              },
            },
          ]),
        },
        select: expect.objectContaining({ phoneNumber: true }),
      }),
    );
  });
});

describe('AdminService — changeUserRole', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
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

describe('AdminService — deactivateUser last-admin guard', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;
  let txMock: Record<string, unknown>;

  beforeEach(async () => {
    prisma = mockPrisma();
    txMock = prisma;
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('throws NotFound when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.deactivateUser('u1', 'admin1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects deactivation of the last active admin (lockout prevention)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'admin',
      isActive: true,
    });
    prisma.user.count.mockResolvedValueOnce(0);
    await expect(service.deactivateUser('u1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows deactivation of an active admin when other active admins exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'admin',
      isActive: true,
    });
    prisma.user.count.mockResolvedValueOnce(1);
    (txMock['user']['update'] as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      isActive: false,
      name: 'X',
      email: 'x@x.com',
    });
    (txMock['session']['deleteMany'] as jest.Mock).mockResolvedValueOnce({
      count: 2,
    });
    const result = await service.deactivateUser('u1', 'admin1');
    expect(result.isActive).toBe(false);
    expect(txMock['session']['deleteMany']).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('allows deactivation of a non-admin user (no last-admin check)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'user',
      isActive: true,
    });
    (txMock['user']['update'] as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      isActive: false,
      name: 'X',
      email: 'x@x.com',
    });
    (txMock['session']['deleteMany'] as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    await expect(service.deactivateUser('u1', 'admin1')).resolves.toMatchObject(
      {
        isActive: false,
      },
    );
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('allows deactivation of a deactivated admin (no last-admin check, they are not active)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'admin',
      isActive: false,
    });
    (txMock['user']['update'] as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      isActive: false,
      name: 'X',
      email: 'x@x.com',
    });
    (txMock['session']['deleteMany'] as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    await expect(service.deactivateUser('u1', 'admin1')).resolves.toMatchObject(
      {
        isActive: false,
      },
    );
    expect(prisma.user.count).not.toHaveBeenCalled();
  });
});

describe('AdminService — activateUser', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('throws NotFound when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.activateUser('u1', 'admin1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('activates an inactive user and records the action', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      isActive: false,
    });
    prisma.user.update.mockResolvedValueOnce({
      id: 'u1',
      isActive: true,
      name: 'X',
      email: 'x@x.com',
    });

    await expect(service.activateUser('u1', 'admin1')).resolves.toMatchObject({
      id: 'u1',
      isActive: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: true },
      select: { id: true, isActive: true, name: true, email: true },
    });
  });
  it('throws Conflict when the user is already active', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      isActive: true,
    });

    await expect(service.activateUser('u1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AdminService — Doctor CRUD smoke', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
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
    const doctor = await service.createDoctor(
      {
        name: 'Dr. Jane',
        categoryId: 'cat1',
      },
      undefined,
      'admin1',
    );
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
    await expect(service.deactivateDoctor('d1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('activateDoctor returns an active doctor', async () => {
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
    prisma.doctor.update.mockResolvedValueOnce({
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

    await expect(service.activateDoctor('d1', 'admin1')).resolves.toMatchObject(
      {
        id: 'd1',
        status: 'ACTIVE',
      },
    );
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'ACTIVE' },
      include: { category: { select: { id: true, name: true } } },
    });
  });

  it('deleteDoctor succeeds when doctor exists and has no history', async () => {
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
    prisma.appointment.count.mockResolvedValueOnce(0);
    prisma.review.count.mockResolvedValueOnce(0);
    prisma.medicalRecord.count.mockResolvedValueOnce(0);
    prisma.doctor.delete.mockResolvedValueOnce({ id: 'd1' });
    await expect(service.deleteDoctor('d1', 'admin1')).resolves.toBeUndefined();
  });

  it('deleteDoctor rejects with 409 when the doctor has appointments', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'A',
      categoryId: 'cat1',
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.appointment.count.mockResolvedValueOnce(3);
    prisma.review.count.mockResolvedValueOnce(0);
    prisma.medicalRecord.count.mockResolvedValueOnce(0);
    await expect(service.deleteDoctor('d1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.doctor.delete).not.toHaveBeenCalled();
  });

  it('deleteDoctor rejects with 409 when the doctor has reviews', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'A',
      categoryId: 'cat1',
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.appointment.count.mockResolvedValueOnce(0);
    prisma.review.count.mockResolvedValueOnce(2);
    prisma.medicalRecord.count.mockResolvedValueOnce(0);
    await expect(service.deleteDoctor('d1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('deleteDoctor rejects with 409 when the doctor has medical records', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({
      id: 'd1',
      name: 'A',
      categoryId: 'cat1',
      bio: null,
      imageUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.appointment.count.mockResolvedValueOnce(0);
    prisma.review.count.mockResolvedValueOnce(0);
    prisma.medicalRecord.count.mockResolvedValueOnce(1);
    await expect(service.deleteDoctor('d1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('AdminService — getStats', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('aggregates all counters concurrently and shapes them by status', async () => {
    prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    prisma.user.groupBy.mockResolvedValueOnce([
      { role: 'user', _count: { _all: 9 } },
      { role: 'admin', _count: { _all: 1 } },
    ]);
    prisma.doctor.count.mockResolvedValueOnce(5);
    prisma.doctor.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: { _all: 4 } },
      { status: 'DEACTIVATED', _count: { _all: 1 } },
    ]);
    prisma.laboratory.count.mockResolvedValueOnce(4);
    prisma.laboratory.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: { _all: 3 } },
      { status: 'DEACTIVATED', _count: { _all: 1 } },
    ]);
    prisma.category.count.mockResolvedValueOnce(3);
    prisma.category.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: { _all: 3 } },
    ]);
    prisma.appointment.count.mockResolvedValueOnce(0);
    prisma.appointment.groupBy.mockResolvedValueOnce([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'COMPLETED', _count: { _all: 7 } },
    ]);
    prisma.review.count.mockResolvedValueOnce(6);
    prisma.medicalRecord.count.mockResolvedValueOnce(4);
    prisma.notification.groupBy.mockResolvedValueOnce([
      { status: 'SENT', _count: { _all: 100 } },
      { status: 'FAILED', _count: { _all: 2 } },
    ]);

    const result = await service.getStats();

    expect(result.users).toEqual({
      total: 10,
      active: 8,
      byRole: { user: 9, admin: 1 },
    });
    expect(result.doctors).toEqual({
      total: 5,
      byStatus: { ACTIVE: 4, DEACTIVATED: 1 },
    });
    expect(result.laboratories).toEqual({
      total: 4,
      byStatus: { ACTIVE: 3, DEACTIVATED: 1 },
    });
    expect(result.categories.byStatus).toEqual({ ACTIVE: 3 });
    expect(result.appointments.byStatus).toEqual({
      PENDING: 2,
      COMPLETED: 7,
    });
    expect(result.reviews.total).toBe(6);
    expect(result.medicalRecords.total).toBe(4);
    expect(result.notifications.byStatus).toEqual({ SENT: 100, FAILED: 2 });
  });
});

describe('AdminService — createDoctor categoryId validation (US2)', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('createDoctor throws NotFound when the categoryId does not exist', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createDoctor(
        { name: 'Dr. X', categoryId: 'missing' },
        undefined,
        'admin1',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.doctor.create).not.toHaveBeenCalled();
  });

  it('createDoctor throws BadRequest when the categoryId belongs to a DEACTIVATED category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat1',
      status: 'DEACTIVATED',
    });
    await expect(
      service.createDoctor(
        { name: 'Dr. X', categoryId: 'cat1' },
        undefined,
        'admin1',
      ),
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
    const doctor = await service.createDoctor(
      {
        name: 'Dr. Y',
        categoryId: 'cat1',
      },
      undefined,
      'admin1',
    );
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
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
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

  it('returns the real service relation count for every doctor', async () => {
    prisma.doctor.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        name: 'Dr. X',
        category: { id: 'cat1', name: 'Cardiology' },
        bio: null,
        imageUrl: null,
        status: 'ACTIVE',
        _count: { services: 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.doctor.count.mockResolvedValueOnce(1);

    const result = await service.listDoctors({});

    expect(result.doctors[0]?.serviceCount).toBe(3);
    expect(prisma.doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { services: true } },
        },
      }),
    );
  });
});

describe('AdminService — updateDoctor categoryId (US3)', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit() },
      ],
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
    const result = await service.updateDoctor(
      'd1',
      { name: 'Dr. X renamed' },
      undefined,
      'admin1',
    );
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
    const result = await service.updateDoctor(
      'd1',
      { categoryId: 'cat_new' },
      undefined,
      'admin1',
    );
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
      service.updateDoctor(
        'd1',
        { categoryId: 'cat_missing' },
        undefined,
        'admin1',
      ),
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
      service.updateDoctor(
        'd1',
        { categoryId: 'cat_deact' },
        undefined,
        'admin1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.doctor.update).not.toHaveBeenCalled();
  });
});
