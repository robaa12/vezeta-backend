import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  APPOINTMENT_CANCELLED,
  APPOINTMENT_COMPLETED,
  APPOINTMENT_CONFIRMED,
  APPOINTMENT_CREATED,
  type AppointmentCancelledPayload,
  type AppointmentEventPayload,
} from '../common/events/domain-events.js';
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
import { APPOINTMENT_CANCEL_CUTOFF_HOURS } from '../common/constants.js';

const VISIBLE_SLOT_STATUSES = ['AVAILABLE', 'BOOKED', 'BLOCKED'] as const;
const DELETED_SLOT_STATUS = 'DELETED';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emitter?: EventEmitter2,
  ) {}

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
        startsAt: { gt: new Date() },
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
    where.status = query.status ?? { in: [...VISIBLE_SLOT_STATUSES] };
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
    const slot = await this.prisma.doctorSlot.findFirst({
      where: { id, status: { in: [...VISIBLE_SLOT_STATUSES] } },
    });
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    return this.toSlotResponse(slot);
  }

  async updateSlot(id: string, dto: UpdateSlotDto): Promise<SlotResponseDto> {
    const existing = await this.prisma.doctorSlot.findFirst({
      where: { id, status: { in: [...VISIBLE_SLOT_STATUSES] } },
    });
    if (!existing) {
      throw new NotFoundException('Slot not found');
    }
    // The DTO restricts status to 'AVAILABLE' | 'BLOCKED'. The 'BOOKED'
    // state is owned by the booking lifecycle and cannot be changed here.
    if (existing.status === 'BOOKED') {
      throw new ConflictException({
        message: 'Cannot update a slot that is already booked',
        error: 'slot_booked',
      });
    }
    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    // Keep the transition conditional so a booking that wins after the
    // pre-read cannot be overwritten by this administrative update.
    const result = await this.prisma.doctorSlot.updateMany({
      where: { id, status: { in: ['AVAILABLE', 'BLOCKED'] } },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException({
        message: 'Slot is no longer editable',
        error: 'slot_unavailable',
      });
    }
    const updated = await this.prisma.doctorSlot.findUniqueOrThrow({
      where: { id },
    });
    return this.toSlotResponse(updated);
  }

  async blockSlot(id: string): Promise<SlotResponseDto> {
    const existing = await this.prisma.doctorSlot.findFirst({
      where: { id, status: { in: [...VISIBLE_SLOT_STATUSES] } },
    });
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
    if (!existing || existing.status === DELETED_SLOT_STATUS) {
      throw new NotFoundException('Slot not found');
    }
    if (!['AVAILABLE', 'BLOCKED'].includes(existing.status)) {
      throw new ConflictException({
        message: 'Only AVAILABLE or BLOCKED slots can be deleted',
        error: 'slot_not_deletable',
      });
    }

    // Slots can become AVAILABLE again after an appointment is cancelled.
    // The appointment must remain for medical/audit history, so a physical
    // delete would violate appointment_slotId_fkey. A tombstone removes the
    // slot from every listing without destroying that history.
    const result = await this.prisma.doctorSlot.updateMany({
      where: { id, status: { in: ['AVAILABLE', 'BLOCKED'] } },
      data: { status: DELETED_SLOT_STATUS },
    });
    if (result.count === 0) {
      throw new ConflictException({
        message: 'Slot is no longer available',
        error: 'slot_not_deletable',
      });
    }
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

      // 3. Clear any prior CANCELLED appointment for this slot. The
      //    Appointment.slotId UNIQUE constraint makes the slot a
      //    1:1 owner of an appointment row for the lifetime of the
      //    database; if a previous booking was cancelled, that row
      //    is still here even though the slot is AVAILABLE again.
      //    Deleting the terminal CANCELLED row frees the slotId for
      //    the new appointment. Audit trail is preserved because the
      //    APPOINTMENT_CANCELLED event was already emitted at
      //    cancel-time and is the source of truth for the cancel.
      //    deleteMany (vs delete) tolerates the no-prior-cancel case.
      await tx.appointment.deleteMany({
        where: { slotId: dto.slotId, status: 'CANCELLED' },
      });

      // 4. Create the appointment
      return tx.appointment.create({
        data: {
          userId,
          doctorId: slot.doctorId,
          slotId: dto.slotId,
          scheduledAt: slot.startsAt,
          status: 'PENDING',
          patientNotes: dto.patientNotes ?? null,
        },
        select: {
          id: true,
          userId: true,
          doctorId: true,
          status: true,
          scheduledAt: true,
          patientNotes: true,
          cancelledAt: true,
          cancelledBy: true,
          createdAt: true,
          updatedAt: true,
          doctor: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    this.emitAppointmentEvent(APPOINTMENT_CREATED, {
      appointmentId: appointment.id,
      userId: appointment.userId,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctor.name,
      categoryName: appointment.doctor.category.name,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
    });

    return { appointment: this.toAppointmentResponse(appointment) };
  }

  private emitAppointmentEvent(
    event: string,
    payload: AppointmentEventPayload | AppointmentCancelledPayload,
  ): void {
    if (!this.emitter) return;
    try {
      this.emitter.emit(event, payload);
    } catch {
      // Side-effect dispatch must never break the primary operation.
    }
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
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          patientNotes: true,
          cancelledAt: true,
          cancelledBy: true,
          createdAt: true,
          updatedAt: true,
          doctor: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
          review: { select: { id: true } },
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

  async getMyAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        patientNotes: true,
        cancelledAt: true,
        cancelledBy: true,
        createdAt: true,
        updatedAt: true,
        doctor: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: { select: { id: true, name: true } },
          },
        },
        review: { select: { id: true } },
      },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return { appointment: this.toAppointmentResponse(appointment) };
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
    if (hoursUntil < APPOINTMENT_CANCEL_CUTOFF_HOURS) {
      throw new ForbiddenException({
        message: `Cannot cancel within ${APPOINTMENT_CANCEL_CUTOFF_HOURS} hours of the appointment; please contact support`,
        error: 'too_late_to_cancel',
      });
    }
    const updated = await this.cancelAppointmentTx(appointmentId, 'USER');
    this.emitAppointmentEvent(APPOINTMENT_CANCELLED, {
      appointmentId: updated.id,
      userId: updated.userId,
      doctorId: updated.doctorId,
      doctorName: updated.doctor.name,
      categoryName: updated.doctor.category.name,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
      cancelledBy: 'USER',
    });
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
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          patientNotes: true,
          cancelledAt: true,
          cancelledBy: true,
          createdAt: true,
          updatedAt: true,
          doctor: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
          user: { select: { id: true, name: true } },
          review: { select: { id: true } },
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
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        patientNotes: true,
        cancelledAt: true,
        cancelledBy: true,
        createdAt: true,
        updatedAt: true,
        doctor: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
        review: { select: { id: true } },
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
    // Atomic state guard: updateMany with the precondition on `status`
    // is the source of truth for the transition. A separate findUnique
    // + update is racy — two concurrent admins would both pass the
    // check and double-emit CONFIRMED events.
    const result = await this.prisma.appointment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (result.count === 0) {
      const existing = await this.prisma.appointment.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Appointment not found');
      }
      throw new ConflictException({
        message: 'Only PENDING appointments can be confirmed',
        error: 'invalid_state_transition',
      });
    }
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        userId: true,
        doctorId: true,
        status: true,
        scheduledAt: true,
        patientNotes: true,
        cancelledAt: true,
        cancelledBy: true,
        createdAt: true,
        updatedAt: true,
        doctor: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });
    this.emitAppointmentEvent(APPOINTMENT_CONFIRMED, {
      appointmentId: updated.id,
      userId: updated.userId,
      doctorId: updated.doctorId,
      doctorName: updated.doctor.name,
      categoryName: updated.doctor.category.name,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
    });
    return { appointment: this.toAppointmentResponse(updated) };
  }

  async cancelAppointment(
    id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    // Use the atomic cancel helper; the precondition lives in
    // cancelAppointmentTx. We pre-flight the existence check here so a
    // missing id returns 404 (not 409 from the conditional update).
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, status: true },
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
    this.emitAppointmentEvent(APPOINTMENT_CANCELLED, {
      appointmentId: updated.id,
      userId: updated.userId,
      doctorId: updated.doctorId,
      doctorName: updated.doctor.name,
      categoryName: updated.doctor.category.name,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
      cancelledBy: 'ADMIN',
    });
    return { appointment: this.toAppointmentResponse(updated) };
  }

  async completeAppointment(
    id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    // Both lifecycle and time predicates belong to the same mutation. This
    // avoids a compensating write that could overwrite a concurrent cancel.
    const result = await this.prisma.appointment.updateMany({
      where: { id, status: 'CONFIRMED', scheduledAt: { lte: new Date() } },
      data: { status: 'COMPLETED' },
    });
    if (result.count === 0) {
      const existing = await this.prisma.appointment.findUnique({
        where: { id },
        select: { id: true, status: true, scheduledAt: true },
      });
      if (!existing) {
        throw new NotFoundException('Appointment not found');
      }
      if (
        existing.status === 'CONFIRMED' &&
        existing.scheduledAt.getTime() > Date.now()
      ) {
        throw new BadRequestException('Cannot complete a future appointment');
      }
      throw new ConflictException({
        message: 'Only CONFIRMED appointments can be completed',
        error: 'invalid_state_transition',
      });
    }
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        userId: true,
        doctorId: true,
        status: true,
        scheduledAt: true,
        patientNotes: true,
        cancelledAt: true,
        cancelledBy: true,
        createdAt: true,
        updatedAt: true,
        doctor: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });
    this.emitAppointmentEvent(APPOINTMENT_COMPLETED, {
      appointmentId: updated.id,
      userId: updated.userId,
      doctorId: updated.doctorId,
      doctorName: updated.doctor.name,
      categoryName: updated.doctor.category.name,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
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
   *
   * The slot release is conditional on `status = 'BOOKED'` so an admin
   * who blocked the slot between booking and cancellation cannot have
   * the BLOCKED status silently overwritten to AVAILABLE.
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
    cancelledAt: Date | null;
    cancelledBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    doctor: PublicDoctorRef;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Atomic cancel via conditional updateMany (PENDING/CONFIRMED
      //    → CANCELLED). Two concurrent cancels both pass; the second
      //    sees count === 0 and the caller can map to 409 if needed.
      const result = await tx.appointment.updateMany({
        where: { id: appointmentId, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy,
        },
      });
      if (result.count === 0) {
        throw new ConflictException({
          message: 'Appointment cannot be cancelled',
          error: 'invalid_state_transition',
        });
      }
      // 2. Re-read the cancelled row with the doctor include so the
      //    caller can emit the cancellation event.
      const updated = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: {
          id: true,
          userId: true,
          doctorId: true,
          slotId: true,
          status: true,
          scheduledAt: true,
          patientNotes: true,
          cancelledAt: true,
          cancelledBy: true,
          createdAt: true,
          updatedAt: true,
          doctor: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      });
      // 3. Conditional slot release. If the slot was concurrently
      //    blocked by an admin, count === 0 and we leave the slot
      //    alone (do not overwrite BLOCKED → AVAILABLE).
      await tx.doctorSlot.updateMany({
        where: { id: updated.slotId, status: 'BOOKED' },
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
      imageUrl?: string | null;
      category: { id: string; name: string };
    };
    user?: { id: string; name: string };
    review?: { id: string } | null;
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
        ...(a.doctor.imageUrl !== undefined
          ? { imageUrl: a.doctor.imageUrl }
          : {}),
        category: { id: a.doctor.category.id, name: a.doctor.category.name },
      },
      ...(a.user ? { patient: { id: a.user.id, name: a.user.name } } : {}),
      hasReview: Boolean(a.review),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
