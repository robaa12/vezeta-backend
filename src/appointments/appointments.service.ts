import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSlotDto } from './dto/create-slot.dto.js';
import { UpdateSlotDto } from './dto/update-slot.dto.js';
import { BookAppointmentDto } from './dto/book-appointment.dto.js';
import { ListMyAppointmentsDto } from './dto/list-my-appointments.dto.js';
import {
  type AppointmentResponseDto,
  type ListMyAppointmentsResult,
  type PublicDoctorRef,
} from './dto/appointment-response.dto.js';
import {
  type ListSlotsResult,
  type SlotResponseDto,
} from './dto/slot-response.dto.js';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Public — slots
  // =========================================================================

  async listPublicSlots(
    doctorId: string,
  ): Promise<{ slots: SlotResponseDto[] }> {
    const records = await this.prisma.doctorSlot.findMany({
      where: {
        doctorId,
        status: 'AVAILABLE',
        doctor: { status: 'ACTIVE', category: { status: 'ACTIVE' } },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (records.length === 0) {
      // Distinguish "no slots" (200 with empty array) from "doctor does
      // not exist or is deactivated" (404). A cheap check on the doctor
      // is acceptable; we use findUnique for that, then return [].
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { status: true, category: { select: { status: true } } },
      });
      if (
        !doctor ||
        doctor.status !== 'ACTIVE' ||
        doctor.category.status !== 'ACTIVE'
      ) {
        throw new NotFoundException('Doctor not found');
      }
    }
    return { slots: records.map((r) => this.toSlotResponse(r)) };
  }

  // =========================================================================
  // Admin — slot CRUD
  // =========================================================================

  async createSlot(
    doctorId: string,
    dto: CreateSlotDto,
  ): Promise<SlotResponseDto> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: {
        id: true,
        status: true,
        category: { select: { status: true } },
      },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    if (doctor.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot create a slot for a deactivated doctor',
      );
    }
    if (doctor.category.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot create a slot for a doctor in a deactivated category',
      );
    }
    if (dto.startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Slot start must be in the future');
    }
    if (dto.endsAt.getTime() <= dto.startsAt.getTime()) {
      throw new BadRequestException('Slot end must be after slot start');
    }
    const created = await this.prisma.doctorSlot.create({
      data: {
        doctorId,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        status: 'AVAILABLE',
      },
    });
    return this.toSlotResponse(created);
  }

  async listAdminSlots(query: {
    doctorId?: string;
    status?: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
    page?: number;
    pageSize?: number;
  }): Promise<ListSlotsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.doctorId) where.doctorId = query.doctorId;
    if (query.status) where.status = query.status;
    const [records, total] = await Promise.all([
      this.prisma.doctorSlot.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.doctorSlot.count({ where }),
    ]);
    return {
      slots: records.map((r) => this.toSlotResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  async getAdminSlot(id: string): Promise<SlotResponseDto> {
    const slot = await this.prisma.doctorSlot.findUnique({ where: { id } });
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    return this.toSlotResponse(slot);
  }

  async updateSlot(id: string, dto: UpdateSlotDto): Promise<SlotResponseDto> {
    const existing = await this.prisma.doctorSlot.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Slot not found');
    }
    // The DTO restricts status to 'AVAILABLE' | 'BLOCKED'. The 'BOOKED'
    // state is owned by the booking lifecycle and cannot be set via
    // this endpoint. No additional runtime check is needed.
    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.prisma.doctorSlot.update({
      where: { id },
      data,
    });
    return this.toSlotResponse(updated);
  }

  async blockSlot(id: string): Promise<SlotResponseDto> {
    const existing = await this.prisma.doctorSlot.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Slot not found');
    }
    if (existing.status === 'BLOCKED') {
      return this.toSlotResponse(existing);
    }
    if (existing.status === 'BOOKED') {
      throw new ConflictException({
        message: 'Cannot block a slot that is already booked',
        error: 'slot_booked',
      });
    }
    const updated = await this.prisma.doctorSlot.update({
      where: { id },
      data: { status: 'BLOCKED' },
    });
    return this.toSlotResponse(updated);
  }

  async deleteSlot(id: string): Promise<void> {
    const existing = await this.prisma.doctorSlot.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Slot not found');
    }
    if (existing.status !== 'AVAILABLE') {
      throw new ConflictException({
        message: 'Only AVAILABLE slots can be deleted',
        error: 'slot_not_deletable',
      });
    }
    await this.prisma.doctorSlot.delete({ where: { id } });
  }

  // =========================================================================
  // Patient — appointments
  // =========================================================================

  /**
   * Book a slot. Atomic via prisma.$transaction with a conditional
   * updateMany on doctorSlot WHERE status = 'AVAILABLE' (Constitution
   * Principle IV — Transactional Data Integrity). Exactly one of N
   * concurrent requests wins.
   */
  async bookSlot(
    userId: string,
    dto: BookAppointmentDto,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    // Pre-flight: validate user is active. RolesGuard handles the
    // session-existence check; this catches the deactivated-user case.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    // Pre-flight: distinguish 404 (no such slot) from 409 (slot is
    // not AVAILABLE). Without this, a typo'd slotId would surface
    // as 409 which is misleading. The conditional updateMany inside
    // the transaction is still the source of truth for concurrency.
    const existing = await this.prisma.doctorSlot.findUnique({
      where: { id: dto.slotId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Slot not found');
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      // 1. Atomic conditional update — only succeeds if slot is AVAILABLE
      const updated = await tx.doctorSlot.updateMany({
        where: { id: dto.slotId, status: 'AVAILABLE' },
        data: { status: 'BOOKED' },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          message: 'Slot is no longer available',
          error: 'slot_unavailable',
        });
      }

      // 2. Fetch the slot for denormalized fields
      const slot = await tx.doctorSlot.findUniqueOrThrow({
        where: { id: dto.slotId },
        select: {
          doctorId: true,
          startsAt: true,
          doctor: {
            select: {
              status: true,
              category: { select: { status: true } },
            },
          },
        },
      });
      if (slot.startsAt.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot book a slot in the past');
      }
      if (slot.doctor.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot book a slot for a deactivated doctor',
        );
      }
      if (slot.doctor.category.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot book a slot for a doctor in a deactivated category',
        );
      }

      // 3. Create the appointment
      return tx.appointment.create({
        data: {
          userId,
          doctorId: slot.doctorId,
          slotId: dto.slotId,
          scheduledAt: slot.startsAt,
          status: 'PENDING',
          patientNotes: dto.patientNotes ?? null,
        },
        include: {
          doctor: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      });
    });

    return { appointment: this.toAppointmentResponse(appointment) };
  }

  async listMyAppointments(
    userId: string,
    query: ListMyAppointmentsDto,
  ): Promise<ListMyAppointmentsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { userId };
    if (query.status) where.status = query.status;
    const [records, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          doctor: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return {
      appointments: records.map((r) => this.toAppointmentResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Patient self-cancel. Enforces the 24-hour cutoff at the service
   * layer. Returns 404 (not 403) for cross-patient access (information
   * disclosure protection).
   */
  async cancelMyAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw new ConflictException({
        message: 'Appointment cannot be cancelled',
        error: 'invalid_state_transition',
      });
    }
    const hoursUntil =
      (existing.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      throw new ForbiddenException({
        message:
          'Cannot cancel within 24 hours of the appointment; please contact support',
        error: 'too_late_to_cancel',
      });
    }
    const updated = await this.cancelAppointmentTx(appointmentId, 'USER');
    return { appointment: this.toAppointmentResponse(updated) };
  }

  // =========================================================================
  // Admin — appointment lifecycle
  // =========================================================================

  async listAdminAppointments(query: {
    status?: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    userId?: string;
    doctorId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ListMyAppointmentsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.doctorId) where.doctorId = query.doctorId;
    const [records, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          doctor: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return {
      appointments: records.map((r) => this.toAppointmentResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  async getAdminAppointment(id: string): Promise<AppointmentResponseDto> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { include: { category: { select: { id: true, name: true } } } },
      },
    });
    if (!appt) {
      throw new NotFoundException('Appointment not found');
    }
    return this.toAppointmentResponse(appt);
  }

  async confirmAppointment(
    id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictException({
        message: 'Only PENDING appointments can be confirmed',
        error: 'invalid_state_transition',
      });
    }
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      include: {
        doctor: { include: { category: { select: { id: true, name: true } } } },
      },
    });
    return { appointment: this.toAppointmentResponse(updated) };
  }

  async cancelAppointment(
    id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw new ConflictException({
        message: 'Appointment cannot be cancelled',
        error: 'invalid_state_transition',
      });
    }
    const updated = await this.cancelAppointmentTx(id, 'ADMIN');
    return { appointment: this.toAppointmentResponse(updated) };
  }

  async completeAppointment(
    id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status !== 'CONFIRMED') {
      throw new ConflictException({
        message: 'Only CONFIRMED appointments can be completed',
        error: 'invalid_state_transition',
      });
    }
    if (existing.scheduledAt.getTime() > Date.now()) {
      throw new BadRequestException('Cannot complete a future appointment');
    }
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: {
        doctor: { include: { category: { select: { id: true, name: true } } } },
      },
    });
    return { appointment: this.toAppointmentResponse(updated) };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Internal: atomic cancel + slot release. Used by both patient
   * self-cancel and admin cancel. The 24h cutoff is enforced by the
   * caller (cancelMyAppointment), not here.
   */
  private async cancelAppointmentTx(
    appointmentId: string,
    cancelledBy: 'USER' | 'ADMIN',
  ): Promise<{
    id: string;
    userId: string;
    doctorId: string;
    slotId: string;
    scheduledAt: Date;
    status: string;
    patientNotes: string | null;
    adminNotes: string | null;
    cancelledAt: Date | null;
    cancelledBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    doctor: PublicDoctorRef;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy,
        },
        include: {
          doctor: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      });
      await tx.doctorSlot.update({
        where: { id: updated.slotId },
        data: { status: 'AVAILABLE' },
      });
      return updated;
    });
  }

  private toSlotResponse(s: {
    id: string;
    doctorId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): SlotResponseDto {
    return {
      id: s.id,
      doctorId: s.doctorId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      status: s.status as SlotResponseDto['status'],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private toAppointmentResponse(a: {
    id: string;
    status: string;
    scheduledAt: Date;
    patientNotes: string | null;
    adminNotes?: string | null;
    cancelledAt: Date | null;
    cancelledBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    doctor: {
      id: string;
      name: string;
      category: { id: string; name: string };
    };
  }): AppointmentResponseDto {
    return {
      id: a.id,
      status: a.status as AppointmentResponseDto['status'],
      scheduledAt: a.scheduledAt,
      patientNotes: a.patientNotes,
      cancelledAt: a.cancelledAt,
      cancelledBy: a.cancelledBy as AppointmentResponseDto['cancelledBy'],
      doctor: {
        id: a.doctor.id,
        name: a.doctor.name,
        category: { id: a.doctor.category.id, name: a.doctor.category.name },
      },
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
