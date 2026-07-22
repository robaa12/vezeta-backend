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
   * Lookback window in ms — how far back to check for previously sent
   * reminders of this kind. Prevents re-sending even if the metadata
   * index hasn't caught up yet.
   */
  lookbackMs: number;
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
    lookbackMs: 26 * HOUR,
    windowStartMs: 23 * HOUR,
    windowEndMs: 25 * HOUR + MINUTE,
  },
  {
    kind: 'appointment.reminder.1h',
    title: 'Appointment in 1 hour',
    bodyTemplate: (appt: AppointmentRow) =>
      `Your appointment with ${appt.doctor.name} (${appt.doctor.category.name}) starts in about 1 hour at ${fmtDate(appt.scheduledAt)} UTC.`,
    lookbackMs: 2 * HOUR,
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
 * Each kind is independently deduplicated via
 * `Notification.metadata.kind`, so the same appointment can receive
 * both a 24h and a 1h reminder but never the same kind twice.
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

    const reminded = await this.prisma.notification.findMany({
      where: {
        metadata: {
          path: ['kind'],
          equals: config.kind,
        },
        createdAt: {
          gte: new Date(now - config.lookbackMs),
        },
      },
      select: { userId: true, metadata: true },
    });

    const remindedKey = new Set<string>();
    for (const row of reminded) {
      const meta = row.metadata as { appointmentId?: unknown } | null;
      const apptId =
        typeof meta?.appointmentId === 'string' ||
        typeof meta?.appointmentId === 'number'
          ? String(meta.appointmentId)
          : null;
      if (apptId) {
        remindedKey.add(`${row.userId}:${apptId}`);
      }
    }

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
        if (remindedKey.has(`${appt.userId}:${appt.id}`)) continue;

        await this.notifications.enqueue({
          userId: appt.userId,
          title: config.title,
          body: config.bodyTemplate(appt),
          metadata: {
            kind: config.kind,
            appointmentId: appt.id,
          },
        });

        processed++;
        remindedKey.add(`${appt.userId}:${appt.id}`);
      }
    }

    if (processed > 0) {
      this.logger.log(
        `[${config.kind}] sent ${processed} reminder(s) (considered ${considered})`,
      );
    }
  }
}
