import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppointmentsService } from './appointments.service.js';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('boots', () => {
    expect(service).toBeDefined();
  });
});

describe('AppointmentsService — listPublicSlots (US1)', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('returns AVAILABLE slots for ACTIVE doctors in ACTIVE categories, sorted ascending', async () => {
    (prisma['doctorSlot'].findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 's2',
        doctorId: 'd1',
        startsAt: new Date('2026-08-01T10:00:00Z'),
        endsAt: new Date('2026-08-01T10:30:00Z'),
        status: 'AVAILABLE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 's1',
        doctorId: 'd1',
        startsAt: new Date('2026-08-01T09:00:00Z'),
        endsAt: new Date('2026-08-01T09:30:00Z'),
        status: 'AVAILABLE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const result = await service.listPublicSlots('d1');
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]?.id).toBe('s2');
    expect(result.slots[1]?.id).toBe('s1');
    const args = (prisma['doctorSlot'].findMany as jest.Mock).mock
      .calls[0]?.[0];
    expect(args).toMatchObject({
      where: {
        doctorId: 'd1',
        status: 'AVAILABLE',
        doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
      },
      orderBy: { startsAt: 'asc' },
    });
  });

  it('returns 404 when no slots exist and the doctor is missing or deactivated', async () => {
    (prisma['doctorSlot'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.listPublicSlots('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when the doctor is DEACTIVATED', async () => {
    (prisma['doctorSlot'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      status: 'DEACTIVATED',
      category: { status: 'ACTIVE' },
    });
    await expect(service.listPublicSlots('d1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns 404 when the doctor's category is DEACTIVATED", async () => {
    (prisma['doctorSlot'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      status: 'ACTIVE',
      category: { status: 'DEACTIVATED' },
    });
    await expect(service.listPublicSlots('d1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns an empty array when no slots exist and the doctor is ACTIVE', async () => {
    (prisma['doctorSlot'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    });
    const result = await service.listPublicSlots('d1');
    expect(result.slots).toEqual([]);
  });
});

describe('AppointmentsService — admin slot CRUD (US8)', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('createSlot rejects non-existent doctor (404)', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      service.createSlot('missing', {
        startsAt: new Date(Date.now() + 3600_000),
        endsAt: new Date(Date.now() + 3600_000 + 1800_000),
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createSlot rejects DEACTIVATED doctor (400)', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'd1',
      status: 'DEACTIVATED',
      category: { status: 'ACTIVE' },
    });
    await expect(
      service.createSlot('d1', {
        startsAt: new Date(Date.now() + 3600_000),
        endsAt: new Date(Date.now() + 3600_000 + 1800_000),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSlot rejects DEACTIVATED category (400)', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'd1',
      status: 'ACTIVE',
      category: { status: 'DEACTIVATED' },
    });
    await expect(
      service.createSlot('d1', {
        startsAt: new Date(Date.now() + 3600_000),
        endsAt: new Date(Date.now() + 3600_000 + 1800_000),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSlot rejects past-time slot (400)', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'd1',
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    });
    await expect(
      service.createSlot('d1', {
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() - 3600_000 + 1800_000),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSlot rejects endsAt <= startsAt (400)', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'd1',
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    });
    const start = new Date(Date.now() + 3600_000);
    await expect(
      service.createSlot('d1', { startsAt: start, endsAt: start }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSlot succeeds with valid input', async () => {
    (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'd1',
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    });
    (prisma['doctorSlot'].create as jest.Mock).mockResolvedValueOnce({
      id: 's1',
      doctorId: 'd1',
      startsAt: new Date(Date.now() + 3600_000),
      endsAt: new Date(Date.now() + 3600_000 + 1800_000),
      status: 'AVAILABLE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const slot = await service.createSlot('d1', {
      startsAt: new Date(Date.now() + 3600_000),
      endsAt: new Date(Date.now() + 3600_000 + 1800_000),
    });
    expect(slot.status).toBe('AVAILABLE');
  });

  it('blockSlot is idempotent for an already-BLOCKED slot', async () => {
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
      doctorId: 'd1',
      status: 'BLOCKED',
      startsAt: new Date(),
      endsAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.blockSlot('s1');
    expect(result.status).toBe('BLOCKED');
    expect(prisma['doctorSlot'].update).not.toHaveBeenCalled();
  });

  it('blockSlot rejects a BOOKED slot (409)', async () => {
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
      doctorId: 'd1',
      status: 'BOOKED',
      startsAt: new Date(),
      endsAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.blockSlot('s1')).rejects.toThrow(ConflictException);
  });

  it('deleteSlot rejects non-AVAILABLE slot (409)', async () => {
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
      doctorId: 'd1',
      status: 'BOOKED',
      startsAt: new Date(),
      endsAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.deleteSlot('s1')).rejects.toThrow(ConflictException);
    expect(prisma['doctorSlot'].delete).not.toHaveBeenCalled();
  });
});

describe('AppointmentsService — bookSlot (US2)', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;
  let txMock: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    txMock = {
      doctorSlot: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      appointment: {
        create: jest.fn(),
      },
    };
    (prisma['$transaction'] as jest.Mock).mockImplementation(
      async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('throws 403 when the user is deactivated', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: false,
    });
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma['$transaction']).not.toHaveBeenCalled();
  });

  it('throws 404 when the user does not exist', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the slot does not exist (pre-flight)', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.bookSlot('u1', { slotId: 'missing' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma['$transaction']).not.toHaveBeenCalled();
  });

  it('throws 409 when the conditional updateMany returns count 0 (slot already booked)', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
    });
    (txMock['doctorSlot']['updateMany'] as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      ConflictException,
    );
    expect(txMock['doctorSlot']['findUniqueOrThrow']).not.toHaveBeenCalled();
  });

  it('throws 400 when the slot is in the past', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
    });
    (txMock['doctorSlot']['updateMany'] as jest.Mock).mockResolvedValueOnce({
      count: 1,
    });
    (
      txMock['doctorSlot']['findUniqueOrThrow'] as jest.Mock
    ).mockResolvedValueOnce({
      doctorId: 'd1',
      startsAt: new Date(Date.now() - 3600_000),
      doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
    });
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws 400 when the doctor is DEACTIVATED', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
    });
    (txMock['doctorSlot']['updateMany'] as jest.Mock).mockResolvedValueOnce({
      count: 1,
    });
    (
      txMock['doctorSlot']['findUniqueOrThrow'] as jest.Mock
    ).mockResolvedValueOnce({
      doctorId: 'd1',
      startsAt: new Date(Date.now() + 3600_000),
      doctor: { status: 'DEACTIVATED', category: { status: 'ACTIVE' } },
    });
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws 400 when the doctor's category is DEACTIVATED", async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
    });
    (txMock['doctorSlot']['updateMany'] as jest.Mock).mockResolvedValueOnce({
      count: 1,
    });
    (
      txMock['doctorSlot']['findUniqueOrThrow'] as jest.Mock
    ).mockResolvedValueOnce({
      doctorId: 'd1',
      startsAt: new Date(Date.now() + 3600_000),
      doctor: { status: 'ACTIVE', category: { status: 'DEACTIVATED' } },
    });
    await expect(service.bookSlot('u1', { slotId: 's1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('succeeds on the happy path: appointment created, slot BOOKED', async () => {
    (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
      isActive: true,
    });
    (prisma['doctorSlot'].findUnique as jest.Mock).mockResolvedValueOnce({
      id: 's1',
    });
    (txMock['doctorSlot']['updateMany'] as jest.Mock).mockResolvedValueOnce({
      count: 1,
    });
    (
      txMock['doctorSlot']['findUniqueOrThrow'] as jest.Mock
    ).mockResolvedValueOnce({
      doctorId: 'd1',
      startsAt: new Date(Date.now() + 3600_000),
      doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
    });
    (txMock['appointment']['create'] as jest.Mock).mockResolvedValueOnce({
      id: 'a1',
      status: 'PENDING',
      scheduledAt: new Date(Date.now() + 3600_000),
      patientNotes: 'checkup',
      adminNotes: null,
      cancelledAt: null,
      cancelledBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      doctor: {
        id: 'd1',
        name: 'Dr. X',
        category: { id: 'c1', name: 'Cardiology' },
      },
    });
    const result = await service.bookSlot('u1', {
      slotId: 's1',
      patientNotes: 'checkup',
    });
    expect(result.appointment.id).toBe('a1');
    expect(result.appointment.status).toBe('PENDING');
    expect(result.appointment.doctor.category.name).toBe('Cardiology');
    expect(txMock['doctorSlot']['updateMany']).toHaveBeenCalledWith({
      where: { id: 's1', status: 'AVAILABLE' },
      data: { status: 'BOOKED' },
    });
  });
});

describe('AppointmentsService — listMyAppointments (US4)', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('filters by userId (the WHERE clause must include the authenticated user)', async () => {
    (prisma['appointment'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['appointment'].count as jest.Mock).mockResolvedValueOnce(0);
    await service.listMyAppointments('u1', {});
    const where = (prisma['appointment'].findMany as jest.Mock).mock
      .calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ userId: 'u1' });
  });

  it('applies optional status filter', async () => {
    (prisma['appointment'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['appointment'].count as jest.Mock).mockResolvedValueOnce(0);
    await service.listMyAppointments('u1', { status: 'CONFIRMED' });
    const where = (prisma['appointment'].findMany as jest.Mock).mock
      .calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ userId: 'u1', status: 'CONFIRMED' });
  });

  it('paginates with default page=1 pageSize=20', async () => {
    (prisma['appointment'].findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma['appointment'].count as jest.Mock).mockResolvedValueOnce(0);
    await service.listMyAppointments('u1', {});
    const args = (prisma['appointment'].findMany as jest.Mock).mock
      .calls[0]?.[0];
    expect(args).toMatchObject({
      skip: 0,
      take: 20,
      orderBy: { scheduledAt: 'asc' },
    });
  });
});

// helper import
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
