import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { ListCategoriesDto } from './dto/list-categories.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import {
  CategoriesService,
  type ListCategoriesResult,
} from './categories.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { CategoryResponseDto } from './dto/category-response.dto.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin/categories')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List categories (admin)',
    description:
      'Returns categories with optional status + search filters and pagination. Admin-only.',
  })
  @ApiOkResponse({ description: 'Paginated list of categories.' })
  list(@Query() query: ListCategoriesDto): Promise<ListCategoriesResult> {
    return this.categoriesService.listCategories(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id (admin)' })
  @ApiParam({ name: 'id', description: 'Category id (cuid)' })
  @ApiOkResponse({ description: 'Category found.' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  getOne(@Param('id') id: string): Promise<CategoryResponseDto> {
    return this.categoriesService.getCategory(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new category (admin)' })
  @ApiCreatedResponse({ description: 'Category created.' })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  @ApiConflictResponse({
    description: 'A category with this name already exists.',
  })
  create(
    @Body() body: CreateCategoryDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.createCategory(body).then((cat) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'category.create',
        entityType: 'category',
        entityId: cat.id,
        details: { name: cat.name },
      });
      return cat;
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category (partial)' })
  @ApiParam({ name: 'id', description: 'Category id (cuid)' })
  @ApiOkResponse({ description: 'Category updated.' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  @ApiBadRequestResponse({ description: 'No fields to update.' })
  @ApiConflictResponse({
    description: 'Name collision with another ACTIVE category.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.updateCategory(id, body).then((cat) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'category.update',
        entityType: 'category',
        entityId: id,
        details: { changedFields: Object.keys(body) },
      });
      return cat;
    });
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate a category' })
  @ApiParam({ name: 'id', description: 'Category id (cuid)' })
  @ApiOkResponse({ description: 'Category deactivated (idempotent).' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.deactivateCategory(id).then((cat) => {
      void this.audit.record({
        actorId: admin.id,
        action: 'category.deactivate',
        entityType: 'category',
        entityId: id,
      });
      return cat;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete a category' })
  @ApiParam({ name: 'id', description: 'Category id (cuid)' })
  @ApiNoContentResponse({ description: 'Category deleted.' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  @ApiConflictResponse({
    description: 'Category is in use by one or more doctors.',
  })
  async delete(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<void> {
    await this.categoriesService.deleteCategory(id);
    void this.audit.record({
      actorId: admin.id,
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
    });
  }
}
