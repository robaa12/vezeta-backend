import { Module } from '@nestjs/common';
import {
  AdminMedicalRecordsController,
  MedicalRecordsController,
} from './medical-records.controller.js';
import { MedicalRecordsService } from './medical-records.service.js';

@Module({
  controllers: [AdminMedicalRecordsController, MedicalRecordsController],
  providers: [MedicalRecordsService],
  exports: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
