import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  REVIEW_POSTED,
  type ReviewPostedPayload,
} from '../common/events/domain-events.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ListReviewsDto } from './dto/list-reviews.dto.js';
import {
  type ListReviewsResult,
  type ReviewResponseDto,
} from './dto/review-response.dto.js';

type DoctorRef = { id: string; name: string };
type ReviewRecord = {
  id: string;
  appointmentId: string;
  doctorId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  doctor: DoctorRef;
  user: { id: string; name: string };
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emitter?: EventEmitter2,
  ) {}

  // =========================================================================
  // Patient — create review
  // =========================================================================

  async createReview(
    userId: string,
    appointmentId: string,
    dto: CreateReviewDto,
  ): Promise<{ review: ReviewResponseDto }> {
    // Pre-flight checks: appointment exists, is owned by caller, and is
    // COMPLETED. The "review already exists" check is folded into the
    // create via the unique constraint on Review.appointmentId (see the
    // try/catch below) — a separate findUnique here would race with a
    // concurrent submitter and surface a 500 on P2002.
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        userId: true,
        doctorId: true,
        status: true,
        doctor: { select: { id: true, name: true } },
      },
    });
    if (!appointment || appointment.userId !== userId) {
      throw new NotFoundException('Appointment not found');
    }
    if (appointment.status !== 'COMPLETED') {
      throw new ConflictException({
        message: 'Reviews can only be left for COMPLETED appointments',
        error: 'appointment_not_completed',
      });
    }
    let created: {
      id: string;
      appointmentId: string;
      userId: string;
      doctorId: string;
      rating: number;
      comment: string | null;
      createdAt: Date;
      updatedAt: Date;
      doctor: { id: string; name: string };
      user: { id: string; name: string };
    };
    try {
      created = await this.prisma.review.create({
        data: {
          appointmentId,
          userId,
          doctorId: appointment.doctorId,
          rating: dto.rating,
          comment: dto.comment ?? null,
        },
        include: {
          doctor: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'A review already exists for this appointment',
          error: 'review_already_exists',
        });
      }
      throw err;
    }
    const review = this.toResponse(created);
    if (this.emitter) {
      const payload: ReviewPostedPayload = {
        reviewId: review.id,
        appointmentId,
        userId,
        doctorId: review.doctor.id,
        doctorName: review.doctor.name,
        rating: review.rating,
        comment: review.comment,
      };
      try {
        this.emitter.emit(REVIEW_POSTED, payload);
      } catch {
        // Side-effect dispatch must never block the primary operation.
      }
    }
    return { review };
  }

  // =========================================================================
  // Public — list reviews for a doctor + aggregate rating
  // =========================================================================

  async listDoctorReviews(
    doctorId: string,
    query: ListReviewsDto,
  ): Promise<ListReviewsResult> {
    const doctorExists = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { id: true, status: true },
    });
    if (!doctorExists) {
      throw new NotFoundException('Doctor not found');
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = { doctorId };
    const [records, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          appointmentId: true,
          doctorId: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          doctor: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where: { doctorId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return {
      reviews: records.map((r) => this.toResponse(r)),
      total,
      page,
      pageSize,
      averageRating: agg._avg.rating ?? null,
    };
  }

  /**
   * Lightweight aggregate used by the doctor-profile endpoint. Returns
   * null when the doctor has no reviews so the caller can omit the field
   * rather than render a misleading 0.0.
   */
  // =========================================================================
  // Admin — list / delete reviews (moderation surface)
  // =========================================================================

  async listAdminReviews(query: {
    doctorId?: string;
    userId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ListReviewsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.doctorId) where.doctorId = query.doctorId;
    if (query.userId) where.userId = query.userId;
    // Compute the aggregate rating against the same filter as the list
    // (not the page) so a `doctorId` filter yields a stable per-doctor
    // average, and an unfiltered call yields null (page may span many
    // doctors so a single "average" is misleading).
    const shouldComputeAverage = Boolean(query.doctorId);
    const [records, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          appointmentId: true,
          doctorId: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          doctor: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.review.count({ where }),
      shouldComputeAverage
        ? this.prisma.review.aggregate({
            where: { doctorId: query.doctorId },
            _avg: { rating: true },
          })
        : Promise.resolve(null),
    ]);
    const averageRating = agg?._avg.rating ?? null;
    return {
      reviews: records.map((r) => this.toResponse(r)),
      total,
      page,
      pageSize,
      averageRating,
    };
  }

  async deleteReview(id: string): Promise<void> {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    await this.prisma.review.delete({ where: { id } });
  }

  // =========================================================================
  // Internal — patient-scoped access (used by medical-history later)
  // =========================================================================

  // =========================================================================
  // Helpers
  // =========================================================================

  private toResponse(r: ReviewRecord): ReviewResponseDto {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      doctor: { id: r.doctor.id, name: r.doctor.name },
      rating: r.rating,
      comment: r.comment,
      authorName: r.user.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
