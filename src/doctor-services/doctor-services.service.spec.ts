import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DoctorServicesService } from './doctor-services.service.js';

const mockPrisma = () => {
  return {
    doctorService: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
    },
  };
};

const baseService = {
  id: 's1',
  doctorId: 'd1',
  name: 'Consultation',
  price: new Prisma.Decimal('150.00'),
  discountPercent: 10,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-22T10:00:00Z'),
  updatedAt: new Date('2026-07-22T10:00:00Z'),
};

describe('DoctorServicesService — listForDoctor', () => {
  let service: DoctorServicesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorServicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DoctorServicesService);
  });

  it('throws 404 when the doctor does not exist', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce(null);
    await expect(service.listForDoctor('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns paginated services with default page/pageSize', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    prisma.doctorService.findMany.mockResolvedValueOnce([baseService]);
    prisma.doctorService.count.mockResolvedValueOnce(1);
    const result = await service.listForDoctor('d1', {});
    expect(result.services).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('applies status filter when supplied', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    prisma.doctorService.findMany.mockResolvedValueOnce([]);
    prisma.doctorService.count.mockResolvedValueOnce(0);
    await service.listForDoctor('d1', { status: 'DEACTIVATED' });
    const where = prisma.doctorService.findMany.mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toMatchObject({ doctorId: 'd1', status: 'DEACTIVATED' });
  });

  it('converts Decimal price to number and computes finalPrice', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    prisma.doctorService.findMany.mockResolvedValueOnce([baseService]);
    prisma.doctorService.count.mockResolvedValueOnce(1);
    const result = await service.listForDoctor('d1', {});
    expect(result.services[0]).toMatchObject({
      price: 150,
      discountPercent: 10,
      finalPrice: 135,
    });
  });
});

describe('DoctorServicesService — createForDoctor', () => {
  let service: DoctorServicesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorServicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DoctorServicesService);
  });

  it('throws 404 when the doctor does not exist', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createForDoctor('missing', { name: 'Consultation' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 400 when discount is supplied without a price', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    await expect(
      service.createForDoctor('d1', {
        name: 'Consultation',
        discountPercent: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a service with defaults (ACTIVE, no price, no discount)', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    prisma.doctorService.create.mockResolvedValueOnce({
      ...baseService,
      price: null,
      discountPercent: null,
    });
    const result = await service.createForDoctor('d1', { name: 'Checkup' });
    expect(result.status).toBe('ACTIVE');
    expect(result.price).toBeNull();
    expect(result.discountPercent).toBeNull();
    expect(result.finalPrice).toBeNull();
  });

  it('passes price as Decimal to Prisma (no float precision loss)', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    prisma.doctorService.create.mockResolvedValueOnce({
      ...baseService,
      price: new Prisma.Decimal('99.99'),
      discountPercent: null,
    });
    await service.createForDoctor('d1', {
      name: 'X-ray',
      price: 99.99,
    });
    const data = prisma.doctorService.create.mock.calls[0]?.[0]?.data as {
      price: Prisma.Decimal | null;
    };
    expect(data.price).toBeInstanceOf(Prisma.Decimal);
    expect(data.price?.toString()).toBe('99.99');
  });

  it('translates P2002 to a ConflictException', async () => {
    prisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd1' });
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    prisma.doctorService.create.mockRejectedValueOnce(err);
    await expect(
      service.createForDoctor('d1', { name: 'Consultation' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('DoctorServicesService — updateForDoctor', () => {
  let service: DoctorServicesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorServicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DoctorServicesService);
  });

  it('throws 404 when the service does not exist', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateForDoctor('d1', 'missing', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 400 when no fields are provided', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce(baseService);
    await expect(
      service.updateForDoctor('d1', 's1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when adding a discount while the existing price is null', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce({
      ...baseService,
      price: null,
      discountPercent: null,
    });
    await expect(
      service.updateForDoctor('d1', 's1', { discountPercent: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when clearing the price while a discount is set', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce({
      ...baseService,
      price: new Prisma.Decimal('100.00'),
      discountPercent: 10,
    });
    await expect(
      service.updateForDoctor('d1', 's1', { price: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows updating only the price when no discount is set', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce({
      ...baseService,
      discountPercent: null,
    });
    prisma.doctorService.update.mockResolvedValueOnce({
      ...baseService,
      price: new Prisma.Decimal('200.00'),
      discountPercent: null,
    });
    const result = await service.updateForDoctor('d1', 's1', { price: 200 });
    expect(result.price).toBe(200);
  });
});

describe('DoctorServicesService — deactivateForDoctor', () => {
  let service: DoctorServicesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorServicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DoctorServicesService);
  });

  it('is idempotent (returns the existing record when already DEACTIVATED)', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce({
      ...baseService,
      status: 'DEACTIVATED',
    });
    const result = await service.deactivateForDoctor('d1', 's1');
    expect(result.status).toBe('DEACTIVATED');
    expect(prisma.doctorService.update).not.toHaveBeenCalled();
  });

  it('updates when ACTIVE', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce(baseService);
    prisma.doctorService.update.mockResolvedValueOnce({
      ...baseService,
      status: 'DEACTIVATED',
    });
    const result = await service.deactivateForDoctor('d1', 's1');
    expect(result.status).toBe('DEACTIVATED');
  });
});

describe('DoctorServicesService — deleteForDoctor', () => {
  let service: DoctorServicesService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorServicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DoctorServicesService);
  });

  it('throws 404 when the service does not exist', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.deleteForDoctor('d1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hard-deletes when the service exists', async () => {
    prisma.doctorService.findFirst.mockResolvedValueOnce(baseService);
    prisma.doctorService.delete.mockResolvedValueOnce(baseService);
    await expect(service.deleteForDoctor('d1', 's1')).resolves.toBeUndefined();
    expect(prisma.doctorService.delete).toHaveBeenCalledWith({
      where: { id: 's1' },
    });
  });
});
