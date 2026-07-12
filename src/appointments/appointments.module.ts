import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { SlotsController } from './slots.controller.js';

@Module({
  controllers: [SlotsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
