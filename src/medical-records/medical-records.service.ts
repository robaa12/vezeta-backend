import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MEDICAL_RECORD_CREATED,
  type MedicalRecordEventPayload,
} from '../common/events/domain-events.js';
import type {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
} from './dto/create-medical-record.dto.js';
import { ListMedicalHistoryDto } from './dto/list-medical-history.dto.js';
import {
  type ListMedicalHistoryResult,
  type MedicalRecordListItemDto,
  type MedicalRecordResponseDto,
} from './dto/medical-record-response.dto.js';

type DoctorRef = { id: string; name: string };
type RecordRow = {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  notes: string | null;
  attachmentUrls: string[];
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  doctor: DoctorRef;
};

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emitter?: EventEmitter2,
  ) {}

  // =========================================================================
  // Admin — create / update (doctors don't log in, admin acts on their behalf)
  // =========================================================================

  async createForAppointment(
    appointmentId: string,
    adminId: string,
    dto: CreateMedicalRecordDto,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    // Pre-flight: appointment exists and is COMPLETED. The "record
    // already exists" check is folded into the create via the unique
    // constraint on MedicalRecord.appointmentId (see the try/catch
    // below) — a separate findUnique would race with a concurrent
    // admin POST and surface a 500 on P2002.
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
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (appointment.status !== 'COMPLETED') {
      throw new ConflictException({
        message: 'Medical records can only be added to COMPLETED appointments',
        error: 'appointment_not_completed',
      });
    }
    if (dto.notes === undefined && dto.attachmentUrls === undefined) {
      throw new BadRequestException('No fields supplied');
    }
    let created: {
      id: string;
      appointmentId: string;
      patientId: string;
      doctorId: string;
      notes: string | null;
      attachmentUrls: string[];
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
      doctor: { id: string; name: string };
    };
    try {
      created = await this.prisma.medicalRecord.create({
        data: {
          appointmentId,
          patientId: appointment.userId,
          doctorId: appointment.doctorId,
          notes: dto.notes ?? null,
          attachmentUrls: dto.attachmentUrls ?? [],
          createdById: adminId,
        },
        include: {
          doctor: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'A medical record already exists for this appointment',
          error: 'medical_record_already_exists',
        });
      }
      throw err;
    }
    this.emit(MEDICAL_RECORD_CREATED, {
      medicalRecordId: created.id,
      appointmentId,
      patientId: created.patientId,
      doctorId: created.doctorId,
      doctorName: created.doctor.name,
      createdById: adminId,
    });
    return { medicalRecord: this.toResponse(created) };
  }

  async updateForAppointment(
    appointmentId: string,
    dto: UpdateMedicalRecordDto,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    const existing = await this.prisma.medicalRecord.findUnique({
      where: { appointmentId },
      include: { doctor: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Medical record not found');
    }
    const data: Record<string, unknown> = {};
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.attachmentUrls !== undefined)
      data.attachmentUrls = dto.attachmentUrls;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.prisma.medicalRecord.update({
      where: { appointmentId },
      data,
      include: { doctor: { select: { id: true, name: true } } },
    });
    return { medicalRecord: this.toResponse(updated) };
  }

  // =========================================================================
  // Read — admin OR owning patient (constitution §VI day-one rule)
  // =========================================================================

  async getByAppointment(
    requesterId: string,
    requesterRole: 'user' | 'admin',
    appointmentId: string,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { appointmentId },
      include: { doctor: { select: { id: true, name: true } } },
    });
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }
    // Admins can read any; patients only their own. Doctors-as-users
    // don't exist (feature 003), so the "treating doctor" branch is
    // effectively the admin path on the doctor's behalf.
    if (requesterRole !== 'admin' && record.patientId !== requesterId) {
      throw new NotFoundException('Medical record not found');
    }
    return { medicalRecord: this.toResponse(record) };
  }

  async listMyHistory(
    userId: string,
    query: ListMedicalHistoryDto,
  ): Promise<ListMedicalHistoryResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { patientId: userId };
    const [records, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          appointmentId: true,
          patientId: true,
          doctorId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          doctor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.medicalRecord.count({ where }),
    ]);
    return {
      records: records.map((r) => this.toListItem(r)),
      total,
      page,
      pageSize,
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private emit(event: string, payload: MedicalRecordEventPayload): void {
    if (!this.emitter) return;
    try {
      this.emitter.emit(event, payload);
    } catch {
      // Side-effect dispatch must never break the primary operation.
    }
  }

  private toListItem(r: {
    id: string;
    appointmentId: string;
    patientId: string;
    doctorId: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    doctor: DoctorRef;
  }): MedicalRecordListItemDto {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      patientId: r.patientId,
      doctor: { id: r.doctor.id, name: r.doctor.name },
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toResponse(r: RecordRow): MedicalRecordResponseDto {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      patientId: r.patientId,
      doctor: { id: r.doctor.id, name: r.doctor.name },
      notes: r.notes,
      attachmentUrls: r.attachmentUrls,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
