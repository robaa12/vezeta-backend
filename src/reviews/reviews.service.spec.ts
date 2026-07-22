import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      appointment: { findUnique: jest.fn() },
      review: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        delete: jest.fn(),
      },
      doctor: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ReviewsService);
  });

  describe('createReview', () => {
    it('returns 404 when the appointment does not exist', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(
        service.createReview('u1', 'a1', { rating: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 404 when the appointment belongs to another patient (info disclosure)', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u2',
        doctorId: 'd1',
        status: 'COMPLETED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(
        service.createReview('u1', 'a1', { rating: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 when the appointment is not COMPLETED', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'CONFIRMED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(
        service.createReview('u1', 'a1', { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 409 when a review already exists (P2002 from unique constraint)', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      (prisma['review'].create as jest.Mock).mockRejectedValueOnce(p2002);
      await expect(
        service.createReview('u1', 'a1', { rating: 4 }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows non-P2002 Prisma errors from create', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const otherError = new Error('disk full');
      (prisma['review'].create as jest.Mock).mockRejectedValueOnce(otherError);
      await expect(
        service.createReview('u1', 'a1', { rating: 4 }),
      ).rejects.toThrow('disk full');
    });

    it('succeeds on the happy path and stores the doctorId from the appointment', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      (prisma['review'].create as jest.Mock).mockResolvedValueOnce({
        id: 'r1',
        appointmentId: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        rating: 5,
        comment: 'Great',
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: { id: 'd1', name: 'Dr. X' },
        user: { id: 'u1', name: 'Patient One' },
      });
      const result = await service.createReview('u1', 'a1', {
        rating: 5,
        comment: 'Great',
      });
      expect(result.review.id).toBe('r1');
      expect(result.review.rating).toBe(5);
      expect(result.review.authorName).toBe('Patient One');
      const createArgs = (prisma['review'].create as jest.Mock).mock
        .calls[0]?.[0];
      expect(createArgs).toMatchObject({
        data: {
          appointmentId: 'a1',
          userId: 'u1',
          doctorId: 'd1',
          rating: 5,
          comment: 'Great',
        },
      });
    });
  });

  describe('listDoctorReviews', () => {
    it('returns 404 when the doctor is missing', async () => {
      (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.listDoctorReviews('d1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns paginated reviews + aggregate averageRating', async () => {
      (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'd1',
        status: 'ACTIVE',
      });
      (prisma['review'].findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'r1',
          appointmentId: 'a1',
          userId: 'u1',
          doctorId: 'd1',
          rating: 4,
          comment: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          doctor: { id: 'd1', name: 'Dr. X' },
          user: { id: 'u1', name: 'Patient One' },
        },
      ]);
      (prisma['review'].count as jest.Mock).mockResolvedValueOnce(1);
      (prisma['review'].aggregate as jest.Mock).mockResolvedValueOnce({
        _avg: { rating: 4 },
        _count: { _all: 1 },
      });
      const result = await service.listDoctorReviews('d1', {});
      expect(result.reviews).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.averageRating).toBe(4);
    });

    it('returns null averageRating when doctor has no reviews', async () => {
      (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'd1',
        status: 'ACTIVE',
      });
      (prisma['review'].findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma['review'].count as jest.Mock).mockResolvedValueOnce(0);
      (prisma['review'].aggregate as jest.Mock).mockResolvedValueOnce({
        _avg: { rating: null },
        _count: { _all: 0 },
      });
      const result = await service.listDoctorReviews('d1', {});
      expect(result.reviews).toEqual([]);
      expect(result.averageRating).toBeNull();
    });
  });

  describe('deleteReview', () => {
    it('returns 404 when the review does not exist', async () => {
      (prisma['review'].findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.deleteReview('r1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma['review'].delete).not.toHaveBeenCalled();
    });

    it('deletes the review on the happy path', async () => {
      (prisma['review'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'r1',
      });
      (prisma['review'].delete as jest.Mock).mockResolvedValueOnce({});
      await service.deleteReview('r1');
      expect(prisma['review'].delete).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
    });
  });
});
