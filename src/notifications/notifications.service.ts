import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../common/email/email.service.js';
import type {
  EnqueueInput,
  ListNotificationsResult,
  NotificationRecord,
} from './dto/notification-response.dto.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';

type Channel = 'EMAIL' | 'IN_APP';
type Status = 'QUEUED' | 'SENT' | 'FAILED';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Persist a notification row and dispatch it through its channel.
   * Channel dispatch is best-effort: a transient provider failure
   * marks the row FAILED but never throws to the caller — the
   * inbound event listener stays silent on failure.
   */
  async enqueue(input: EnqueueInput): Promise<NotificationRecord> {
    const channel: Channel = input.channel ?? 'EMAIL';
    const shouldDispatch = input.dispatch !== false && channel === 'EMAIL';
    let status: Status = 'QUEUED';
    let sentAt: Date | null = null;

    const created = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        channel,
        status: 'QUEUED',
        title: input.title,
        body: input.body,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    if (!shouldDispatch) {
      return this.toRecord(created);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user?.email) {
      this.logger.warn(
        `notification ${created.id} has no email recipient for user ${input.userId}; marking FAILED`,
      );
      const updated = await this.prisma.notification.update({
        where: { id: created.id },
        data: { status: 'FAILED' },
      });
      return this.toRecord(updated);
    }

    const ok = await this.email.sendNotification({
      to: user.email,
      subject: input.title,
      body: input.body,
      tag: `notification:${created.id}`,
    });
    status = ok ? 'SENT' : 'FAILED';
    sentAt = ok ? new Date() : null;
    const updated = await this.prisma.notification.update({
      where: { id: created.id },
      data: { status, sentAt },
    });
    return this.toRecord(updated);
  }

  async listMine(
    userId: string,
    query: ListNotificationsDto,
  ): Promise<ListNotificationsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { userId };
    if (query.unreadOnly) where.readAt = null;
    const [records, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return {
      notifications: records.map((r) => this.toRecord(r)),
      total,
      page,
      pageSize,
      unreadCount,
    };
  }

  async markRead(
    userId: string,
    id: string,
    read: boolean,
  ): Promise<NotificationRecord> {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing || existing.userId !== userId) {
      // § info-disclosure: don't reveal whether the row exists for
      // another user. 404 either way.
      throw this.notFound();
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: read ? new Date() : null },
    });
    return this.toRecord(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private notFound(): Error {
    return new NotFoundException('Notification not found');
  }

  private toRecord(r: {
    id: string;
    channel: string;
    status: string;
    title: string;
    body: string;
    metadata: unknown;
    sentAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationRecord {
    return {
      id: r.id,
      channel: r.channel as Channel,
      status: r.status as Status,
      title: r.title,
      body: r.body,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      sentAt: r.sentAt,
      readAt: r.readAt,
      createdAt: r.createdAt,
    };
  }
}
