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
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary: 'List ACTIVE doctors (public)',
    description:
      'Anonymous-accessible listing of doctors. Optional filters: categoryId (FK equality, requires the category to be ACTIVE) and search (case-insensitive substring on name + category.name). Pagination via page (default 1) and pageSize (default 20, max 100).',
  })
  @ApiOkResponse({
    description: 'Paginated list of doctors.',
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
  @Header('Cache-Control', 'public, max-age=300')
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
      properties: { doctor: { type: 'object' } },
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
