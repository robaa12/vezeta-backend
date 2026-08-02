import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { RemindersCron } from './notifications.cron.js';

describe('RemindersCron', () => {
  it('uses an appointment-and-kind idempotency key before dispatch', async () => {
    const appointment = {
      id: 'a1',
      userId: 'u1',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'CONFIRMED',
      doctor: {
        id: 'd1',
        name: 'Dr. Doe',
        category: { id: 'c1', name: 'Cardiology' },
      },
    };
    const prisma = {
      appointment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([appointment])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
    };
    const notifications = {
      enqueueIfAbsent: jest.fn().mockResolvedValue(null),
    };
    const cron = new RemindersCron(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );

    await cron.sendAppointmentReminders();

    expect(notifications.enqueueIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        idempotencyKey: 'appointment-reminder:appointment.reminder.24h:a1',
        metadata: {
          kind: 'appointment.reminder.24h',
          appointmentId: 'a1',
        },
      }),
    );
  });
});
