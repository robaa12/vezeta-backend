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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
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
  type AdminStats,
  type DoctorRecord,
  type UserRecord,
} from './admin.service.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { ListDoctorsDto } from './dto/list-doctors.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { RoleChangeDto } from './dto/role-change.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { doctorImageMulterOpts } from '../upload/multer.config.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { MAX_DOCTOR_ADDRESS_LENGTH } from '../common/constants.js';

// Shared response schema for the Doctor payload. Used by every doctor
// endpoint so the generated OpenAPI surface documents `imageUrl` (and
// the rest of the doctor shape) the same way for create, update,
// get, and list responses.
const DOCTOR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Doctor id (cuid).' },
    name: { type: 'string', description: "Doctor's full display name." },
    category: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['id', 'name'],
    },
    bio: {
      type: 'string',
      nullable: true,
      description: 'Short biography / about section.',
    },
    imageUrl: {
      type: 'string',
      nullable: true,
      description:
        "Relative path to the doctor's profile image, e.g. `/uploads/doctors/<uuid>.jpg`. Prepend the API base URL to display. `null` if no image has been uploaded.",
      example: '/uploads/doctors/clx123abc.jpg',
    },
    location: {
      type: 'object',
      description:
        'Clinic location. `googleMapsUrl` uses exact coordinates when available, otherwise searches the address.',
      properties: {
        address: { type: 'string', nullable: true },
        latitude: { type: 'number', nullable: true, minimum: -90, maximum: 90 },
        longitude: {
          type: 'number',
          nullable: true,
          minimum: -180,
          maximum: 180,
        },
        googleMapsUrl: {
          type: 'string',
          nullable: true,
          format: 'uri',
          description: 'Google Maps link for the clinic location.',
        },
      },
      required: ['address', 'latitude', 'longitude', 'googleMapsUrl'],
    },
    status: { type: 'string', enum: ['ACTIVE', 'DEACTIVATED'] },
    services: {
      type: 'array',
      items: { type: 'object' },
      description: 'Per-doctor service catalog (admin view).',
    },
    serviceCount: {
      type: 'integer',
      minimum: 0,
      description: 'Total number of services configured for this doctor.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'name',
    'category',
    'location',
    'status',
    'serviceCount',
    'createdAt',
    'updatedAt',
  ],
};

const DOCTOR_WRAPPED_SCHEMA = {
  type: 'object',
  properties: { doctor: DOCTOR_RESPONSE_SCHEMA },
  required: ['doctor'],
};

// Multipart request-body schemas. The @nestjs/swagger plugin derives
// the request body shape from the DTO class, which doesn't have the
// `image` file field (multer parses it via @UploadedFile before the
// DTO is bound). Use an explicit @ApiBody schema so the generated
// OpenAPI surface advertises the file upload, including the
// content-type and size constraints enforced by doctorImageMulterOpts.
const IMAGE_FIELD_SCHEMA = {
  type: 'string',
  format: 'binary',
  description:
    'Doctor profile image. Accepted formats: JPEG, PNG, GIF, WebP. Max size: 5 MB.',
};

const CREATE_DOCTOR_BODY_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 120,
      description: "Doctor's full display name.",
      example: 'Dr. Jane Smith',
    },
    categoryId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'Id of the ACTIVE category this doctor belongs to.',
      example: 'seed_cardiology',
    },
    bio: {
      type: 'string',
      maxLength: 2000,
      description: 'Short biography / about section.',
    },
    address: {
      type: 'string',
      maxLength: MAX_DOCTOR_ADDRESS_LENGTH,
      description:
        'Clinic address. For a Google Maps picker, submit its formatted address with latitude and longitude.',
      example: '15 Tahrir Square, Cairo, Egypt',
    },
    latitude: {
      type: 'number',
      minimum: -90,
      maximum: 90,
      description:
        'Google Maps picker latitude or manually entered coordinate.',
      example: 30.0444,
    },
    longitude: {
      type: 'number',
      minimum: -180,
      maximum: 180,
      description:
        'Google Maps picker longitude or manually entered coordinate.',
      example: 31.2357,
    },
    image: IMAGE_FIELD_SCHEMA,
  },
  required: ['name', 'categoryId'],
};

const UPDATE_DOCTOR_BODY_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 120,
    },
    categoryId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'Id of an ACTIVE category to reassign the doctor to.',
    },
    bio: {
      type: 'string',
      maxLength: 2000,
    },
    address: {
      type: 'string',
      maxLength: MAX_DOCTOR_ADDRESS_LENGTH,
      description: 'Clinic address. Submit an empty string to clear it.',
    },
    latitude: {
      type: 'number',
      nullable: true,
      minimum: -90,
      maximum: 90,
      description:
        'Google Maps picker latitude. Pass null with longitude to clear both.',
    },
    longitude: {
      type: 'number',
      nullable: true,
      minimum: -180,
      maximum: 180,
      description:
        'Google Maps picker longitude. Pass null with latitude to clear both.',
    },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'DEACTIVATED'],
    },
    image: {
      ...IMAGE_FIELD_SCHEMA,
      description:
        'New doctor profile image. Accepted formats: JPEG, PNG, GIF, WebP. Max size: 5 MB. If omitted the existing image is kept.',
    },
  },
};

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
        doctors: { type: 'array', items: DOCTOR_RESPONSE_SCHEMA },
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: CREATE_DOCTOR_BODY_SCHEMA })
  @ApiCreatedResponse({
    description: 'Doctor created.',
    schema: DOCTOR_WRAPPED_SCHEMA,
  })
  @ApiBadRequestResponse({
    description: 'Validation error or invalid image (wrong type / too large).',
  })
  @UseInterceptors(FileInterceptor('image', doctorImageMulterOpts))
  createDoctor(
    @Body() body: CreateDoctorDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .createDoctor(body, image, admin.id)
      .then((doctor) => ({ doctor }));
  }

  @Get('doctors/:id')
  @ApiOperation({ summary: 'Get a doctor by id' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiOkResponse({
    description: 'Doctor found.',
    schema: DOCTOR_WRAPPED_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  getDoctor(@Param('id') id: string): Promise<{ doctor: DoctorRecord }> {
    return this.adminService.getDoctor(id).then((doctor) => ({ doctor }));
  }

  @Patch('doctors/:id')
  @ApiOperation({ summary: 'Update a doctor (partial)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPDATE_DOCTOR_BODY_SCHEMA })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiOkResponse({
    description: 'Doctor updated.',
    schema: DOCTOR_WRAPPED_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiConflictResponse({ description: 'No fields to update.' })
  @UseInterceptors(FileInterceptor('image', doctorImageMulterOpts))
  updateDoctor(
    @Param('id') id: string,
    @Body() body: UpdateDoctorDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .updateDoctor(id, body, image, admin.id)
      .then((doctor) => ({ doctor }));
  }

  @Patch('doctors/:id/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate a doctor' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiOkResponse({
    description: 'Doctor deactivated.',
    schema: DOCTOR_WRAPPED_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiConflictResponse({ description: 'Doctor is already deactivated.' })
  deactivateDoctor(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .deactivateDoctor(id, admin.id)
      .then((doctor) => ({ doctor }));
  }

  @Patch('doctors/:id/activate')
  @ApiOperation({ summary: 'Activate a doctor' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiOkResponse({
    description: 'Doctor activated.',
    schema: DOCTOR_WRAPPED_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiConflictResponse({ description: 'Doctor is already active.' })
  activateDoctor(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ doctor: DoctorRecord }> {
    return this.adminService
      .activateDoctor(id, admin.id)
      .then((doctor) => ({ doctor }));
  }

  @Delete('doctors/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete a doctor' })
  @ApiParam({ name: 'id', description: 'Doctor id' })
  @ApiNoContentResponse({ description: 'Doctor deleted.' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  async deleteDoctor(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<void> {
    await this.adminService.deleteDoctor(id, admin.id);
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
  deactivateUser(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{
    success: true;
    user: { id: string; isActive: boolean; name: string; email: string };
  }> {
    return this.adminService
      .deactivateUser(id, admin.id)
      .then((user) => ({ success: true as const, user }));
  }

  @Patch('users/:id/activate')
  @ApiOperation({ summary: 'Activate a user account' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({ description: 'User is already active.' })
  activateUser(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{
    success: true;
    user: { id: string; isActive: boolean; name: string; email: string };
  }> {
    return this.adminService
      .activateUser(id, admin.id)
      .then((user) => ({ success: true as const, user }));
  }

  @Get('users')
  @ApiOperation({
    summary: 'List users (admin)',
    description:
      'Paginated list of all users. Filterable by role, isActive status, and search (name/email).',
  })
  @ApiOkResponse({
    description: 'Paginated list of users.',
    schema: {
      type: 'object',
      properties: {
        users: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
      },
    },
  })
  listUsers(@Query() query: ListUsersDto): Promise<{
    users: UserRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.adminService.listUsers(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Dashboard statistics (admin)',
    description:
      'Aggregated counts for users, doctors, categories, appointments, reviews, medical records, and notifications.',
  })
  @ApiOkResponse({
    description: 'Dashboard stats.',
    schema: { type: 'object' },
  })
  getStats(): Promise<AdminStats> {
    return this.adminService.getStats();
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
