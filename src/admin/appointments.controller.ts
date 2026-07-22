import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { CreateSlotDto } from '../appointments/dto/create-slot.dto.js';
import { UpdateSlotDto } from '../appointments/dto/update-slot.dto.js';
import { ListAdminSlotsDto } from '../appointments/dto/list-admin-slots.dto.js';
import { ListAdminAppointmentsDto } from '../appointments/dto/list-admin-appointments.dto.js';
import type {
  AppointmentResponseDto,
  ListMyAppointmentsResult,
} from '../appointments/dto/appointment-response.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import type {
  ListSlotsResult,
  SlotResponseDto,
} from '../appointments/dto/slot-response.dto.js';

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminAppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------- Slot CRUD ----------------

  @Post('doctors/:doctorId/slots')
  @ApiOperation({ summary: 'Create a slot for a doctor (admin)' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiCreatedResponse({ description: 'Slot created.' })
  @ApiBadRequestResponse({
    description:
      'Past-time slot, endsAt <= startsAt, or DEACTIVATED doctor/category.',
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  createSlot(
    @Param('doctorId') doctorId: string,
    @Body() body: CreateSlotDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService
      .createSlot(doctorId, body)
      .then((result) => {
        void this.audit.record({
          actorId: admin.id,
          action: 'slot.create',
          entityType: 'slot',
          entityId: result.id,
          details: { doctorId },
        });
        return { slot: result };
      });
  }

  @Get('slots')
  @ApiOperation({ summary: 'List slots (admin)' })
  @ApiOkResponse({ description: 'Paginated list of slots.' })
  listSlots(@Query() query: ListAdminSlotsDto): Promise<ListSlotsResult> {
    return this.appointmentsService.listAdminSlots(query);
  }

  @Get('slots/:id')
  @ApiOperation({ summary: 'Get a slot by id (admin)' })
  @ApiParam({ name: 'id', description: 'Slot id (cuid)' })
  @ApiOkResponse({ description: 'Slot found.' })
  @ApiNotFoundResponse({ description: 'Slot not found.' })
  getSlot(@Param('id') id: string): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService.getAdminSlot(id).then((slot) => ({ slot }));
  }

  @Patch('slots/:id')
  @ApiOperation({ summary: 'Update a slot (partial)' })
  @ApiParam({ name: 'id', description: 'Slot id (cuid)' })
  @ApiOkResponse({ description: 'Slot updated.' })
  @ApiNotFoundResponse({ description: 'Slot not found.' })
  @ApiBadRequestResponse({ description: 'No fields to update.' })
  updateSlot(
    @Param('id') id: string,
    @Body() body: UpdateSlotDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService.updateSlot(id, body).then((result) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'slot.update',
        entityType: 'slot',
        entityId: id,
      });
      return { slot: result };
    });
  }

  @Patch('slots/:id/block')
  @ApiOperation({ summary: 'Soft-block a slot (idempotent)' })
  @ApiParam({ name: 'id', description: 'Slot id (cuid)' })
  @ApiOkResponse({ description: 'Slot blocked.' })
  @ApiNotFoundResponse({ description: 'Slot not found.' })
  @ApiConflictResponse({ description: 'Slot is BOOKED.' })
  blockSlot(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService.blockSlot(id).then((result) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'slot.block',
        entityType: 'slot',
        entityId: id,
      });
      return { slot: result };
    });
  }

  @Delete('slots/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete an AVAILABLE slot (admin)' })
  @ApiParam({ name: 'id', description: 'Slot id (cuid)' })
  @ApiNoContentResponse({ description: 'Slot deleted.' })
  @ApiNotFoundResponse({ description: 'Slot not found.' })
  @ApiConflictResponse({
    description:
      'Slot is BOOKED or BLOCKED — only AVAILABLE slots can be deleted.',
  })
  async deleteSlot(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<void> {
    await this.appointmentsService.deleteSlot(id);
    void this.audit.record({
      actorId: admin.id,
      action: 'slot.delete',
      entityType: 'slot',
      entityId: id,
    });
  }

  // ---------------- Appointment lifecycle ----------------

  @Patch('appointments/:id/confirm')
  @ApiOperation({ summary: 'Confirm a PENDING appointment (admin)' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Appointment confirmed.' })
  @ApiNotFoundResponse({ description: 'Appointment not found.' })
  @ApiConflictResponse({
    description: 'Appointment is not in PENDING status.',
  })
  confirmAppointment(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService.confirmAppointment(id).then((result) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'appointment.confirm',
        entityType: 'appointment',
        entityId: id,
      });
      return result;
    });
  }

  @Patch('appointments/:id/cancel')
  @ApiOperation({ summary: 'Cancel any appointment (admin)' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Appointment cancelled; slot released.' })
  @ApiNotFoundResponse({ description: 'Appointment not found.' })
  @ApiConflictResponse({
    description: 'Appointment is already CANCELLED or COMPLETED.',
  })
  cancelAppointment(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService.cancelAppointment(id).then((result) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'appointment.cancel',
        entityType: 'appointment',
        entityId: id,
      });
      return result;
    });
  }

  @Patch('appointments/:id/complete')
  @ApiOperation({
    summary: 'Mark a CONFIRMED appointment as completed (admin)',
  })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Appointment completed.' })
  @ApiBadRequestResponse({
    description: 'scheduledAt is in the future.',
  })
  @ApiNotFoundResponse({ description: 'Appointment not found.' })
  @ApiConflictResponse({
    description: 'Appointment is not in CONFIRMED status.',
  })
  completeAppointment(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService.completeAppointment(id).then((result) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'appointment.complete',
        entityType: 'appointment',
        entityId: id,
      });
      return result;
    });
  }

  // ---------------- Admin appointment listing ----------------

  @Get('appointments')
  @ApiOperation({
    summary: 'List all appointments (admin)',
    description:
      'Paginated list of all appointments, filterable by status, userId, doctorId.',
  })
  @ApiOkResponse({ description: 'Paginated list of appointments.' })
  listAppointments(
    @Query() query: ListAdminAppointmentsDto,
  ): Promise<ListMyAppointmentsResult> {
    return this.appointmentsService.listAdminAppointments(query);
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Get an appointment by id (admin)' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Appointment found.' })
  @ApiNotFoundResponse({ description: 'Appointment not found.' })
  getAppointment(
    @Param('id') id: string,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService
      .getAdminAppointment(id)
      .then((appointment) => ({ appointment }));
  }
}
