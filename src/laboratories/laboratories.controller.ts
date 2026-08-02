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
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
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
import {
  CreateLaboratoryDto,
  LaboratoryServiceDto,
  UpdateLaboratoryDto,
} from './dto/manage-laboratory.dto.js';
import { LaboratoriesService } from './laboratories.service.js';

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
  create(@Body() dto: CreateLaboratoryDto) {
    return this.laboratoriesService.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.laboratoriesService.getAdmin(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLaboratoryDto) {
    return this.laboratoriesService.update(id, dto);
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
