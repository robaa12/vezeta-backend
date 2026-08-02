import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  DoctorsService,
  type ListPublicDoctorsResult,
  type PublicDoctorRecord,
} from './doctors.service.js';
import { ListPublicDoctorsDto } from './dto/list-doctors.dto.js';

// Public-facing doctor schemas. The list item is intentionally lighter
// (no bio or services), while still including the image and aggregate
// rating needed by catalog cards. The detail item is the full record.
const PUBLIC_DOCTOR_LOCATION_SCHEMA = {
  type: 'object',
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
      description:
        'Generated Google Maps link when a precise latitude/longitude pin exists; otherwise null.',
    },
  },
  required: ['address', 'latitude', 'longitude', 'googleMapsUrl'],
};

const PUBLIC_DOCTOR_LIST_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    },
    imageUrl: { type: 'string', nullable: true },
    location: PUBLIC_DOCTOR_LOCATION_SCHEMA,
    averageRating: {
      type: 'number',
      nullable: true,
      minimum: 1,
      maximum: 5,
    },
    reviewCount: { type: 'integer', minimum: 0 },
    status: { type: 'string', enum: ['ACTIVE', 'DEACTIVATED'] },
  },
  required: [
    'id',
    'name',
    'category',
    'imageUrl',
    'location',
    'averageRating',
    'reviewCount',
    'status',
  ],
};

const PUBLIC_DOCTOR_DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    },
    bio: { type: 'string', nullable: true },
    imageUrl: {
      type: 'string',
      nullable: true,
      description:
        "Relative path to the doctor's profile image, e.g. `/uploads/doctors/<uuid>.jpg`. Prepend the API base URL to display. `null` if no image has been uploaded.",
      example: '/uploads/doctors/clx123abc.jpg',
    },
    location: PUBLIC_DOCTOR_LOCATION_SCHEMA,
    status: { type: 'string', enum: ['ACTIVE', 'DEACTIVATED'] },
    services: {
      type: 'array',
      items: { type: 'object' },
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
    'createdAt',
    'updatedAt',
  ],
};

@ApiTags('doctors')
@ApiProduces('application/json')
@Controller('api')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  /**
   * US1 / US4 — Browse the doctor catalog.
   * No in-process caching (the service reads Prisma on every call);
   * the `Cache-Control` header is an advisory hint to intermediaries
   * that helps meet the 5-second freshness target (US6) without
   * pinning the application to an in-process cache.
   */
  @Get('doctors')
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // Doctor status can change from the admin dashboard, so stale public
  // catalog responses must not keep deactivated doctors visible.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List ACTIVE doctors (public)',
    description:
      'Anonymous-accessible listing of doctors. Optional filters: categoryId (FK equality, requires the category to be ACTIVE) and search (case-insensitive substring on doctor name, category name, or clinic address). Pagination via page (default 1) and pageSize (default 20, max 100).',
  })
  @ApiOkResponse({
    description: 'Paginated list of doctors.',
    schema: {
      type: 'object',
      properties: {
        doctors: { type: 'array', items: PUBLIC_DOCTOR_LIST_ITEM_SCHEMA },
        total: { type: 'integer' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  listDoctors(
    @Query() query: ListPublicDoctorsDto,
  ): Promise<ListPublicDoctorsResult> {
    return this.doctorsService.listPublicDoctors(query);
  }

  /**
   * US4 — Public doctor profile. Returns 404 for non-existent ids,
   * DEACTIVATED doctors, and doctors whose category is DEACTIVATED
   * (consistent with FR-006 + US6 from feature 005).
   */
  @Get('doctors/:id')
  @AllowAnonymous()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get a public doctor profile',
    description:
      'Returns the full public record of a single ACTIVE doctor whose category is also ACTIVE. Returns 404 otherwise.',
  })
  @ApiParam({ name: 'id', description: 'Doctor id (cuid)' })
  @ApiOkResponse({
    description: 'Doctor found.',
    schema: {
      type: 'object',
      properties: { doctor: PUBLIC_DOCTOR_DETAIL_SCHEMA },
      required: ['doctor'],
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  async getDoctor(
    @Param('id') id: string,
  ): Promise<{ doctor: PublicDoctorRecord }> {
    const doctor = await this.doctorsService.getPublicDoctor(id);
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    return { doctor };
  }
}
