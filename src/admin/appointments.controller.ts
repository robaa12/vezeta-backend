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
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
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
  constructor(private readonly appointmentsService: AppointmentsService) {}

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
  ): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService
      .createSlot(doctorId, body)
      .then((slot) => ({ slot }));
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
  ): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService
      .updateSlot(id, body)
      .then((slot) => ({ slot }));
  }

  @Patch('slots/:id/block')
  @ApiOperation({ summary: 'Soft-block a slot (idempotent)' })
  @ApiParam({ name: 'id', description: 'Slot id (cuid)' })
  @ApiOkResponse({ description: 'Slot blocked.' })
  @ApiNotFoundResponse({ description: 'Slot not found.' })
  @ApiConflictResponse({ description: 'Slot is BOOKED.' })
  blockSlot(@Param('id') id: string): Promise<{ slot: SlotResponseDto }> {
    return this.appointmentsService.blockSlot(id).then((slot) => ({ slot }));
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
  async deleteSlot(@Param('id') id: string): Promise<void> {
    await this.appointmentsService.deleteSlot(id);
  }
}
