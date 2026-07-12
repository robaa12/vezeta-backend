import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { AppointmentsService } from './appointments.service.js';
import { BookAppointmentDto } from './dto/book-appointment.dto.js';
import { ListMyAppointmentsDto } from './dto/list-my-appointments.dto.js';
import {
  type AppointmentResponseDto,
  type ListMyAppointmentsResult,
} from './dto/appointment-response.dto.js';

@ApiTags('appointments')
@ApiProduces('application/json')
@Controller('api/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * US2 — Patient books a slot. Atomic via prisma.$transaction
   * with a conditional updateMany on doctor_slot (Constitution
   * Principle IV). Exactly one of N concurrent requests wins.
   */
  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Book a slot (patient)' })
  @ApiCreatedResponse({
    description: 'Appointment created in PENDING. Slot is now BOOKED.',
  })
  @ApiBadRequestResponse({
    description: 'Past-time slot, DEACTIVATED doctor or category.',
  })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({ description: 'Account is deactivated.' })
  @ApiNotFoundResponse({ description: 'Slot does not exist.' })
  @ApiConflictResponse({ description: 'Slot is no longer available.' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  book(
    @Body() body: BookAppointmentDto,
    @CurrentUser() user: SessionUser,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService.bookSlot(user.id, body);
  }

  /**
   * US4 — Patient lists their own appointments. Scoped to the
   * authenticated user; cross-patient access is impossible at
   * the service layer (the WHERE clause includes userId).
   */
  @Get()
  @ApiOperation({ summary: 'List my appointments (patient)' })
  @ApiOkResponse({
    description: "Paginated list of the patient's appointments.",
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  listMine(
    @Query() query: ListMyAppointmentsDto,
    @CurrentUser() user: SessionUser,
  ): Promise<ListMyAppointmentsResult> {
    return this.appointmentsService.listMyAppointments(user.id, query);
  }

  /**
   * US5 — Patient cancels their own appointment. Enforces the
   * 24-hour cutoff (403 within 24h, 404 cross-patient).
   */
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel my appointment (patient)' })
  @ApiOkResponse({ description: 'Appointment cancelled; slot released.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({ description: 'Within 24h of scheduled time.' })
  @ApiNotFoundResponse({
    description:
      'Appointment does not exist or belongs to a different patient.',
  })
  @ApiConflictResponse({
    description: 'Appointment is already CANCELLED or COMPLETED.',
  })
  cancelMine(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ appointment: AppointmentResponseDto }> {
    return this.appointmentsService.cancelMyAppointment(user.id, id);
  }
}
