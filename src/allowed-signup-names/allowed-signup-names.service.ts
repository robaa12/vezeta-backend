import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAllowedSignupNameDto } from './dto/create-allowed-signup-name.dto.js';
import { ListAllowedSignupNamesDto } from './dto/list-allowed-signup-names.dto.js';
import { UpdateAllowedSignupNameDto } from './dto/update-allowed-signup-name.dto.js';
import type { AllowedSignupNameResponseDto } from './dto/allowed-signup-name-response.dto.js';
import {
  REQUIRED_NAME_WORDS,
  hasRequiredWordCount,
  normalizeSignupName,
} from './name-normalization.js';

export interface ListAllowedSignupNamesResult {
  allowedSignupNames: AllowedSignupNameResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AllowedSignupNamesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAllowedSignupNames(
    query: ListAllowedSignupNamesDto,
  ): Promise<ListAllowedSignupNamesResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [records, total] = await Promise.all([
      this.prisma.allowedSignupName.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.allowedSignupName.count({ where }),
    ]);

    return {
      allowedSignupNames: records.map((r) => this.toResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  async getAllowedSignupName(
    id: string,
  ): Promise<AllowedSignupNameResponseDto> {
    const record = await this.prisma.allowedSignupName.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Allowed name not found');
    }
    return this.toResponse(record);
  }

  async createAllowedSignupName(
    dto: CreateAllowedSignupNameDto,
  ): Promise<AllowedSignupNameResponseDto> {
    this.assertWordCount(dto.name);
    const normalizedName = normalizeSignupName(dto.name);
    const status = dto.status ?? 'ACTIVE';

    if (status === 'ACTIVE') {
      await this.assertNoActiveDuplicate(normalizedName);
    }

    const created = await this.prisma.allowedSignupName.create({
      data: { name: dto.name, normalizedName, status },
    });
    return this.toResponse(created);
  }

  async updateAllowedSignupName(
    id: string,
    dto: UpdateAllowedSignupNameDto,
  ): Promise<AllowedSignupNameResponseDto> {
    const existing = await this.prisma.allowedSignupName.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Allowed name not found');
    }
    if (dto.name === undefined && dto.status === undefined) {
      throw new BadRequestException('No fields to update');
    }

    const nextName = dto.name ?? existing.name;
    const nextNormalizedName =
      dto.name === undefined
        ? existing.normalizedName
        : normalizeSignupName(dto.name);
    const nextStatus = dto.status ?? existing.status;

    if (dto.name !== undefined) {
      this.assertWordCount(dto.name);
    }

    // Only one live entry per name, so re-check whenever the row would end up
    // ACTIVE under a name it did not already hold as ACTIVE.
    const becomesActive = nextStatus === 'ACTIVE';
    const nameOrStatusMoved =
      nextNormalizedName !== existing.normalizedName ||
      existing.status !== 'ACTIVE';
    if (becomesActive && nameOrStatusMoved) {
      await this.assertNoActiveDuplicate(nextNormalizedName, id);
    }

    // Releasing an entry back to ACTIVE clears the consumption record, so the
    // admin does not see a stale "used by" against a name that is open again.
    const releasing = becomesActive && existing.status !== 'ACTIVE';

    const updated = await this.prisma.allowedSignupName.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name: nextName, normalizedName: nextNormalizedName }
          : {}),
        ...(dto.status !== undefined ? { status: nextStatus } : {}),
        ...(releasing ? { usedByEmail: null, usedAt: null } : {}),
      },
    });
    return this.toResponse(updated);
  }

  async deactivateAllowedSignupName(
    id: string,
  ): Promise<AllowedSignupNameResponseDto> {
    const existing = await this.prisma.allowedSignupName.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Allowed name not found');
    }
    if (existing.status === 'DEACTIVATED') {
      return this.toResponse(existing);
    }
    const updated = await this.prisma.allowedSignupName.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
    });
    return this.toResponse(updated);
  }

  async deleteAllowedSignupName(id: string): Promise<void> {
    const existing = await this.prisma.allowedSignupName.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Allowed name not found');
    }
    // Nothing references this table, so a hard delete is always safe. Deleting
    // a USED row only discards the audit trail of who consumed it.
    await this.prisma.allowedSignupName.delete({ where: { id } });
  }

  private assertWordCount(name: string): void {
    if (!hasRequiredWordCount(name)) {
      throw new BadRequestException({
        message: `Name must be exactly ${REQUIRED_NAME_WORDS} words`,
        error: 'name_word_count',
      });
    }
  }

  private async assertNoActiveDuplicate(
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const collision = await this.prisma.allowedSignupName.findFirst({
      where: {
        normalizedName,
        status: 'ACTIVE',
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (collision) {
      throw new ConflictException({
        message: 'This name is already on the allowlist',
        error: 'duplicate_name',
      });
    }
  }

  private toResponse(record: {
    id: string;
    name: string;
    status: string;
    usedByEmail: string | null;
    usedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AllowedSignupNameResponseDto {
    return {
      id: record.id,
      name: record.name,
      status: record.status as AllowedSignupNameResponseDto['status'],
      usedByEmail: record.usedByEmail,
      usedAt: record.usedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
