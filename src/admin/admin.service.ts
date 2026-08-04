import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserRole } from '../common/interfaces/session.interface.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { ListDoctorsDto } from './dto/list-doctors.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { saveDoctorImage } from '../upload/multer.config.js';
import { buildGoogleMapsUrl } from '../doctors/doctor-location.js';

export interface DoctorCategoryRef {
  id: string;
  name: string;
}

export interface DoctorServiceRef {
  id: string;
  name: string;
  price: number | null;
  pricingMode: 'FIXED' | 'ON_REQUEST';
  discountPercent: number | null;
  finalPrice: number | null;
  status: 'ACTIVE' | 'DEACTIVATED';
}

export interface DoctorLocation {
  city: string | null;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
}

export interface DoctorRecord {
  id: string;
  name: string;
  category: DoctorCategoryRef;
  bio: string | null;
  imageUrl: string | null;
  location: DoctorLocation;
  status: 'ACTIVE' | 'DEACTIVATED';
  services: DoctorServiceRef[];
  serviceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type DoctorWithCategory = Prisma.DoctorGetPayload<{
  include: { category: { select: { id: true; name: true } } };
}>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------- Doctor CRUD ----------------

  async createDoctor(
    dto: CreateDoctorDto,
    image: Express.Multer.File | undefined,
    actorId: string,
  ): Promise<DoctorRecord> {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, status: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot assign a doctor to a deactivated category',
      );
    }
    this.assertCoordinatesConsistent(dto.latitude, dto.longitude);

    const imageUrl = image ? await saveDoctorImage(image) : null;
    let created: DoctorWithCategory;
    try {
      created = await this.prisma.doctor.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          bio: dto.bio ?? null,
          imageUrl,
          city: this.normalizeAddress(dto.city) ?? null,
          area: this.normalizeAddress(dto.area) ?? null,
          address: this.normalizeAddress(dto.address) ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          status: 'ACTIVE',
        },
        include: { category: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if (imageUrl) await this.deleteOldImageFile(imageUrl);
      throw error;
    }

    void this.audit.record({
      actorId,
      action: 'doctor.create',
      entityType: 'doctor',
      entityId: created.id,
      details: { name: created.name, categoryId: dto.categoryId },
    });

    return this.toDoctorRecord(created);
  }

  async listDoctors(query: ListDoctorsDto): Promise<{
    doctors: DoctorRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
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
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { services: true } },
        },
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return {
      doctors: records.map((r) => this.toDoctorRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  async getDoctor(id: string): Promise<DoctorRecord> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        services: { orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    return this.toDoctorRecord(doctor);
  }

  async updateDoctor(
    id: string,
    dto: UpdateDoctorDto,
    image: Express.Multer.File | undefined,
    actorId: string,
  ): Promise<DoctorRecord> {
    const existing = await this.prisma.doctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Doctor not found');
    }
    if (
      dto.categoryId !== undefined &&
      dto.categoryId !== existing.categoryId
    ) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, status: true },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      if (category.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot assign a doctor to a deactivated category',
        );
      }
    }
    this.assertCoordinatesConsistentForUpdate(
      dto.latitude,
      dto.longitude,
      existing.latitude,
      existing.longitude,
    );
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.city !== undefined) data.city = this.normalizeAddress(dto.city) ?? null;
    if (dto.area !== undefined) data.area = this.normalizeAddress(dto.area) ?? null;
    if (dto.address !== undefined) {
      data.address = this.normalizeAddress(dto.address) ?? null;
    }
    if (dto.latitude !== undefined) {
      data.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      data.longitude = dto.longitude;
    }

    const newImageUrl = image ? await saveDoctorImage(image) : null;
    if (newImageUrl) data.imageUrl = newImageUrl;

    if (Object.keys(data).length === 0) {
      throw new ConflictException('No fields to update');
    }
    let updated: DoctorWithCategory;
    try {
      updated = await this.prisma.doctor.update({
        where: { id },
        data,
        include: { category: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if (newImageUrl) await this.deleteOldImageFile(newImageUrl);
      throw error;
    }

    if (image && existing.imageUrl) {
      void this.deleteOldImageFile(existing.imageUrl).catch(() => {});
    }

    void this.audit.record({
      actorId,
      action: 'doctor.update',
      entityType: 'doctor',
      entityId: id,
      details: { changedFields: Object.keys(data) },
    });

    return this.toDoctorRecord(updated);
  }

  async deactivateDoctor(id: string, actorId: string): Promise<DoctorRecord> {
    const existing = await this.prisma.doctor.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Doctor not found');
    }
    if (existing.status === 'DEACTIVATED') {
      throw new ConflictException({
        message: 'Doctor is already deactivated',
        error: 'already_deactivated',
      });
    }
    const updated = await this.prisma.doctor.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
      include: { category: { select: { id: true, name: true } } },
    });

    void this.audit.record({
      actorId,
      action: 'doctor.deactivate',
      entityType: 'doctor',
      entityId: id,
    });

    return this.toDoctorRecord(updated);
  }

  async activateDoctor(id: string, actorId: string): Promise<DoctorRecord> {
    const existing = await this.prisma.doctor.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Doctor not found');
    }
    if (existing.status === 'ACTIVE') {
      throw new ConflictException({
        message: 'Doctor is already active',
        error: 'already_active',
      });
    }

    const updated = await this.prisma.doctor.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { category: { select: { id: true, name: true } } },
    });

    void this.audit.record({
      actorId,
      action: 'doctor.activate',
      entityType: 'doctor',
      entityId: id,
    });

    return this.toDoctorRecord(updated);
  }

  async deleteDoctor(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.doctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Doctor not found');
    }
    // Reject hard-delete when the doctor has any historical bookings,
    // reviews, or medical records. Hard-deleting a doctor with
    // clinical history would cascade-delete those records (the FK is
    // ON DELETE CASCADE) — losing audit trail / patient history. The
    // admin should DEACTIVATE the doctor instead. See review module
    // spec (`specs/004-doctor-search`) and the medical-records
    // constitution principle.
    const [appointments, reviews, medicalRecords] = await Promise.all([
      this.prisma.appointment.count({ where: { doctorId: id } }),
      this.prisma.review.count({ where: { doctorId: id } }),
      this.prisma.medicalRecord.count({ where: { doctorId: id } }),
    ]);
    if (appointments > 0 || reviews > 0 || medicalRecords > 0) {
      throw new ConflictException({
        message:
          'Cannot hard-delete a doctor with historical bookings, reviews, or medical records; deactivate instead',
        error: 'doctor_has_history',
      });
    }
    if (existing.imageUrl) {
      void this.deleteOldImageFile(existing.imageUrl).catch(() => {});
    }
    await this.prisma.doctor.delete({ where: { id } });

    void this.audit.record({
      actorId,
      action: 'doctor.delete',
      entityType: 'doctor',
      entityId: id,
      details: { name: existing.name },
    });
  }

  // ---------------- User management ----------------

  async listUsers(query: ListUsersDto): Promise<{
    users: UserRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phoneNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: records.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phoneNumber: r.phoneNumber ?? null,
        role: r.role as UserRole,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getUser(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      role: user.role as UserRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async changeUserRole(
    userId: string,
    newRole: UserRole,
    adminId: string,
  ): Promise<UserRecord> {
    const { currentRole, updated } = await this.withActiveAdminLock(
      async (tx) => {
        const lockedUser = await tx.user.findUnique({
          where: { id: userId },
        });
        if (!lockedUser) throw new NotFoundException('User not found');
        const currentRole = lockedUser.role as UserRole;
        if (currentRole === newRole) {
          return { currentRole, updated: lockedUser };
        }
        if (
          lockedUser.role === 'admin' &&
          newRole === 'user' &&
          lockedUser.isActive
        ) {
          await this.assertAnotherActiveAdmin(tx, userId, 'demote');
        }
        const updated = await tx.user.update({
          where: { id: userId },
          data: { role: newRole },
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return { currentRole, updated };
      },
    );

    void this.audit.record({
      actorId: adminId,
      action: 'user.role.change',
      entityType: 'user',
      entityId: userId,
      details: { oldRole: currentRole, newRole },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phoneNumber: updated.phoneNumber ?? null,
      role: updated.role as UserRole,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deactivateUser(
    userId: string,
    actorId: string,
  ): Promise<{ id: string; isActive: boolean; name: string; email: string }> {
    // Atomic: acquire the same transaction-scoped lock as role changes,
    // check the invariant, update, and invalidate sessions together.
    const updated = await this.withActiveAdminLock(async (tx) => {
      const lockedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true },
      });
      if (!lockedUser) throw new NotFoundException('User not found');
      if (lockedUser.role === 'admin' && lockedUser.isActive) {
        await this.assertAnotherActiveAdmin(tx, userId, 'deactivate');
      }
      const u = await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
        select: { id: true, isActive: true, name: true, email: true },
      });
      await tx.session.deleteMany({ where: { userId } });
      return u;
    });

    void this.audit.record({
      actorId,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: userId,
    });

    return updated;
  }

  async activateUser(
    userId: string,
    actorId: string,
  ): Promise<{ id: string; isActive: boolean; name: string; email: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.isActive) {
      throw new ConflictException({
        message: 'User is already active',
        error: 'already_active',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: { id: true, isActive: true, name: true, email: true },
    });

    void this.audit.record({
      actorId,
      action: 'user.activate',
      entityType: 'user',
      entityId: userId,
    });

    return updated;
  }

  // ---------------- Dashboard stats ----------------

  /**
   * Aggregated counts for the admin dashboard (plan §11). Skips
   * payment revenue (Module 5 was deferred from this build). All
   * counters run concurrently in a Promise.all so the endpoint
   * returns in a bounded time.
   */
  async getStats(): Promise<AdminStats> {
    const [
      usersTotal,
      usersActive,
      usersByRole,
      doctorsTotal,
      doctorsByStatus,
      laboratoriesTotal,
      laboratoriesByStatus,
      categoriesTotal,
      categoriesByStatus,
      appointmentsByStatus,
      reviewsTotal,
      medicalRecordsTotal,
      notificationsByStatus,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.doctor.count(),
      this.prisma.doctor.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.laboratory.count(),
      this.prisma.laboratory.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.category.count(),
      this.prisma.category.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.review.count(),
      this.prisma.medicalRecord.count(),
      this.prisma.notification.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        byRole: this.toRecord(usersByRole, 'role'),
      },
      doctors: {
        total: doctorsTotal,
        byStatus: this.toRecord(doctorsByStatus, 'status'),
      },
      laboratories: {
        total: laboratoriesTotal,
        byStatus: this.toRecord(laboratoriesByStatus, 'status'),
      },
      categories: {
        total: categoriesTotal,
        byStatus: this.toRecord(categoriesByStatus, 'status'),
      },
      appointments: {
        byStatus: this.toRecord(appointmentsByStatus, 'status'),
      },
      reviews: { total: reviewsTotal },
      medicalRecords: { total: medicalRecordsTotal },
      notifications: {
        byStatus: this.toRecord(notificationsByStatus, 'status'),
      },
    };
  }

  private toRecord<T extends string>(
    rows: Array<Record<string, unknown>>,
    by: T,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
      const key = row[by] as string | undefined;
      const count = (row._count as { _all?: number } | undefined)?._all ?? 0;
      if (key !== undefined) out[key] = count;
    }
    return out;
  }

  private async withActiveAdminLock<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // PostgreSQL advisory locks serialize every operation that could
        // remove an active admin without blocking unrelated user updates.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vezeta-active-admin-invariant'))`;
        return operation(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertAnotherActiveAdmin(
    tx: Prisma.TransactionClient,
    userId: string,
    action: 'demote' | 'deactivate',
  ): Promise<void> {
    const remainingActiveAdmins = await tx.user.count({
      where: { role: 'admin', isActive: true, NOT: { id: userId } },
    });
    if (remainingActiveAdmins === 0) {
      throw new ConflictException({
        message: `Cannot ${action} the last active admin`,
        error: 'last_admin',
      });
    }
  }

  // ---------------- Helpers ----------------

  private async deleteOldImageFile(imageUrl: string): Promise<void> {
    const filename = imageUrl.split('/').pop();
    if (!filename) return;
    const filePath = join(process.cwd(), 'uploads', 'doctors', filename);
    try {
      await unlink(filePath);
    } catch {
      // Ignore: file may already be gone
    }
  }

  private toDoctorRecord(d: {
    id: string;
    name: string;
    bio: string | null;
    imageUrl: string | null;
    city?: string | null;
    area?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
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
      status: string;
    }>;
    _count?: { services: number };
  }): DoctorRecord {
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
      status: d.status as DoctorRecord['status'],
      services: (d.services ?? []).map((s) => {
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
          pricingMode: s.pricingMode as DoctorServiceRef['pricingMode'],
          discountPercent: s.discountPercent,
          finalPrice: this.computeFinalPrice(price, s.discountPercent),
          status: s.status as DoctorServiceRef['status'],
        };
      }),
      serviceCount: d._count?.services ?? d.services?.length ?? 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private toLocation(d: {
    city?: string | null;
    area?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): DoctorLocation {
    const address = d.address ?? null;
    const latitude = d.latitude ?? null;
    const longitude = d.longitude ?? null;
    return {
      city: d.city ?? null,
      area: d.area ?? null,
      address,
      latitude,
      longitude,
      googleMapsUrl: buildGoogleMapsUrl({ address, latitude, longitude }),
    };
  }

  /**
   * Trim a free-text address; treat an empty/whitespace-only string as
   * "no address" (returns null) so the stored value is always either a
   * non-blank string or NULL.
   */
  private normalizeAddress(value: string | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * On create, both latitude and longitude must be provided together
   * (or both omitted). Supplying exactly one is rejected with a
   * 400 so the API can't persist a half-defined location.
   */
  private assertCoordinatesConsistent(
    latitude: number | undefined,
    longitude: number | undefined,
  ): void {
    const latDefined = latitude !== undefined;
    const lngDefined = longitude !== undefined;
    if (latDefined !== lngDefined) {
      throw new BadRequestException(
        'latitude and longitude must be provided together',
      );
    }
  }

  /**
   * On PATCH, the cross-field rule still applies: the resulting pair
   * `(lat, lng)` after the merge must be all-defined or all-null.
   * `null` is treated as "clear the value"; `undefined` means "no
   * change" and inherits the existing value.
   */
  private assertCoordinatesConsistentForUpdate(
    incomingLat: number | null | undefined,
    incomingLng: number | null | undefined,
    existingLat: number | null,
    existingLng: number | null,
  ): void {
    const nextLat = incomingLat === undefined ? existingLat : incomingLat;
    const nextLng = incomingLng === undefined ? existingLng : incomingLng;
    if ((nextLat === null) !== (nextLng === null)) {
      throw new BadRequestException(
        'latitude and longitude must be provided together (set both or clear both)',
      );
    }
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

export interface AdminStats {
  users: { total: number; active: number; byRole: Record<string, number> };
  doctors: { total: number; byStatus: Record<string, number> };
  laboratories: { total: number; byStatus: Record<string, number> };
  categories: { total: number; byStatus: Record<string, number> };
  appointments: { byStatus: Record<string, number> };
  reviews: { total: number };
  medicalRecords: { total: number };
  notifications: { byStatus: Record<string, number> };
}
