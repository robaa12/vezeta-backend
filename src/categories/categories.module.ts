import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { CategoriesController } from './categories.controller.js';

@Module({
  controllers: [AdminCategoriesController, CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
