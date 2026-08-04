import { Module } from '@nestjs/common';
import {
  AdminLaboratoryBookingsController,
  AdminLaboratoriesController,
  AdminLaboratoryReviewsController,
  LaboratoriesController,
} from './laboratories.controller.js';
import { LaboratoriesService } from './laboratories.service.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  controllers: [
    LaboratoriesController,
    AdminLaboratoriesController,
    AdminLaboratoryBookingsController,
    AdminLaboratoryReviewsController,
  ],
  providers: [LaboratoriesService, RolesGuard],
})
export class LaboratoriesModule {}
