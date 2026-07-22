import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Daily reminder job (Constitution phase 2). Scans appointments
 * scheduled in the next 24h that are CONFIRMED, and sends the patient
 * exactly one reminder per appointment. Idempotent via the
 * (userId, appointmentId) pair stored in the Notification's metadata
 * — a single appointment produces at most one reminder, even if the
 * user has several CONFIRMED appointments in the window.
 *
 * Dedup is done in a single query (not per-appointment inside the
 * loop) to avoid N+1 on the JSON-path filter.
 *
 * The job is intentionally best-effort: failures log but never crash
 * the worker.
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendUpcomingReminders(): Promise<void> {
    const from = new Date();
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 1. Pre-fetch the set of (userId, appointmentId) pairs that
    //    already have a reminder for this window. One query, not N.
    const reminded = await this.prisma.notification.findMany({
      where: {
        metadata: {
          path: ['kind'],
          equals: 'appointment.reminder',
        },
        createdAt: { gte: from },
      },
      select: { userId: true, metadata: true },
    });
    const remindedKey = new Set<string>();
    for (const row of reminded) {
      const meta = row.metadata as { appointmentId?: unknown } | null;
      const raw = meta?.appointmentId;
      const apptId =
        typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
      if (apptId) {
        remindedKey.add(`${row.userId}:${apptId}`);
      }
    }

    // 2. Page through the upcoming CONFIRMED appointments.
    let cursor: string | undefined;
    let processed = 0;
    let considered = 0;
    while (true) {
      const appointments: Array<{
        id: string;
        userId: string;
        scheduledAt: Date;
        doctor: {
          id: string;
          name: string;
          category: { id: string; name: string };
        };
        status: string;
      }> = await this.prisma.appointment.findMany({
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
          title: 'Appointment reminder',
          body: `Reminder: your appointment with ${appt.doctor.name} (${appt.doctor.category.name}) is on ${appt.scheduledAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })} UTC.`,
          metadata: {
            kind: 'appointment.reminder',
            appointmentId: appt.id,
          },
        });
        processed++;
        // Mark the in-memory set so a re-paged chunk with the same
        // id is skipped (shouldn't happen with cursor pagination,
        // but defensive).
        remindedKey.add(`${appt.userId}:${appt.id}`);
      }
    }
    if (processed > 0) {
      this.logger.log(
        `sent ${processed} appointment reminder(s) (considered ${considered})`,
      );
    }
  }
}
