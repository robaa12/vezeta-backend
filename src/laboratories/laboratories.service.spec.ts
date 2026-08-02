import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { LaboratoriesService } from './laboratories.service.js';

const createService = () => {
  const prisma = {
    laboratory: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    laboratoryReview: { findMany: jest.fn() },
    laboratoryService: { findFirst: jest.fn() },
    laboratoryBooking: { aggregate: jest.fn(), create: jest.fn() },
  };
  return {
    prisma,
    service: new LaboratoriesService(prisma as unknown as PrismaService),
  };
};

describe('LaboratoriesService', () => {
  it('searches the same laboratory and test fields as the catalog page', async () => {
    const { prisma, service } = createService();
    prisma.laboratory.findMany.mockResolvedValue([]);
    prisma.laboratory.count.mockResolvedValue(0);

    await service.list({ search: 'thyroid', city: 'Cairo' });

    expect(prisma.laboratory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          city: 'Cairo',
          OR: expect.arrayContaining([
            {
              services: {
                some: {
                  name: { contains: 'thyroid', mode: 'insensitive' },
                  status: 'ACTIVE',
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('creates a confirmed booking for an active laboratory service', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryService.findFirst.mockResolvedValue({
      id: 'alpha-cbc',
      name: 'Complete Blood Count',
      price: { toNumber: () => 260 },
      laboratory: { name: 'Alpha Diagnostics' },
    });
    prisma.laboratoryBooking.create.mockResolvedValue({
      id: 'booking-1',
      status: 'CONFIRMED',
      queueNumber: 7,
    });
    prisma.laboratoryBooking.aggregate.mockResolvedValue({
      _max: { queueNumber: 6 },
    });
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const date = future.toISOString().slice(0, 10);

    const result = await service.book('user-1', 'alpha-diagnostics', {
      serviceId: 'alpha-cbc',
      date,
    });

    expect(prisma.laboratoryBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ queueNumber: 7 }),
      }),
    );
    expect(result.booking).toMatchObject({
      laboratoryName: 'Alpha Diagnostics',
      serviceName: 'Complete Blood Count',
      price: 260,
    });
  });

  it('rejects reservations outside the 60-day booking window', async () => {
    const { service } = createService();

    await expect(
      service.book('user-1', 'alpha-diagnostics', {
        serviceId: 'alpha-cbc',
        date: '2020-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
