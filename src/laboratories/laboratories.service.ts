import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookLaboratoryVisitDto } from './dto/book-laboratory-visit.dto.js';
import { ListLaboratoriesDto } from './dto/list-laboratories.dto.js';
import {
  CreateLaboratoryDto,
  LaboratoryServiceDto,
  UpdateLaboratoryDto,
} from './dto/manage-laboratory.dto.js';

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
    return { laboratories, total, page, pageSize };
  }

  async listAdmin(query: ListLaboratoriesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.city) where.city = query.city;
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { area: { contains: query.search.trim(), mode: 'insensitive' } },
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
    return { laboratories, total, page, pageSize };
  }

  create(dto: CreateLaboratoryDto) {
    return this.prisma.laboratory.create({ data: dto });
  }

  async getAdmin(id: string) {
    const laboratory = await this.prisma.laboratory.findUnique({
      where: { id },
      include: { services: { orderBy: { name: 'asc' } }, reviews: true },
    });
    if (!laboratory) throw new NotFoundException('Laboratory not found');
    return laboratory;
  }

  async update(id: string, dto: UpdateLaboratoryDto) {
    await this.getAdmin(id);
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('No fields to update');
    return this.prisma.laboratory.update({ where: { id }, data: dto });
  }

  async setStatus(id: string, status: 'ACTIVE' | 'DEACTIVATED') {
    const laboratory = await this.getAdmin(id);
    if (laboratory.status === status) {
      throw new ConflictException(
        `Laboratory is already ${status.toLowerCase()}`,
      );
    }
    return this.prisma.laboratory.update({ where: { id }, data: { status } });
  }

  async delete(id: string): Promise<void> {
    const bookings = await this.prisma.laboratoryBooking.count({
      where: { laboratoryId: id },
    });
    if (bookings > 0)
      throw new ConflictException(
        'Cannot delete a laboratory with bookings; deactivate it instead',
      );
    try {
      await this.prisma.laboratory.delete({ where: { id } });
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
        popular: dto.popular ?? false,
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
          orderBy: [{ popular: 'desc' }, { name: 'asc' }],
        },
      },
    });
    if (!laboratory) throw new NotFoundException('Laboratory not found');
    return laboratory;
  }

  async listReviews(id: string) {
    await this.get(id);
    const reviews = await this.prisma.laboratoryReview.findMany({
      where: { laboratoryId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { reviews };
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
      include: { laboratory: { select: { name: true } } },
    });
    if (!service) throw new NotFoundException('Laboratory service not found');

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
        price: service.price.toNumber(),
      },
    };
  }

  private parseReservationDate(date: string): Date {
    const reservationDate = new Date(`${date}T00:00:00.000Z`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
