import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { saveLaboratoryRecordImage } from '../upload/multer.config.js';
import type {
  LaboratoryMedicalRecordResponseDto,
  SaveLaboratoryMedicalRecordDto,
} from './dto/laboratory-medical-record.dto.js';

type RecordRow = {
  id: string;
  laboratoryBookingId: string;
  patientId: string;
  notes: string | null;
  attachmentUrls: string[];
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  laboratory: { id: string; name: string };
};

@Injectable()
export class LaboratoryRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    bookingId: string,
    adminId: string,
    dto: SaveLaboratoryMedicalRecordDto,
  ): Promise<{ medicalRecord: LaboratoryMedicalRecordResponseDto }> {
    const booking = await this.completedBooking(bookingId);
    this.ensureContent(dto);
    try {
      const record = await this.prisma.laboratoryMedicalRecord.create({
        data: {
          laboratoryBookingId: booking.id,
          patientId: booking.userId,
          laboratoryId: booking.laboratoryId,
          notes: dto.notes ?? null,
          attachmentUrls: dto.attachmentUrls ?? [],
          createdById: adminId,
        },
        include: { laboratory: { select: { id: true, name: true } } },
      });
      return { medicalRecord: this.toResponse(record) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A medical record already exists for this laboratory visit');
      }
      throw error;
    }
  }

  async update(
    bookingId: string,
    dto: SaveLaboratoryMedicalRecordDto,
  ): Promise<{ medicalRecord: LaboratoryMedicalRecordResponseDto }> {
    const existing = await this.prisma.laboratoryMedicalRecord.findUnique({
      where: { laboratoryBookingId: bookingId },
      include: { laboratory: { select: { id: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('Laboratory medical record not found');
    if (dto.notes === undefined && dto.attachmentUrls === undefined) {
      throw new BadRequestException('No fields to update');
    }
    const record = await this.prisma.laboratoryMedicalRecord.update({
      where: { laboratoryBookingId: bookingId },
      data: {
        ...(dto.notes === undefined ? {} : { notes: dto.notes }),
        ...(dto.attachmentUrls === undefined
          ? {}
          : { attachmentUrls: dto.attachmentUrls }),
      },
      include: { laboratory: { select: { id: true, name: true } } },
    });
    return { medicalRecord: this.toResponse(record) };
  }

  async getForAdmin(bookingId: string) {
    const record = await this.prisma.laboratoryMedicalRecord.findUnique({
      where: { laboratoryBookingId: bookingId },
      include: { laboratory: { select: { id: true, name: true } } },
    });
    return { medicalRecord: record ? this.toResponse(record) : null };
  }

  async getForPatient(userId: string, bookingId: string) {
    const record = await this.prisma.laboratoryMedicalRecord.findUnique({
      where: { laboratoryBookingId: bookingId },
      include: { laboratory: { select: { id: true, name: true } } },
    });
    if (!record || record.patientId !== userId) {
      throw new NotFoundException('Laboratory medical record not found');
    }
    return { medicalRecord: this.toResponse(record) };
  }

  async uploadAttachment(bookingId: string, image: Express.Multer.File) {
    await this.completedBooking(bookingId);
    return { attachmentUrl: await saveLaboratoryRecordImage(image) };
  }

  private async completedBooking(bookingId: string) {
    const booking = await this.prisma.laboratoryBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, laboratoryId: true, status: true },
    });
    if (!booking) throw new NotFoundException('Laboratory booking not found');
    if (booking.status !== 'COMPLETED') {
      throw new ConflictException('Medical records can only be added to COMPLETED laboratory visits');
    }
    return booking;
  }

  private ensureContent(dto: SaveLaboratoryMedicalRecordDto) {
    if (dto.notes === undefined && dto.attachmentUrls === undefined) {
      throw new BadRequestException('No fields supplied');
    }
  }

  private toResponse(record: RecordRow): LaboratoryMedicalRecordResponseDto {
    return {
      id: record.id,
      laboratoryBookingId: record.laboratoryBookingId,
      patientId: record.patientId,
      laboratory: record.laboratory,
      notes: record.notes,
      attachmentUrls: record.attachmentUrls,
      createdById: record.createdById,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
