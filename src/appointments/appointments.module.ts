import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';
import { SlotsController } from './slots.controller.js';

@Module({
  controllers: [SlotsController, AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
