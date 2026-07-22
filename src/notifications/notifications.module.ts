import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { AppointmentListener } from './listeners/appointment.listener.js';
import { FeedbackListener } from './listeners/feedback.listener.js';
import { RemindersCron } from './notifications.cron.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    AppointmentListener,
    FeedbackListener,
    RemindersCron,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
