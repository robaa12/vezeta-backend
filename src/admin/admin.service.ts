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
    // v1: no appointments table exists, so hard-delete is always allowed.
    // When a future appointments feature lands, this check should be
    // expanded to reject deletion when the doctor has historical bookings.
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
    adminId: string,
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
          NOT: { id: adminId === userId ? userId : userId },
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
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, isActive: true, name: true, email: true },
    });
    await this.prisma.session.deleteMany({ where: { userId } });
    return updated;
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
