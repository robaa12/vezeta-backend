import { Module } from '@nestjs/common';
import {
  AdminLaboratoriesController,
  LaboratoriesController,
} from './laboratories.controller.js';
import { LaboratoriesService } from './laboratories.service.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

@Module({
  controllers: [LaboratoriesController, AdminLaboratoriesController],
  providers: [LaboratoriesService, RolesGuard],
})
export class LaboratoriesModule {}
