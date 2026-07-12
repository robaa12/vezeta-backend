import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { AdminCategoriesController } from './admin-categories.controller.js';

@Module({
  controllers: [AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
