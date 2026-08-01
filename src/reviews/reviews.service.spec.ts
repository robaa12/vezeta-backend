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
    it('returns 404 when the doctor is not publicly active', async () => {
      (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
        status: 'DEACTIVATED',
        category: { status: 'ACTIVE' },
      });

      await expect(service.listDoctorReviews('d1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns reviews and the aggregate rating for an active doctor', async () => {
      const createdAt = new Date('2026-07-26T10:00:00Z');
      (prisma['doctor'].findUnique as jest.Mock).mockResolvedValueOnce({
        status: 'ACTIVE',
        category: { status: 'ACTIVE' },
      });
      (prisma['review'].findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'r1',
          appointmentId: 'a1',
          doctorId: 'd1',
          rating: 5,
          comment: 'Excellent visit',
          createdAt,
          updatedAt: createdAt,
          doctor: { id: 'd1', name: 'Dr. X' },
          user: { id: 'u1', name: 'Patient One' },
        },
      ]);
      (prisma['review'].count as jest.Mock).mockResolvedValueOnce(1);
      (prisma['review'].aggregate as jest.Mock).mockResolvedValueOnce({
        _avg: { rating: 5 },
      });

      const result = await service.listDoctorReviews('d1', {
        page: 1,
        pageSize: 5,
      });

      expect(result).toMatchObject({
        total: 1,
        page: 1,
        pageSize: 5,
        averageRating: 5,
      });
      expect(result.reviews[0]).toMatchObject({
        rating: 5,
        comment: 'Excellent visit',
        authorName: 'Patient One',
      });
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
