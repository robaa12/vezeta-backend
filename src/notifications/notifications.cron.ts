import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

type AppointmentRow = {
  id: string;
  userId: string;
  scheduledAt: Date;
  doctor: {
    id: string;
    name: string;
    category: { id: string; name: string };
  };
  status: string;
};

type ReminderKind = 'appointment.reminder.24h' | 'appointment.reminder.1h';

interface ReminderConfig {
  kind: ReminderKind;
  title: string;
  bodyTemplate: (appt: AppointmentRow) => string;
  /**
   * Forward-window: appointments with scheduledAt between
   * [now + windowStartMs, now + windowEndMs) are eligible.
   */
  windowStartMs: number;
  windowEndMs: number;
}

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const fmtDate = (d: Date): string =>
  d.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

const CONFIGS: ReminderConfig[] = [
  {
    kind: 'appointment.reminder.24h',
    title: 'Upcoming appointment tomorrow',
    bodyTemplate: (appt: AppointmentRow) =>
      `Reminder: you have an appointment with ${appt.doctor.name} (${appt.doctor.category.name}) tomorrow at ${fmtDate(appt.scheduledAt)} UTC.`,
    windowStartMs: 23 * HOUR,
    windowEndMs: 25 * HOUR + MINUTE,
  },
  {
    kind: 'appointment.reminder.1h',
    title: 'Appointment in 1 hour',
    bodyTemplate: (appt: AppointmentRow) =>
      `Your appointment with ${appt.doctor.name} (${appt.doctor.category.name}) starts in about 1 hour at ${fmtDate(appt.scheduledAt)} UTC.`,
    windowStartMs: 45 * MINUTE,
    windowEndMs: 75 * MINUTE,
  },
];

/**
 * Appointment reminder cron. Runs every 15 minutes and sends two kinds
 * of reminder per CONFIRMED appointment:
 *
 * 1. **24h ahead** — fires when the appointment is ~24 hours away.
 * 2. **1h ahead** — fires when the appointment is ~1 hour away.
 *
 * Each reminder is atomically claimed by a unique notification
 * idempotency key, so parallel cron replicas cannot dispatch duplicates.
 *
 * The job is best-effort: failures log but never crash the worker.
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/15 * * * *')
  async sendAppointmentReminders(): Promise<void> {
    for (const config of CONFIGS) {
      await this.runReminderWindow(config);
    }
  }

  private async runReminderWindow(config: ReminderConfig): Promise<void> {
    const now = Date.now();
    const from = new Date(now + config.windowStartMs);
    const until = new Date(now + config.windowEndMs);

    let cursor: string | undefined;
    let processed = 0;
    let considered = 0;

    while (true) {
      const appointments: AppointmentRow[] =
        await this.prisma.appointment.findMany({
          where: {
            status: 'CONFIRMED',
            scheduledAt: { gte: from, lte: until },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 100,
          include: {
            doctor: {
              select: {
                id: true,
                name: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        });

      if (appointments.length === 0) break;
      cursor = appointments[appointments.length - 1]?.id;

      for (const appt of appointments) {
        considered++;
        const notification = await this.notifications.enqueueIfAbsent({
          userId: appt.userId,
          title: config.title,
          body: config.bodyTemplate(appt),
          idempotencyKey: `appointment-reminder:${config.kind}:${appt.id}`,
          metadata: {
            kind: config.kind,
            appointmentId: appt.id,
          },
        });

        if (notification) processed++;
      }
    }

    if (processed > 0) {
      this.logger.log(
        `[${config.kind}] sent ${processed} reminder(s) (considered ${considered})`,
      );
    }
  }
}
