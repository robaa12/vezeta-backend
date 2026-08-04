import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { BookLaboratoryVisitDto } from './dto/book-laboratory-visit.dto.js';
import { ListLaboratoriesDto } from './dto/list-laboratories.dto.js';
import { ListLaboratoryBookingsDto } from './dto/list-laboratory-bookings.dto.js';
import { ListLaboratoryReviewsDto } from './dto/list-laboratory-reviews.dto.js';
import { CreateReviewDto } from '../reviews/dto/create-review.dto.js';
import {
  CreateLaboratoryDto,
  LaboratoryServiceDto,
  UpdateLaboratoryDto,
} from './dto/manage-laboratory.dto.js';
import { LaboratoriesService } from './laboratories.service.js';
import { laboratoryImageMulterOpts } from '../upload/multer.config.js';

const LABORATORY_IMAGE_BODY_SCHEMA = {
  type: 'object',
  properties: {
    image: {
      type: 'string',
      format: 'binary',
      description:
        'Laboratory profile image. Accepted formats: JPEG, PNG, GIF, WebP. Max size: 5 MB.',
    },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
};

@ApiTags('laboratories')
@Controller('api/laboratories')
export class LaboratoriesController {
  constructor(private readonly laboratoriesService: LaboratoriesService) {}

  @Get()
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List active laboratories' })
  @ApiOkResponse({ description: 'Laboratories filtered by search and city.' })
  list(@Query() query: ListLaboratoriesDto) {
    return this.laboratoriesService.list(query);
  }

  @Get('bookings/me')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List the authenticated user laboratory visits' })
  listMyBookings(
    @CurrentUser() user: SessionUser,
    @Query() query: ListLaboratoryBookingsDto,
  ) {
    return this.laboratoriesService.listMyBookings(user.id, query);
  }

  @Get('bookings/me/:bookingId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get one laboratory visit owned by the user' })
  getMyBooking(
    @CurrentUser() user: SessionUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.laboratoriesService.getMyBooking(user.id, bookingId);
  }

  @Patch('bookings/me/:bookingId/cancel')
  @ApiOperation({ summary: 'Cancel one laboratory visit owned by the user' })
  cancelMyBooking(
    @CurrentUser() user: SessionUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.laboratoriesService.cancelMyBooking(user.id, bookingId);
  }

  @Post('bookings/me/:bookingId/review')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Leave a review for a completed laboratory visit' })
  @ApiOkResponse({ description: 'Laboratory review created.' })
  createMyReview(
    @CurrentUser() user: SessionUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.laboratoriesService.createMyReview(user.id, bookingId, dto);
  }

  @Get(':id')
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get laboratory details and available tests' })
  get(@Param('id') id: string) {
    return this.laboratoriesService.get(id);
  }

  @Get(':id/reviews')
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'List laboratory reviews' })
  listReviews(@Param('id') id: string) {
    return this.laboratoriesService.listReviews(id);
  }

  @Post(':id/bookings')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Book a laboratory visit' })
  @ApiCreatedResponse({ description: 'Laboratory visit confirmed.' })
  book(
    @Param('id') id: string,
    @Body() dto: BookLaboratoryVisitDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.laboratoriesService.book(user.id, id, dto);
  }
}

@ApiTags('admin')
@Controller('api/admin/laboratory-bookings')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminLaboratoryBookingsController {
  constructor(private readonly laboratoriesService: LaboratoriesService) {}

  @Get()
  list(@Query() query: ListLaboratoryBookingsDto) {
    return this.laboratoriesService.listAdminBookings(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.laboratoriesService.getAdminBooking(id);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.laboratoriesService.completeBooking(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.laboratoriesService.cancelAdminBooking(id);
  }
}

@ApiTags('admin')
@Controller('api/admin/laboratory-reviews')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminLaboratoryReviewsController {
  constructor(private readonly laboratoriesService: LaboratoriesService) {}

  @Get()
  list(@Query() query: ListLaboratoryReviewsDto) {
    return this.laboratoriesService.listAdminReviews(query);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.laboratoriesService.deleteAdminReview(id);
  }
}

@ApiTags('admin')
@Controller('api/admin/laboratories')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminLaboratoriesController {
  constructor(private readonly laboratoriesService: LaboratoriesService) {}

  @Get()
  list(@Query() query: ListLaboratoriesDto) {
    return this.laboratoriesService.listAdmin(query);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: LABORATORY_IMAGE_BODY_SCHEMA })
  @UseInterceptors(FileInterceptor('image', laboratoryImageMulterOpts))
  create(
    @Body() dto: CreateLaboratoryDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.laboratoriesService.create(dto, image);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.laboratoriesService.getAdmin(id);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: LABORATORY_IMAGE_BODY_SCHEMA })
  @UseInterceptors(FileInterceptor('image', laboratoryImageMulterOpts))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLaboratoryDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.laboratoriesService.update(id, dto, image);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.laboratoriesService.setStatus(id, 'DEACTIVATED');
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.laboratoriesService.setStatus(id, 'ACTIVE');
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.laboratoriesService.delete(id);
  }

  @Post(':id/services')
  createService(@Param('id') id: string, @Body() dto: LaboratoryServiceDto) {
    return this.laboratoriesService.createService(id, dto);
  }

  @Patch(':id/services/:serviceId')
  updateService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: LaboratoryServiceDto,
  ) {
    return this.laboratoriesService.updateService(id, serviceId, dto);
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(204)
  deleteService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.laboratoriesService.deleteService(id, serviceId);
  }
}
