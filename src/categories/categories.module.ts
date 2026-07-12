import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';

@Module({
  controllers: [],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
