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

// helper import
import { NotFoundException } from '@nestjs/common';
