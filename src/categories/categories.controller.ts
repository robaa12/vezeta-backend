import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CategoriesService } from './categories.service.js';
import type { PublicCategoryDto } from './dto/public-category.dto.js';

@ApiTags('categories')
@ApiProduces('application/json')
@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * US5 — Patient-facing category dropdown.
   * Anonymous (no auth). Active categories only, sorted
   * case-insensitively. 5-minute cache hint (vocabulary changes less
   * often than the doctor catalog).
   */
  @Get()
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'List ACTIVE categories (public)',
    description:
      'Anonymous-accessible list of active categories used to populate the doctor search dropdown. Sorted alphabetically (case-insensitive).',
  })
  @ApiOkResponse({
    description: 'Active categories, sorted.',
    schema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  list(): Promise<{ categories: PublicCategoryDto[] }> {
    return this.categoriesService
      .listPublicCategories()
      .then((categories) => ({ categories }));
  }
}
