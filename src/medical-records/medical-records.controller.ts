import {
  Body,
  Controller,
  Get,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { MedicalRecordsService } from './medical-records.service.js';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
} from './dto/create-medical-record.dto.js';
import { ListMedicalHistoryDto } from './dto/list-medical-history.dto.js';
import type {
  ListMedicalHistoryResult,
  MedicalRecordResponseDto,
} from './dto/medical-record-response.dto.js';

/**
 * Admin-authored medical records. Doctors are not platform users
 * (feature `003-remove-doctor-role`), so the admin acts on the treating
 * doctor's behalf to write the post-visit notes. Access is restricted
 * to the admin (acting as the treating doctor) and the patient who
 * owns the appointment (constitution §VI — non-negotiable day-one
 * constraint).
 */
@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin/appointments/:id/medical-record')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminMedicalRecordsController {
  constructor(private readonly medicalRecords: MedicalRecordsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a medical record for a COMPLETED appointment (admin)',
  })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Medical record created.' })
  @ApiBadRequestResponse({ description: 'No fields supplied.' })
  @ApiNotFoundResponse({ description: 'Appointment not found.' })
  @ApiConflictResponse({
    description:
      'Appointment is not COMPLETED, or a medical record already exists for it.',
  })
  create(
    @Param('id') id: string,
    @Body() body: CreateMedicalRecordDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    return this.medicalRecords.createForAppointment(id, admin.id, body);
  }

  @Patch()
  @ApiOperation({ summary: 'Update an existing medical record (admin)' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Medical record updated.' })
  @ApiBadRequestResponse({ description: 'No fields to update.' })
  @ApiNotFoundResponse({ description: 'Medical record not found.' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateMedicalRecordDto,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    return this.medicalRecords.updateForAppointment(id, body);
  }
}

/**
 * Read path — admin OR owning patient. Authenticated-only. The
 * concentration §VI "treating doctor or patient only" rule is
 * enforced at the service layer: the patient gets 404 for records
 * they don't own to avoid information disclosure.
 */
@ApiTags('medical-records')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Account is deactivated.' })
@Controller('api')
export class MedicalRecordsController {
  constructor(private readonly medicalRecords: MedicalRecordsService) {}

  @Get('appointments/:id/medical-record')
  @ApiOperation({ summary: 'Read the medical record for an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Medical record.' })
  @ApiNotFoundResponse({
    description:
      'Medical record does not exist or caller is not authorised to view it.',
  })
  getByAppointment(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ medicalRecord: MedicalRecordResponseDto }> {
    return this.medicalRecords.getByAppointment(user.id, user.role, id);
  }

  @Get('patients/me/medical-history')
  @ApiOperation({
    summary: "List the caller's full medical history across doctors",
    description:
      'Paginated list of all medical records owned by the caller, newest first.',
  })
  @ApiOkResponse({ description: 'Paginated medical history.' })
  listMyHistory(
    @Query() query: ListMedicalHistoryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<ListMedicalHistoryResult> {
    return this.medicalRecords.listMyHistory(user.id, query);
  }
}
