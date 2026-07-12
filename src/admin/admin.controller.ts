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
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  AdminService,
  type DoctorRecord,
  type UserRecord,
} from './admin.service.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { ListDoctorsDto } from './dto/list-doctors.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';
import { RoleChangeDto } from './dto/role-change.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---------------- Doctor CRUD ----------------

  @Get('doctors')
  @ApiOperation({
    summary: 'List doctors',
    description:
      'Returns doctors with optional status, categoryId, search filters and pagination.',
  })
  @ApiOkResponse({
    description: 'Doctors and pagination metadata.',
    schema: {
      type: 'object',
      properties: {
        doctors: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
      },
    },
  })
  listDoctors(@Query() query: ListDoctorsDto): Promise<{
    doctors: DoctorRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.adminService.listDoctors(query);
  }

  @Post('doctors')
  @ApiOperation({ summary: 'Create a new doctor record' })
  @ApiCreatedResponse({ description: 'Doctor created.' })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  createDoctor(
    @Body() body: CreateDoctorDto,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService.createDoctor(body).then((doctor) => ({ doctor }));
  }

  @Get('doctors/:id')
  @ApiOperation({ summary: 'Get a doctor by id' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  getDoctor(@Param('id') id: string): Promise<{ doctor: DoctorRecord }> {
    return this.adminService.getDoctor(id).then((doctor) => ({ doctor }));
  }

  @Patch('doctors/:id')
  @ApiOperation({ summary: 'Update a doctor (partial)' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiConflictResponse({ description: 'No fields to update.' })
  updateDoctor(
    @Param('id') id: string,
    @Body() body: UpdateDoctorDto,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .updateDoctor(id, body)
      .then((doctor) => ({ doctor }));
  }

  @Patch('doctors/:id/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate a doctor' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiConflictResponse({ description: 'Doctor is already deactivated.' })
  deactivateDoctor(@Param('id') id: string): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .deactivateDoctor(id)
      .then((doctor) => ({ doctor }));
  }

  @Delete('doctors/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete a doctor' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiNoContentResponse({ description: 'Doctor deleted.' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  async deleteDoctor(@Param('id') id: string): Promise<void> {
    await this.adminService.deleteDoctor(id);
  }

  // ---------------- User management ----------------

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  getUser(@Param('id') id: string): Promise<{ user: UserRecord }> {
    return this.adminService.getUser(id).then((user) => ({ user }));
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Promote or demote a user' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiBadRequestResponse({ description: 'Invalid role value.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({
    description: 'Demotion rejected — last active admin.',
  })
  changeUserRole(
    @Param('id') id: string,
    @Body() body: RoleChangeDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ user: UserRecord }> {
    return this.adminService
      .changeUserRole(id, body.role, admin.id)
      .then((user) => ({ user }));
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user account' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  deactivateUser(@Param('id') id: string): Promise<{
    success: true;
    user: { id: string; isActive: boolean; name: string; email: string };
  }> {
    return this.adminService
      .deactivateUser(id)
      .then((user) => ({ success: true as const, user }));
  }

  @Get('ping')
  @AllowAnonymous()
  @ApiOperation({ summary: 'Admin module liveness probe' })
  @ApiOkResponse({
    description: 'Pong.',
    schema: {
      type: 'object',
      properties: { pong: { type: 'boolean', example: true } },
    },
  })
  ping(): { pong: true } {
    return { pong: true };
  }
}
