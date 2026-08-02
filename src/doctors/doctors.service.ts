import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListPublicDoctorsDto } from './dto/list-doctors.dto.js';
import { buildGoogleMapsUrl } from './doctor-location.js';

export interface PublicCategoryRef {
  id: string;
  name: string;
}

export interface PublicDoctorServiceRef {
  id: string;
  name: string;
  price: number | null;
  pricingMode: 'FIXED' | 'ON_REQUEST';
  discountPercent: number | null;
  finalPrice: number | null;
}

export interface PublicDoctorLocation {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
}

export interface PublicDoctorRecord {
  id: string;
  name: string;
  category: PublicCategoryRef;
  bio: string | null;
  imageUrl: string | null;
  location: PublicDoctorLocation;
  status: 'ACTIVE' | 'DEACTIVATED';
  services: PublicDoctorServiceRef[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List-view DTO for the public doctor catalog. Omits `bio` (up to
 * 2 KB per doctor — 40 KB per page at the default page size of 20).
 * Includes `imageUrl` so the frontend can render doctor photos on
 * list cards without N+1 detail fetches. The full location object
 * (address + lat/lng + googleMapsUrl) is included so list cards can
 * render a "View on map" link without an additional detail request.
 */
export interface PublicDoctorListItem {
  id: string;
  name: string;
  category: PublicCategoryRef;
  imageUrl: string | null;
  location: PublicDoctorLocation;
  averageRating: number | null;
  reviewCount: number;
  status: 'ACTIVE' | 'DEACTIVATED';
}

export interface ListPublicDoctorsResult {
  doctors: PublicDoctorListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DoctorRatingAggregate {
  averageRating: number | null;
  reviewCount: number;
}

interface DoctorRatingRow {
  doctorId: string;
  _avg: { rating: number | null };
  _count: { _all: number };
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
        { address: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const recordsPromise = this.prisma.doctor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        address: true,
        latitude: true,
        longitude: true,
        status: true,
        category: { select: { id: true, name: true } },
      },
    });
    const totalPromise = this.prisma.doctor.count({ where });
    const records = await recordsPromise;

    // Fetch one aggregate row per listed doctor. This keeps ratings on the
    // catalog response without loading every review or creating N+1 queries.
    const ratingsPromise =
      records.length === 0
        ? Promise.resolve([])
        : this.prisma.review.groupBy({
            by: ['doctorId'],
            where: { doctorId: { in: records.map((record) => record.id) } },
            _avg: { rating: true },
            _count: { _all: true },
          });
    const [total, ratingRows] = await Promise.all([
      totalPromise,
      ratingsPromise,
    ]);
    const typedRatingRows = ratingRows as DoctorRatingRow[];
    const ratingsByDoctor = new Map<string, DoctorRatingAggregate>(
      typedRatingRows.map((row): [string, DoctorRatingAggregate] => [
        row.doctorId,
        {
          averageRating: row._avg.rating,
          reviewCount: row._count._all,
        },
      ]),
    );

    return {
      doctors: records.map((record) =>
        this.toListItem(record, ratingsByDoctor.get(record.id)),
      ),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Fetch one ACTIVE doctor by id. Returns null for non-existent,
   * DEACTIVATED, or doctors whose category is DEACTIVATED — the
   * controller throws 404 to keep the cases indistinguishable from
   * the client's perspective (FR-006, US6). The response includes
   * the doctor's ACTIVE services (per feature 007); DEACTIVATED
   * services are hidden from the public surface.
   */
  async getPublicDoctor(id: string): Promise<PublicDoctorRecord | null> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, status: 'ACTIVE', category: { status: 'ACTIVE' } },
      include: {
        category: { select: { id: true, name: true } },
        services: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return doctor ? this.toPublicRecord(doctor) : null;
  }

  private toListItem(
    d: {
      id: string;
      name: string;
      imageUrl: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      status: string;
      category: { id: string; name: string };
    },
    rating?: DoctorRatingAggregate,
  ): PublicDoctorListItem {
    return {
      id: d.id,
      name: d.name,
      imageUrl: d.imageUrl,
      averageRating: rating?.averageRating ?? null,
      reviewCount: rating?.reviewCount ?? 0,
      status: d.status as PublicDoctorListItem['status'],
      category: {
        id: d.category.id,
        name: d.category.name,
      },
      location: this.toLocation(d),
    };
  }

  private toPublicRecord(d: {
    id: string;
    name: string;
    bio: string | null;
    imageUrl: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
    services?: Array<{
      id: string;
      name: string;
      price: { toNumber(): number } | number | null;
      pricingMode: string;
      discountPercent: number | null;
    }>;
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
      location: this.toLocation(d),
      status: d.status as PublicDoctorRecord['status'],
      services: (d.services ?? []).map((s) => this.toPublicService(s)),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private toLocation(d: {
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  }): PublicDoctorLocation {
    return {
      address: d.address ?? null,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      googleMapsUrl: buildGoogleMapsUrl({
        address: d.address,
        latitude: d.latitude,
        longitude: d.longitude,
      }),
    };
  }

  private toPublicService(s: {
    id: string;
    name: string;
    price: { toNumber(): number } | number | null;
    pricingMode: string;
    discountPercent: number | null;
  }): PublicDoctorServiceRef {
    const price =
      s.price === null || s.price === undefined
        ? null
        : typeof s.price === 'number'
          ? s.price
          : s.price.toNumber();
    return {
      id: s.id,
      name: s.name,
      price,
      pricingMode: s.pricingMode as PublicDoctorServiceRef['pricingMode'],
      discountPercent: s.discountPercent,
      finalPrice: this.computeFinalPrice(price, s.discountPercent),
    };
  }

  private computeFinalPrice(
    price: number | null,
    discountPercent: number | null,
  ): number | null {
    if (price === null) return null;
    if (discountPercent === null || discountPercent === 0) return price;
    const discounted = price * (1 - discountPercent / 100);
    return Math.round(discounted * 100) / 100;
  }
}
