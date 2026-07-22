import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminAppointmentsController } from './appointments.controller.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { AuditModule } from '../common/audit/audit.module.js';

@Module({
  imports: [AppointmentsModule, AuditModule],
  controllers: [AdminController, AdminAppointmentsController],
  providers: [AdminService, RolesGuard],
  exports: [AdminService],
})
export class AdminModule {}
