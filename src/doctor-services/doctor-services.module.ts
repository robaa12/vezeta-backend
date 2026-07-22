import { Module } from '@nestjs/common';
import { DoctorServicesService } from './doctor-services.service.js';
import { AdminDoctorServicesController } from './admin-doctor-services.controller.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  controllers: [AdminDoctorServicesController],
  providers: [DoctorServicesService, RolesGuard],
  exports: [DoctorServicesService],
})
export class DoctorServicesModule {}
