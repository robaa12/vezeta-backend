import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookLaboratoryVisitDto } from './dto/book-laboratory-visit.dto.js';
import { CreateReviewDto } from '../reviews/dto/create-review.dto.js';
import { ListLaboratoriesDto } from './dto/list-laboratories.dto.js';
import { ListLaboratoryBookingsDto } from './dto/list-laboratory-bookings.dto.js';
import { ListLaboratoryReviewsDto } from './dto/list-laboratory-reviews.dto.js';
import {
  CreateLaboratoryDto,
  LaboratoryServiceDto,
  UpdateLaboratoryDto,
} from './dto/manage-laboratory.dto.js';
import { saveLaboratoryImage } from '../upload/multer.config.js';
import { buildLaboratoryGoogleMapsUrl } from './laboratory-location.js';

@Injectable()
export class LaboratoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLaboratoriesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { status: 'ACTIVE' };

    if (query.city) where.city = query.city;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        {
          services: {
            some: {
              name: { contains: search, mode: 'insensitive' },
              status: 'ACTIVE',
            },
          },
        },
      ];
    }

    const [laboratories, total] = await Promise.all([
      this.prisma.laboratory.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.laboratory.count({ where }),
    ]);
    return {
      laboratories: laboratories.map((laboratory) =>
        this.toLaboratoryRecord(laboratory),
      ),
      total,
      page,
      pageSize,
    };
  }

  async listAdmin(query: ListLaboratoriesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.city) where.city = query.city;
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [laboratories, total] = await Promise.all([
      this.prisma.laboratory.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { services: { orderBy: { name: 'asc' } } },
      }),
      this.prisma.laboratory.count({ where }),
    ]);
    return {
      laboratories: laboratories.map((laboratory) =>
        this.toLaboratoryRecord(laboratory),
      ),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateLaboratoryDto, image?: Express.Multer.File) {
    this.validateOperatingHours(dto.opensAt, dto.closesAt);
    this.assertCoordinatesConsistent(dto.latitude, dto.longitude);
    const imageUrl = image ? await saveLaboratoryImage(image) : null;
    try {
      const laboratory = await this.prisma.laboratory.create({
        data: { ...dto, imageUrl },
      });
      return this.toLaboratoryRecord(laboratory);
    } catch (error) {
      if (imageUrl) await this.deleteLaboratoryImage(imageUrl);
      throw error;
    }
  }

  async getAdmin(id: string) {
    const laboratory = await this.prisma.laboratory.findUnique({
      where: { id },
      include: { services: { orderBy: { name: 'asc' } }, reviews: true },
    });
    if (!laboratory) throw new NotFoundException('Laboratory not found');
    return this.toLaboratoryRecord(laboratory);
  }

  async update(
    id: string,
    dto: UpdateLaboratoryDto,
    image?: Express.Multer.File,
  ) {
    const laboratory = await this.getAdmin(id);
    this.validateOperatingHours(
      dto.opensAt ?? laboratory.opensAt,
      dto.closesAt ?? laboratory.closesAt,
    );
    this.assertCoordinatesConsistentForUpdate(
      dto.latitude,
      dto.longitude,
      laboratory.latitude,
      laboratory.longitude,
    );
    const imageUrl = image ? await saveLaboratoryImage(image) : null;
    const data = { ...dto, ...(imageUrl ? { imageUrl } : {}) };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const updated = await this.prisma.laboratory.update({
        where: { id },
        data,
      });
      if (imageUrl && laboratory.imageUrl) {
        void this.deleteLaboratoryImage(laboratory.imageUrl).catch(() => {});
      }
      return this.toLaboratoryRecord(updated);
    } catch (error) {
      if (imageUrl) await this.deleteLaboratoryImage(imageUrl);
      throw error;
    }
  }

  async setStatus(id: string, status: 'ACTIVE' | 'DEACTIVATED') {
    const laboratory = await this.getAdmin(id);
    if (laboratory.status === status) {
      throw new ConflictException(
        `Laboratory is already ${status.toLowerCase()}`,
      );
    }
    const updated = await this.prisma.laboratory.update({
      where: { id },
      data: { status },
    });
    return this.toLaboratoryRecord(updated);
  }

  async delete(id: string): Promise<void> {
    const laboratory = await this.getAdmin(id);
    const bookings = await this.prisma.laboratoryBooking.count({
      where: { laboratoryId: id },
    });
    if (bookings > 0)
      throw new ConflictException(
        'Cannot delete a laboratory with bookings; deactivate it instead',
      );
    try {
      await this.prisma.laboratory.delete({ where: { id } });
      if (laboratory.imageUrl) {
        void this.deleteLaboratoryImage(laboratory.imageUrl).catch(() => {});
      }
    } catch {
      throw new NotFoundException('Laboratory not found');
    }
  }

  async createService(laboratoryId: string, dto: LaboratoryServiceDto) {
    await this.getAdmin(laboratoryId);
    return this.prisma.laboratoryService.create({
      data: {
        laboratoryId,
        ...dto,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async updateService(
    laboratoryId: string,
    serviceId: string,
    dto: Partial<LaboratoryServiceDto>,
  ) {
    const service = await this.prisma.laboratoryService.findFirst({
      where: { id: serviceId, laboratoryId },
    });
    if (!service) throw new NotFoundException('Laboratory service not found');
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('No fields to update');
    return this.prisma.laboratoryService.update({
      where: { id: serviceId },
      data: dto,
    });
  }

  async deleteService(laboratoryId: string, serviceId: string): Promise<void> {
    const service = await this.prisma.laboratoryService.findFirst({
      where: { id: serviceId, laboratoryId },
    });
    if (!service) throw new NotFoundException('Laboratory service not found');
    const bookings = await this.prisma.laboratoryBooking.count({
      where: { laboratoryServiceId: serviceId },
    });
    if (bookings > 0)
      throw new ConflictException(
        'Cannot delete a service with bookings; deactivate it instead',
      );
    await this.prisma.laboratoryService.delete({ where: { id: serviceId } });
  }

  async get(id: string) {
    const laboratory = await this.prisma.laboratory.findFirst({
      where: { id, status: 'ACTIVE' },
      include: {
        services: {
          where: { status: 'ACTIVE' },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!laboratory) throw new NotFoundException('Laboratory not found');
    return this.toLaboratoryRecord(laboratory);
  }

  async listReviews(id: string) {
    await this.get(id);
    const reviews = await this.prisma.laboratoryReview.findMany({
      where: { laboratoryId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { reviews };
  }

  async listMyBookings(userId: string, query: ListLaboratoryBookingsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.LaboratoryBookingWhereInput = { userId };
    if (query.status) where.status = query.status;

    const [records, total] = await Promise.all([
      this.prisma.laboratoryBooking.findMany({
        where,
        orderBy: [{ reservationDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.bookingSelect(),
      }),
      this.prisma.laboratoryBooking.count({ where }),
    ]);

    return {
      bookings: records.map((booking) => this.toBookingResponse(booking)),
      total,
      page,
      pageSize,
    };
  }

  async getMyBooking(userId: string, id: string) {
    const booking = await this.prisma.laboratoryBooking.findFirst({
      where: { id, userId },
      select: this.bookingSelect(),
    });
    if (!booking) throw new NotFoundException('Laboratory booking not found');
    return { booking: this.toBookingResponse(booking) };
  }

  async cancelMyBooking(userId: string, id: string) {
    const result = await this.prisma.laboratoryBooking.updateMany({
      where: { id, userId, status: 'CONFIRMED' },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0) {
      const existing = await this.prisma.laboratoryBooking.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!existing)
        throw new NotFoundException('Laboratory booking not found');
      throw new ConflictException(
        'Only confirmed laboratory visits can be cancelled',
      );
    }
    return this.getMyBooking(userId, id);
  }

  async createMyReview(
    userId: string,
    bookingId: string,
    dto: CreateReviewDto,
  ) {
    const booking = await this.prisma.laboratoryBooking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        laboratoryId: true,
        status: true,
        user: { select: { name: true } },
      },
    });
    if (!booking) throw new NotFoundException('Laboratory booking not found');
    if (booking.status !== 'COMPLETED') {
      throw new ConflictException(
        'Reviews can only be left for completed laboratory visits',
      );
    }

    try {
      const review = await this.prisma.laboratoryReview.create({
        data: {
          laboratoryBookingId: booking.id,
          laboratoryId: booking.laboratoryId,
          authorName: booking.user.name,
          rating: dto.rating,
          comment: dto.comment ?? '',
        },
      });
      await this.refreshLaboratoryRating(booking.laboratoryId);
      return { review };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A review already exists for this laboratory visit');
      }
      throw error;
    }
  }

  async listAdminBookings(query: ListLaboratoryBookingsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.LaboratoryBookingWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.laboratoryId) where.laboratoryId = query.laboratoryId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phoneNumber: { contains: search, mode: 'insensitive' } } },
        { laboratory: { name: { contains: search, mode: 'insensitive' } } },
        { service: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.laboratoryBooking.findMany({
        where,
        orderBy: [{ reservationDate: 'desc' }, { queueNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.bookingSelect(true),
      }),
      this.prisma.laboratoryBooking.count({ where }),
    ]);

    return {
      bookings: records.map((booking) => this.toBookingResponse(booking)),
      total,
      page,
      pageSize,
    };
  }

  async listAdminReviews(query: ListLaboratoryReviewsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = query.laboratoryId
      ? { laboratoryId: query.laboratoryId }
      : {};
    const [reviews, total, aggregate] = await Promise.all([
      this.prisma.laboratoryReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          laboratoryId: true,
          authorName: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          laboratory: { select: { id: true, name: true } },
        },
      }),
      this.prisma.laboratoryReview.count({ where }),
      this.prisma.laboratoryReview.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);
    return {
      reviews,
      total,
      page,
      pageSize,
      averageRating: aggregate._avg.rating ?? null,
    };
  }

  async deleteAdminReview(id: string): Promise<void> {
    const review = await this.prisma.laboratoryReview.findUnique({
      where: { id },
      select: { id: true, laboratoryId: true },
    });
    if (!review) throw new NotFoundException('Laboratory review not found');
    await this.prisma.laboratoryReview.delete({ where: { id } });
    await this.refreshLaboratoryRating(review.laboratoryId);
  }

  async getAdminBooking(id: string) {
    const booking = await this.prisma.laboratoryBooking.findUnique({
      where: { id },
      select: this.bookingSelect(true),
    });
    if (!booking) throw new NotFoundException('Laboratory booking not found');
    return { booking: this.toBookingResponse(booking) };
  }

  completeBooking(id: string) {
    return this.transitionAdminBooking(id, 'COMPLETED');
  }

  cancelAdminBooking(id: string) {
    return this.transitionAdminBooking(id, 'CANCELLED');
  }

  private async transitionAdminBooking(
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
  ) {
    const result = await this.prisma.laboratoryBooking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status },
    });
    if (result.count === 0) {
      const existing = await this.prisma.laboratoryBooking.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing)
        throw new NotFoundException('Laboratory booking not found');
      throw new ConflictException(
        'Only confirmed laboratory visits can be updated',
      );
    }
    return this.getAdminBooking(id);
  }

  private bookingSelect(includeUser = false) {
    return {
      id: true,
      reservationDate: true,
      queueNumber: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      review: { select: { id: true } },
      laboratory: {
        select: {
          id: true,
          name: true,
          shortName: true,
          city: true,
          area: true,
          address: true,
          imageUrl: true,
          phone: true,
          accreditation: true,
          turnaround: true,
          workingDays: true,
          opensAt: true,
          closesAt: true,
          tone: true,
          status: true,
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          discountPercent: true,
          turnaround: true,
          preparation: true,
          status: true,
        },
      },
      ...(includeUser
        ? {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          }
        : {}),
    } as const;
  }

  private toBookingResponse(
    booking: {
      service: { price: Prisma.Decimal | null } & Record<string, unknown>;
    } & Record<string, unknown>,
  ) {
    const { review, ...bookingData } = booking;
    return {
      ...bookingData,
      hasReview: Boolean(review),
      service: {
        ...booking.service,
        price: booking.service.price?.toNumber() ?? null,
      },
    };
  }

  async book(
    userId: string,
    laboratoryId: string,
    dto: BookLaboratoryVisitDto,
  ) {
    const reservationDate = this.parseReservationDate(dto.date);
    const service = await this.prisma.laboratoryService.findFirst({
      where: {
        id: dto.serviceId,
        laboratoryId,
        status: 'ACTIVE',
        laboratory: { status: 'ACTIVE' },
      },
      include: {
        laboratory: {
          select: {
            name: true,
            workingDays: true,
            opensAt: true,
            closesAt: true,
          },
        },
      },
    });
    if (!service) throw new NotFoundException('Laboratory service not found');

    const dayName = this.reservationDayName(reservationDate);
    if (!service.laboratory.workingDays.includes(dayName)) {
      throw new BadRequestException(
        `The laboratory is closed on ${dayName.toLowerCase()}; choose one of its working days`,
      );
    }

    const booking = await this.createQueuedBooking({
      userId,
      laboratoryId,
      laboratoryServiceId: service.id,
      reservationDate,
      notes: dto.notes?.trim() || null,
    });
    return {
      booking: {
        ...booking,
        laboratoryName: service.laboratory.name,
        serviceName: service.name,
        price: service.price?.toNumber() ?? null,
        workingDays: service.laboratory.workingDays,
        opensAt: service.laboratory.opensAt,
        closesAt: service.laboratory.closesAt,
      },
    };
  }

  private parseReservationDate(date: string): Date {
    const reservationDate = new Date(`${date}T00:00:00.000Z`);
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    const latestDate = new Date(today);
    latestDate.setDate(latestDate.getDate() + 60);

    if (
      Number.isNaN(reservationDate.getTime()) ||
      reservationDate < today ||
      reservationDate > latestDate
    ) {
      throw new BadRequestException(
        'Visits must be booked for a date within the next 60 days',
      );
    }
    return reservationDate;
  }

  private reservationDayName(date: Date): string {
    return [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ][date.getUTCDay()];
  }

  private validateOperatingHours(opensAt: string, closesAt: string) {
    if (opensAt >= closesAt) {
      throw new BadRequestException(
        'Laboratory closing time must be later than opening time',
      );
    }
  }

  private assertCoordinatesConsistent(
    latitude: number | undefined,
    longitude: number | undefined,
  ) {
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException(
        'Laboratory latitude and longitude must be provided together',
      );
    }
  }

  private assertCoordinatesConsistentForUpdate(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    existingLatitude: number | null | undefined,
    existingLongitude: number | null | undefined,
  ) {
    const nextLatitude = latitude === undefined ? existingLatitude : latitude;
    const nextLongitude =
      longitude === undefined ? existingLongitude : longitude;
    if (
      (nextLatitude === null || nextLatitude === undefined) !==
      (nextLongitude === null || nextLongitude === undefined)
    ) {
      throw new BadRequestException(
        'Laboratory latitude and longitude must be set or cleared together',
      );
    }
  }

  private async deleteLaboratoryImage(imageUrl: string): Promise<void> {
    const filename = imageUrl.split('/').pop();
    if (!filename) return;
    try {
      await unlink(join(process.cwd(), 'uploads', 'laboratories', filename));
    } catch {
      // The database record is authoritative; a missing stale file is safe.
    }
  }

  private async refreshLaboratoryRating(laboratoryId: string): Promise<void> {
    const aggregate = await this.prisma.laboratoryReview.aggregate({
      where: { laboratoryId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.laboratory.update({
      where: { id: laboratoryId },
      data: {
        rating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }

  private toLaboratoryRecord<
    T extends {
      address: string;
      latitude?: number | null;
      longitude?: number | null;
    },
  >(
    laboratory: T,
  ): T & {
    location: {
      address: string;
      latitude: number | null;
      longitude: number | null;
      googleMapsUrl: string | null;
    };
  } {
    const latitude = laboratory.latitude ?? null;
    const longitude = laboratory.longitude ?? null;
    return {
      ...laboratory,
      location: {
        address: laboratory.address,
        latitude,
        longitude,
        googleMapsUrl: buildLaboratoryGoogleMapsUrl({
          address: laboratory.address,
          latitude,
          longitude,
        }),
      },
    };
  }

  private async createQueuedBooking(data: {
    userId: string;
    laboratoryId: string;
    laboratoryServiceId: string;
    reservationDate: Date;
    notes: string | null;
  }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const aggregate = await this.prisma.laboratoryBooking.aggregate({
        where: {
          laboratoryId: data.laboratoryId,
          reservationDate: data.reservationDate,
        },
        _max: { queueNumber: true },
      });
      try {
        return await this.prisma.laboratoryBooking.create({
          data: { ...data, queueNumber: (aggregate._max.queueNumber ?? 0) + 1 },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not assign a queue number; please retry',
    );
  }
}
