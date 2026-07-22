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
  ApiCookieAuth,
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
import {
  DoctorServicesService,
  type ListDoctorServicesResult,
} from './doctor-services.service.js';
import { CreateDoctorServiceDto } from './dto/create-doctor-service.dto.js';
import { ListDoctorServicesDto } from './dto/list-doctor-services.dto.js';
import { UpdateDoctorServiceDto } from './dto/update-doctor-service.dto.js';
import type { DoctorServiceResponseDto } from './dto/doctor-service-response.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin/doctors/:doctorId/services')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminDoctorServicesController {
  constructor(private readonly doctorServicesService: DoctorServicesService) {}

  @Get()
  @ApiOperation({
    summary: "List a doctor's services (admin)",
    description:
      'Returns the services attached to a single doctor with optional status filter and pagination. Admin-only.',
  })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiOkResponse({ description: 'Paginated list of services.' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  list(
    @Param('doctorId') doctorId: string,
    @Query() query: ListDoctorServicesDto,
  ): Promise<ListDoctorServicesResult> {
    return this.doctorServicesService.listForDoctor(doctorId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a service for a doctor (admin)' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiOkResponse({ description: 'Service created.' })
  @ApiBadRequestResponse({
    description:
      'Validation error (e.g. discount without price, or no fields).',
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  create(
    @Param('doctorId') doctorId: string,
    @Body() body: CreateDoctorServiceDto,
  ): Promise<{ service: DoctorServiceResponseDto }> {
    return this.doctorServicesService
      .createForDoctor(doctorId, body)
      .then((service) => ({ service }));
  }

  @Get(':serviceId')
  @ApiOperation({ summary: 'Get a single service for a doctor (admin)' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiParam({ name: 'serviceId', description: 'Service id (cuid)' })
  @ApiOkResponse({ description: 'Service found.' })
  @ApiNotFoundResponse({ description: 'Service not found.' })
  getOne(
    @Param('doctorId') doctorId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<{ service: DoctorServiceResponseDto }> {
    return this.doctorServicesService
      .getForDoctor(doctorId, serviceId)
      .then((service) => ({ service }));
  }

  @Patch(':serviceId')
  @ApiOperation({ summary: 'Update a service (partial)' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiParam({ name: 'serviceId', description: 'Service id (cuid)' })
  @ApiOkResponse({ description: 'Service updated.' })
  @ApiBadRequestResponse({
    description: 'No fields to update, or discount/price inconsistency.',
  })
  @ApiNotFoundResponse({ description: 'Service not found.' })
  update(
    @Param('doctorId') doctorId: string,
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateDoctorServiceDto,
  ): Promise<{ service: DoctorServiceResponseDto }> {
    return this.doctorServicesService
      .updateForDoctor(doctorId, serviceId, body)
      .then((service) => ({ service }));
  }

  @Patch(':serviceId/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate a service' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiParam({ name: 'serviceId', description: 'Service id (cuid)' })
  @ApiOkResponse({ description: 'Service deactivated (idempotent).' })
  @ApiNotFoundResponse({ description: 'Service not found.' })
  deactivate(
    @Param('doctorId') doctorId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<{ service: DoctorServiceResponseDto }> {
    return this.doctorServicesService
      .deactivateForDoctor(doctorId, serviceId)
      .then((service) => ({ service }));
  }

  @Delete(':serviceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete a service' })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiParam({ name: 'serviceId', description: 'Service id (cuid)' })
  @ApiNoContentResponse({ description: 'Service deleted.' })
  @ApiNotFoundResponse({ description: 'Service not found.' })
  async delete(
    @Param('doctorId') doctorId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<void> {
    await this.doctorServicesService.deleteForDoctor(doctorId, serviceId);
  }
}
