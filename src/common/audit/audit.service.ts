import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an admin action. Best-effort — failures log but never throw,
   * so the main operation succeeds even if audit storage is temporarily
   * unavailable.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          details: (entry.details ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log [${entry.action}] for ${entry.entityType}:${entry.entityId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }

  async list(params: {
    actorId?: string;
    entityType?: string;
    entityId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ logs: AuditEntry[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const where: Record<string, unknown> = {};
    if (params.actorId) where.actorId = params.actorId;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: rows.map((r) => ({
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        details: (r.details as Record<string, unknown>) ?? undefined,
        actor: r.actor,
        createdAt: r.createdAt,
      })),
      total,
    };
  }
}
