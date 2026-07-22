import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDoctorServiceDto } from './dto/create-doctor-service.dto.js';
import { ListDoctorServicesDto } from './dto/list-doctor-services.dto.js';
import { UpdateDoctorServiceDto } from './dto/update-doctor-service.dto.js';
import type { DoctorServiceResponseDto } from './dto/doctor-service-response.dto.js';

export interface ListDoctorServicesResult {
  services: DoctorServiceResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

type DoctorServiceRow = {
  id: string;
  doctorId: string;
  name: string;
  price: Prisma.Decimal | null;
  discountPercent: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DoctorServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForDoctor(
    doctorId: string,
    query: ListDoctorServicesDto,
  ): Promise<ListDoctorServicesResult> {
    await this.assertDoctorExists(doctorId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Record<string, unknown> = { doctorId };
    if (query.status) where.status = query.status;

    const [records, total] = await Promise.all([
      this.prisma.doctorService.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.doctorService.count({ where }),
    ]);

    return {
      services: records.map((r) => this.toResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  async getForDoctor(
    doctorId: string,
    serviceId: string,
  ): Promise<DoctorServiceResponseDto> {
    const record = await this.prisma.doctorService.findFirst({
      where: { id: serviceId, doctorId },
    });
    if (!record) {
      throw new NotFoundException('Service not found');
    }
    return this.toResponse(record);
  }

  async createForDoctor(
    doctorId: string,
    dto: CreateDoctorServiceDto,
  ): Promise<DoctorServiceResponseDto> {
    await this.assertDoctorExists(doctorId);
    this.validateDiscountAgainstPrice(dto.discountPercent, dto.price);

    let created: DoctorServiceRow;
    try {
      created = await this.prisma.doctorService.create({
        data: {
          doctorId,
          name: dto.name,
          price: this.toDecimal(dto.price),
          discountPercent: dto.discountPercent ?? null,
          status: dto.status ?? 'ACTIVE',
        },
      });
    } catch (err) {
      throw this.translateKnownErrors(err);
    }
    return this.toResponse(created);
  }

  async updateForDoctor(
    doctorId: string,
    serviceId: string,
    dto: UpdateDoctorServiceDto,
  ): Promise<DoctorServiceResponseDto> {
    const existing = await this.prisma.doctorService.findFirst({
      where: { id: serviceId, doctorId },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    const data: Prisma.DoctorServiceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.price !== undefined) {
      data.price = this.toDecimal(dto.price);
    }
    if (dto.discountPercent !== undefined) {
      data.discountPercent = dto.discountPercent;
    }
    if (dto.status !== undefined) data.status = dto.status;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    // When the patch changes discountPercent but not price, the new
    // discount must still pair with a price. The "effective" price is
    // the new one when the patch sets it, otherwise the existing one.
    if (dto.discountPercent !== undefined && dto.price === undefined) {
      this.validateDiscountAgainstPrice(
        dto.discountPercent,
        existing.price === null ? null : Number(existing.price),
      );
    }
    // Same for price-only patches: clearing the price while a discount
    // remains is rejected.
    if (dto.price !== undefined && dto.discountPercent === undefined) {
      const stillHasDiscount =
        existing.discountPercent !== null && existing.discountPercent > 0;
      if (dto.price === null && stillHasDiscount) {
        throw new BadRequestException(
          'Cannot clear price while a discount is set; clear the discount first',
        );
      }
    }

    let updated: DoctorServiceRow;
    try {
      updated = await this.prisma.doctorService.update({
        where: { id: serviceId },
        data,
      });
    } catch (err) {
      throw this.translateKnownErrors(err);
    }
    return this.toResponse(updated);
  }

  async deactivateForDoctor(
    doctorId: string,
    serviceId: string,
  ): Promise<DoctorServiceResponseDto> {
    const existing = await this.prisma.doctorService.findFirst({
      where: { id: serviceId, doctorId },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }
    if (existing.status === 'DEACTIVATED') {
      return this.toResponse(existing);
    }
    const updated = await this.prisma.doctorService.update({
      where: { id: serviceId },
      data: { status: 'DEACTIVATED' },
    });
    return this.toResponse(updated);
  }

  async deleteForDoctor(doctorId: string, serviceId: string): Promise<void> {
    const existing = await this.prisma.doctorService.findFirst({
      where: { id: serviceId, doctorId },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }
    await this.prisma.doctorService.delete({ where: { id: serviceId } });
  }

  // ---------------- Helpers ----------------

  private async assertDoctorExists(doctorId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { id: true },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
  }

  private validateDiscountAgainstPrice(
    discountPercent: number | undefined,
    price: number | null | undefined,
  ): void {
    if (discountPercent === undefined) return;
    if (price === undefined || price === null) {
      throw new BadRequestException(
        'A discount requires a price; supply a price or omit the discount',
      );
    }
  }

  private toDecimal(value: number | null | undefined): Prisma.Decimal | null {
    if (value === undefined || value === null) return null;
    // Constructing from the string form avoids the float-precision
    // surprises that arise from `new Prisma.Decimal(0.1 + 0.2)`.
    return new Prisma.Decimal(value.toFixed(2));
  }

  private translateKnownErrors(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException({
        message: 'A service with these unique attributes already exists',
        error: 'duplicate_service',
      });
    }
    return err;
  }

  private toResponse(s: DoctorServiceRow): DoctorServiceResponseDto {
    const price = s.price === null ? null : Number(s.price);
    return {
      id: s.id,
      doctorId: s.doctorId,
      name: s.name,
      price,
      discountPercent: s.discountPercent,
      finalPrice: this.computeFinalPrice(price, s.discountPercent),
      status: s.status as DoctorServiceResponseDto['status'],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private computeFinalPrice(
    price: number | null,
    discountPercent: number | null,
  ): number | null {
    if (price === null) return null;
    if (discountPercent === null || discountPercent === 0) return price;
    const discounted = price * (1 - discountPercent / 100);
    return Math.round(discounted * 100) / 100;
  }
}
