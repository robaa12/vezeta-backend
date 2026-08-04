import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { laboratoryRecordImageMulterOpts } from '../upload/multer.config.js';
import { LaboratoryRecordsService } from './laboratory-records.service.js';
import { SaveLaboratoryMedicalRecordDto } from './dto/laboratory-medical-record.dto.js';

@ApiTags('admin')
@Controller('api/admin/laboratory-bookings/:id/medical-record')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminLaboratoryRecordsController {
  constructor(private readonly records: LaboratoryRecordsService) {}

  @Get()
  get(@Param('id') id: string) {
    return this.records.getForAdmin(id);
  }

  @Post()
  create(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
    @Body() body: SaveLaboratoryMedicalRecordDto,
  ) {
    return this.records.create(id, admin.id, body);
  }

  @Patch()
  update(@Param('id') id: string, @Body() body: SaveLaboratoryMedicalRecordDto) {
    return this.records.update(id, body);
  }

  @Post('attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
      required: ['image'],
    },
  })
  @UseInterceptors(FileInterceptor('image', laboratoryRecordImageMulterOpts))
  upload(@Param('id') id: string, @UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('An image is required');
    return this.records.uploadAttachment(id, image);
  }
}

@ApiTags('medical-records')
@Controller('api/laboratories/bookings/me/:id/medical-record')
export class LaboratoryRecordsController {
  constructor(private readonly records: LaboratoryRecordsService) {}

  @Get()
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.records.getForPatient(user.id, id);
  }
}
