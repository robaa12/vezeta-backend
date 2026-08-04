import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { LaboratoriesService } from './laboratories.service.js';

const createService = () => {
  const prisma = {
    laboratory: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    laboratoryReview: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    laboratoryService: { findFirst: jest.fn() },
    laboratoryBooking: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
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

  it('filters the admin list by status and searches location fields', async () => {
    const { prisma, service } = createService();
    prisma.laboratory.findMany.mockResolvedValue([]);
    prisma.laboratory.count.mockResolvedValue(0);

    await service.listAdmin({ search: 'Cairo', status: 'DEACTIVATED' });

    expect(prisma.laboratory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DEACTIVATED',
          OR: expect.arrayContaining([
            { city: { contains: 'Cairo', mode: 'insensitive' } },
            { address: { contains: 'Cairo', mode: 'insensitive' } },
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
      laboratory: {
        name: 'Alpha Diagnostics',
        workingDays: [
          'SATURDAY',
          'SUNDAY',
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
        ],
        opensAt: '10:00',
        closesAt: '20:00',
      },
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
      opensAt: '10:00',
      closesAt: '20:00',
    });
  });

  it('rejects a reservation on a laboratory closed day', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryService.findFirst.mockResolvedValue({
      id: 'alpha-cbc',
      name: 'Complete Blood Count',
      price: { toNumber: () => 260 },
      laboratory: {
        name: 'Alpha Diagnostics',
        workingDays: ['MONDAY'],
        opensAt: '10:00',
        closesAt: '20:00',
      },
    });
    const closedDate = new Date();
    closedDate.setDate(closedDate.getDate() + 1);
    while (closedDate.getUTCDay() === 1) {
      closedDate.setDate(closedDate.getDate() + 1);
    }

    await expect(
      service.book('user-1', 'alpha-diagnostics', {
        serviceId: 'alpha-cbc',
        date: closedDate.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow('choose one of its working days');
    expect(prisma.laboratoryBooking.create).not.toHaveBeenCalled();
  });

  it('rejects a schedule whose closing time is not later', async () => {
    const { service } = createService();
    await expect(
      service.create({
        opensAt: '20:00',
        closesAt: '10:00',
      } as never),
    ).rejects.toThrow('closing time must be later');
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

  it('scopes the user laboratory list by the authenticated user id', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryBooking.findMany.mockResolvedValue([
      {
        id: 'booking-1',
        service: { id: 'service-1', price: { toNumber: () => 250 } },
      },
    ]);
    prisma.laboratoryBooking.count.mockResolvedValue(1);

    const result = await service.listMyBookings('user-1', { pageSize: 20 });

    expect(prisma.laboratoryBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(result.bookings[0]).toMatchObject({
      id: 'booking-1',
      service: { price: 250 },
    });
  });

  it('loads a booking detail only when it belongs to the user', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryBooking.findFirst.mockResolvedValue(null);

    await expect(
      service.getMyBooking('user-1', 'another-users-booking'),
    ).rejects.toThrow('Laboratory booking not found');
    expect(prisma.laboratoryBooking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'another-users-booking', userId: 'user-1' },
      }),
    );
  });

  it('creates one review for a completed laboratory visit and refreshes its rating', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      laboratoryId: 'lab-1',
      status: 'COMPLETED',
      user: { name: 'Patient One' },
    });
    prisma.laboratoryReview.create.mockResolvedValue({ id: 'review-1' });
    prisma.laboratoryReview.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 2 },
    });
    prisma.laboratory.update.mockResolvedValue({});

    const result = await service.createMyReview('user-1', 'booking-1', {
      rating: 5,
      comment: 'Excellent care',
    });

    expect(result.review).toEqual({ id: 'review-1' });
    expect(prisma.laboratoryReview.create).toHaveBeenCalledWith({
      data: {
        laboratoryBookingId: 'booking-1',
        laboratoryId: 'lab-1',
        authorName: 'Patient One',
        rating: 5,
        comment: 'Excellent care',
      },
    });
    expect(prisma.laboratory.update).toHaveBeenCalledWith({
      where: { id: 'lab-1' },
      data: { rating: 4.5, reviewCount: 2 },
    });
  });

  it('does not allow reviews before a laboratory visit is completed', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      laboratoryId: 'lab-1',
      status: 'CONFIRMED',
      user: { name: 'Patient One' },
    });

    await expect(
      service.createMyReview('user-1', 'booking-1', { rating: 5 }),
    ).rejects.toThrow('Reviews can only be left for completed laboratory visits');
    expect(prisma.laboratoryReview.create).not.toHaveBeenCalled();
  });

  it('lists laboratory reviews for admins with an aggregate rating', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryReview.findMany.mockResolvedValue([{ id: 'review-1' }]);
    prisma.laboratoryReview.count.mockResolvedValue(1);
    prisma.laboratoryReview.aggregate.mockResolvedValue({
      _avg: { rating: 4 },
    });

    const result = await service.listAdminReviews({ laboratoryId: 'lab-1' });

    expect(result).toMatchObject({
      reviews: [{ id: 'review-1' }],
      total: 1,
      averageRating: 4,
    });
    expect(prisma.laboratoryReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { laboratoryId: 'lab-1' } }),
    );
  });

  it('recalculates the laboratory rating after an admin deletes a review', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryReview.findUnique.mockResolvedValue({
      id: 'review-1',
      laboratoryId: 'lab-1',
    });
    prisma.laboratoryReview.delete.mockResolvedValue({});
    prisma.laboratoryReview.aggregate.mockResolvedValue({
      _avg: { rating: 3.5 },
      _count: { _all: 2 },
    });
    prisma.laboratory.update.mockResolvedValue({});

    await service.deleteAdminReview('review-1');

    expect(prisma.laboratoryReview.delete).toHaveBeenCalledWith({
      where: { id: 'review-1' },
    });
    expect(prisma.laboratory.update).toHaveBeenCalledWith({
      where: { id: 'lab-1' },
      data: { rating: 3.5, reviewCount: 2 },
    });
  });

  it('includes patient contact fields in the admin laboratory list', async () => {
    const { prisma, service } = createService();
    prisma.laboratoryBooking.findMany.mockResolvedValue([]);
    prisma.laboratoryBooking.count.mockResolvedValue(0);

    await service.listAdminBookings({ search: '010' });

    expect(prisma.laboratoryBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              user: {
                phoneNumber: { contains: '010', mode: 'insensitive' },
              },
            },
          ]),
        }),
        select: expect.objectContaining({
          user: {
            select: expect.objectContaining({
              name: true,
              email: true,
              phoneNumber: true,
            }),
          },
        }),
      }),
    );
  });
});
