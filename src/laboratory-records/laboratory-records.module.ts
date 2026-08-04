import { Module } from '@nestjs/common';
import {
  AdminLaboratoryRecordsController,
  LaboratoryRecordsController,
} from './laboratory-records.controller.js';
import { LaboratoryRecordsService } from './laboratory-records.service.js';

@Module({
  controllers: [AdminLaboratoryRecordsController, LaboratoryRecordsController],
  providers: [LaboratoryRecordsService],
})
export class LaboratoryRecordsModule {}
