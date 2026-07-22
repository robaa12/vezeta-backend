import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListPublicDoctorsDto } from './dto/list-doctors.dto.js';

export interface PublicCategoryRef {
  id: string;
  name: string;
}

export interface PublicDoctorRecord {
  id: string;
  name: string;
  category: PublicCategoryRef;
  bio: string | null;
  imageUrl: string | null;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List-view DTO for the public doctor catalog. Omits `bio` (up to
 * 2 KB per doctor — 40 KB per page at the default page size of 20) and
 * `imageUrl` (detail-only). The detail DTO is `PublicDoctorRecord`;
 * fetch the full record via `GET /api/doctors/:id`.
 */
export interface PublicDoctorListItem {
  id: string;
  name: string;
  category: PublicCategoryRef;
  status: 'ACTIVE' | 'DEACTIVATED';
}

export interface ListPublicDoctorsResult {
  doctors: PublicDoctorListItem[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List ACTIVE doctors with optional filters.
   *
   * No in-process caching: every request reads the DB. The 5-second
   * freshness target (US6) is achieved by the absence of caching —
   * Cache-Control headers (set by the controller) are advisory hints
   * to intermediaries, not a guarantee.
   */
  async listPublicDoctors(
    query: ListPublicDoctorsDto,
  ): Promise<ListPublicDoctorsResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {
      status: 'ACTIVE',
      category: { status: 'ACTIVE' },
    };
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { category: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          status: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return {
      doctors: records.map((r) => this.toListItem(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Fetch one ACTIVE doctor by id. Returns null for non-existent,
   * DEACTIVATED, or doctors whose category is DEACTIVATED — the
   * controller throws 404 to keep the cases indistinguishable from
   * the client's perspective (FR-006, US6).
   */
  async getPublicDoctor(id: string): Promise<PublicDoctorRecord | null> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, status: 'ACTIVE', category: { status: 'ACTIVE' } },
      include: { category: { select: { id: true, name: true } } },
    });
    return doctor ? this.toPublicRecord(doctor) : null;
  }

  private toListItem(d: {
    id: string;
    name: string;
    status: string;
    category: { id: string; name: string };
  }): PublicDoctorListItem {
    return {
      id: d.id,
      name: d.name,
      status: d.status as PublicDoctorListItem['status'],
      category: {
        id: d.category.id,
        name: d.category.name,
      },
    };
  }

  private toPublicRecord(d: {
    id: string;
    name: string;
    bio: string | null;
    imageUrl: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
  }): PublicDoctorRecord {
    return {
      id: d.id,
      name: d.name,
      category: {
        id: d.category?.id ?? '',
        name: d.category?.name ?? '',
      },
      bio: d.bio,
      imageUrl: d.imageUrl,
      status: d.status as PublicDoctorRecord['status'],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
