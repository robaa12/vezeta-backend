import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../common/email/email.service.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: Record<string, unknown>;
  let email: { sendNotification: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    email = { sendNotification: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  const createdRow = {
    id: 'n1',
    channel: 'EMAIL',
    status: 'QUEUED',
    title: 'Hello',
    body: 'World',
    metadata: null,
    sentAt: null,
    readAt: null,
    createdAt: new Date(),
  };

  describe('enqueue', () => {
    it('persists a QUEUED row and skips dispatch when dispatch=false', async () => {
      (prisma['notification'].create as jest.Mock).mockResolvedValueOnce(
        createdRow,
      );
      const result = await service.enqueue({
        userId: 'u1',
        title: 'Hello',
        body: 'World',
        dispatch: false,
      });
      expect(result.status).toBe('QUEUED');
      expect(email.sendNotification).not.toHaveBeenCalled();
    });

    it('marks FAILED when the user has no email on file', async () => {
      (prisma['notification'].create as jest.Mock).mockResolvedValueOnce(
        createdRow,
      );
      (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
        email: null,
      });
      (prisma['notification'].update as jest.Mock).mockResolvedValueOnce({
        ...createdRow,
        status: 'FAILED',
      });
      const result = await service.enqueue({
        userId: 'u1',
        title: 'Hello',
        body: 'World',
      });
      expect(result.status).toBe('FAILED');
      expect(email.sendNotification).not.toHaveBeenCalled();
    });

    it('marks SENT on a successful email dispatch', async () => {
      (prisma['notification'].create as jest.Mock).mockResolvedValueOnce(
        createdRow,
      );
      (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
        email: 'you@example.com',
      });
      email.sendNotification.mockResolvedValueOnce(true);
      (prisma['notification'].update as jest.Mock).mockResolvedValueOnce({
        ...createdRow,
        status: 'SENT',
        sentAt: new Date(),
      });
      const result = await service.enqueue({
        userId: 'u1',
        title: 'Hello',
        body: 'World',
      });
      expect(result.status).toBe('SENT');
      expect(email.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'you@example.com', subject: 'Hello' }),
      );
    });

    it('marks FAILED on a rejected email dispatch', async () => {
      (prisma['notification'].create as jest.Mock).mockResolvedValueOnce(
        createdRow,
      );
      (prisma['user'].findUnique as jest.Mock).mockResolvedValueOnce({
        email: 'you@example.com',
      });
      email.sendNotification.mockResolvedValueOnce(false);
      (prisma['notification'].update as jest.Mock).mockResolvedValueOnce({
        ...createdRow,
        status: 'FAILED',
      });
      const result = await service.enqueue({
        userId: 'u1',
        title: 'Hello',
        body: 'World',
      });
      expect(result.status).toBe('FAILED');
    });

    it('skips dispatch entirely for IN_APP channel', async () => {
      (prisma['notification'].create as jest.Mock).mockResolvedValueOnce({
        ...createdRow,
        channel: 'IN_APP',
      });
      const result = await service.enqueue({
        userId: 'u1',
        channel: 'IN_APP',
        title: 'In-app',
        body: 'Hi',
      });
      expect(result.channel).toBe('IN_APP');
      expect(email.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('applies unreadOnly filter', async () => {
      (prisma['notification'].findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma['notification'].count as jest.Mock).mockResolvedValueOnce(0);
      await service.listMine('u1', { unreadOnly: true });
      const where = (prisma['notification'].findMany as jest.Mock).mock
        .calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where).toMatchObject({ userId: 'u1', readAt: null });
    });

    it('returns total + unreadCount alongside the page', async () => {
      (prisma['notification'].findMany as jest.Mock).mockResolvedValueOnce([
        createdRow,
      ]);
      (prisma['notification'].count as jest.Mock)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      const result = await service.listMine('u1', {});
      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(2);
    });
  });

  describe('markRead', () => {
    it('throws 404 when the notification belongs to another user', async () => {
      (prisma['notification'].findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'u2',
      });
      await expect(service.markRead('u1', 'n1', true)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma['notification'].update).not.toHaveBeenCalled();
    });

    it('throws 404 when the notification does not exist', async () => {
      (prisma['notification'].findUnique as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(service.markRead('u1', 'n1', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates readAt to now when mark read', async () => {
      (prisma['notification'].findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'u1',
      });
      (prisma['notification'].update as jest.Mock).mockResolvedValueOnce({
        ...createdRow,
        readAt: new Date(),
      });
      const result = await service.markRead('u1', 'n1', true);
      expect(result.readAt).not.toBeNull();
    });

    it('clears readAt when mark unread', async () => {
      (prisma['notification'].findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'u1',
      });
      (prisma['notification'].update as jest.Mock).mockResolvedValueOnce(
        createdRow,
      );
      await service.markRead('u1', 'n1', false);
      const updateArgs = (prisma['notification'].update as jest.Mock).mock
        .calls[0]?.[0];
      expect(updateArgs).toMatchObject({
        where: { id: 'n1' },
        data: { readAt: null },
      });
    });
  });

  describe('markAllRead', () => {
    it('updates all unread rows for the caller', async () => {
      (prisma['notification'].updateMany as jest.Mock).mockResolvedValueOnce({
        count: 3,
      });
      const result = await service.markAllRead('u1');
      expect(result.updated).toBe(3);
      const args = (prisma['notification'].updateMany as jest.Mock).mock
        .calls[0]?.[0];
      expect(args).toMatchObject({
        where: { userId: 'u1', readAt: null },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      });
    });
  });
});
