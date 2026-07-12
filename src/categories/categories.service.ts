import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { ListCategoriesDto } from './dto/list-categories.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import type { CategoryResponseDto } from './dto/category-response.dto.js';
import type { PublicCategoryDto } from './dto/public-category.dto.js';

export interface ListCategoriesResult {
  categories: CategoryResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(
    query: ListCategoriesDto,
  ): Promise<ListCategoriesResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [records, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      categories: records.map((r) => this.toResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  async getCategory(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return this.toResponse(category);
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const name = dto.name;
    const existing = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'A category with this name already exists',
        error: 'duplicate_name',
      });
    }

    const created = await this.prisma.category.create({
      data: {
        name,
        status: dto.status ?? 'ACTIVE',
      },
    });
    return this.toResponse(created);
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }
    if (dto.name === undefined && dto.status === undefined) {
      throw new BadRequestException('No fields to update');
    }
    if (dto.name !== undefined && dto.name !== existing.name) {
      const collision = await this.prisma.category.findFirst({
        where: {
          name: { equals: dto.name, mode: 'insensitive' },
          status: 'ACTIVE',
          NOT: { id },
        },
        select: { id: true },
      });
      if (collision) {
        throw new ConflictException({
          message: 'A category with this name already exists',
          error: 'duplicate_name',
        });
      }
    }
    if (dto.status === 'ACTIVE' && existing.status === 'DEACTIVATED') {
      const collision = await this.prisma.category.findFirst({
        where: {
          name: { equals: existing.name, mode: 'insensitive' },
          status: 'ACTIVE',
          NOT: { id },
        },
        select: { id: true },
      });
      if (collision) {
        throw new ConflictException({
          message:
            'Cannot reactivate: another ACTIVE category with this name already exists',
          error: 'duplicate_name',
        });
      }
    }
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.toResponse(updated);
  }

  async deactivateCategory(id: string): Promise<CategoryResponseDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }
    if (existing.status === 'DEACTIVATED') {
      return this.toResponse(existing);
    }
    const updated = await this.prisma.category.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
    });
    return this.toResponse(updated);
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }
    await this.prisma.$transaction(async (tx) => {
      const referencingCount = await tx.doctor.count({
        where: { categoryId: id },
      });
      if (referencingCount > 0) {
        throw new ConflictException({
          message: 'Category is in use by one or more doctors',
          error: 'category_in_use',
        });
      }
      await tx.category.delete({ where: { id } });
    });
  }

  async listPublicCategories(): Promise<PublicCategoryDto[]> {
    const records = await this.prisma.category.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return records
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  }

  private toResponse(c: {
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): CategoryResponseDto {
    return {
      id: c.id,
      name: c.name,
      status: c.status as CategoryResponseDto['status'],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
