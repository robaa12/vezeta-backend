import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service.js';
import {
  APPOINTMENT_CANCELLED,
  APPOINTMENT_COMPLETED,
  APPOINTMENT_CONFIRMED,
  APPOINTMENT_CREATED,
  type AppointmentCancelledPayload,
  type AppointmentEventPayload,
} from '../../common/events/domain-events.js';

const fmtDate = (d: Date): string =>
  d.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

/**
 * Event-driven side effects for appointment lifecycle events
 * (Constitution Principle II — Domain-Event Decoupling). Each
 * listener writes a Notification row and dispatches an email. Failed
 * dispatches mark the row FAILED; the primary operation continues.
 */
@Injectable()
export class AppointmentListener {
  private readonly logger = new Logger(AppointmentListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(APPOINTMENT_CREATED)
  async handleCreated(payload: AppointmentEventPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.userId,
      title: 'Appointment request received',
      body: `Your appointment with ${payload.doctorName} (${payload.categoryName}) is pending confirmation. Scheduled for ${fmtDate(payload.scheduledAt)} UTC.`,
      metadata: {
        kind: 'appointment.created',
        appointmentId: payload.appointmentId,
      },
    });
  }

  @OnEvent(APPOINTMENT_CONFIRMED)
  async handleConfirmed(payload: AppointmentEventPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.userId,
      title: 'Appointment confirmed',
      body: `${payload.doctorName} (${payload.categoryName}) confirmed your appointment for ${fmtDate(payload.scheduledAt)} UTC.`,
      metadata: {
        kind: 'appointment.confirmed',
        appointmentId: payload.appointmentId,
      },
    });
  }

  @OnEvent(APPOINTMENT_CANCELLED)
  async handleCancelled(payload: AppointmentCancelledPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.userId,
      title: 'Appointment cancelled',
      body: `Your appointment with ${payload.doctorName} on ${fmtDate(payload.scheduledAt)} UTC has been cancelled by ${payload.cancelledBy === 'ADMIN' ? 'the clinic' : 'you'}.`,
      metadata: {
        kind: 'appointment.cancelled',
        appointmentId: payload.appointmentId,
        cancelledBy: payload.cancelledBy,
      },
    });
  }

  @OnEvent(APPOINTMENT_COMPLETED)
  async handleCompleted(payload: AppointmentEventPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.userId,
      title: 'How was your visit?',
      body: `Your appointment with ${payload.doctorName} is complete. Leave a review to help other patients.`,
      metadata: {
        kind: 'appointment.completed',
        appointmentId: payload.appointmentId,
      },
    });
  }
}
