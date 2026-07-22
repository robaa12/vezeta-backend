import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserRole } from '../common/interfaces/session.interface.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { ListDoctorsDto } from './dto/list-doctors.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';

export interface DoctorCategoryRef {
  id: string;
  name: string;
}

export interface DoctorRecord {
  id: string;
  name: string;
  category: DoctorCategoryRef;
  bio: string | null;
  imageUrl: string | null;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Doctor CRUD ----------------

  async createDoctor(dto: CreateDoctorDto): Promise<DoctorRecord> {
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

    const created = await this.prisma.doctor.create({
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        bio: dto.bio ?? null,
        imageUrl: dto.imageUrl ?? null,
        status: 'ACTIVE',
      },
      include: { category: { select: { id: true, name: true } } },
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
        include: { category: { select: { id: true, name: true } } },
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
      include: { category: { select: { id: true, name: true } } },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    return this.toDoctorRecord(doctor);
  }

  async updateDoctor(id: string, dto: UpdateDoctorDto): Promise<DoctorRecord> {
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
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.status !== undefined) data.status = dto.status;
    if (Object.keys(data).length === 0) {
      throw new ConflictException('No fields to update');
    }
    const updated = await this.prisma.doctor.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
    return this.toDoctorRecord(updated);
  }

  async deactivateDoctor(id: string): Promise<DoctorRecord> {
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
    return this.toDoctorRecord(updated);
  }

  async deleteDoctor(id: string): Promise<void> {
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
    await this.prisma.doctor.delete({ where: { id } });
  }

  // ---------------- User management ----------------

  async getUser(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
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
      role: user.role as UserRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async changeUserRole(
    userId: string,
    newRole: UserRole,
    // The acting admin is accepted here for future audit logging; the
    // current implementation does not need it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _adminId: string,
  ): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const currentRole = user.role as UserRole;

    if (currentRole === newRole) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }

    // Last-admin guard: only applies when demoting an active admin.
    if (currentRole === 'admin' && newRole === 'user' && user.isActive) {
      const remainingActiveAdmins = await this.prisma.user.count({
        where: {
          role: 'admin',
          isActive: true,
          NOT: { id: userId },
        },
      });
      if (remainingActiveAdmins === 0) {
        throw new ConflictException({
          message: 'Cannot demote the last active admin',
          error: 'last_admin',
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role as UserRole,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deactivateUser(
    userId: string,
  ): Promise<{ id: string; isActive: boolean; name: string; email: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    // Last-admin guard: only applies when deactivating an active admin.
    // Mirrors the same guard in changeUserRole so the system can never
    // reach a state with zero active admins.
    if (existing.role === 'admin' && existing.isActive) {
      const remainingActiveAdmins = await this.prisma.user.count({
        where: {
          role: 'admin',
          isActive: true,
          NOT: { id: userId },
        },
      });
      if (remainingActiveAdmins === 0) {
        throw new ConflictException({
          message: 'Cannot deactivate the last active admin',
          error: 'last_admin',
        });
      }
    }
    // Atomic: update + invalidate all sessions in one transaction so a
    // race with a concurrent role change / re-activation cannot leave
    // the user flagged inactive but with live sessions.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
        select: { id: true, isActive: true, name: true, email: true },
      });
      await tx.session.deleteMany({ where: { userId } });
      return u;
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

  // ---------------- Helpers ----------------

  private toDoctorRecord(d: {
    id: string;
    name: string;
    bio: string | null;
    imageUrl: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
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
      status: d.status as DoctorRecord['status'],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}

export interface AdminStats {
  users: { total: number; active: number; byRole: Record<string, number> };
  doctors: { total: number; byStatus: Record<string, number> };
  categories: { total: number; byStatus: Record<string, number> };
  appointments: { byStatus: Record<string, number> };
  reviews: { total: number };
  medicalRecords: { total: number };
  notifications: { byStatus: Record<string, number> };
}
