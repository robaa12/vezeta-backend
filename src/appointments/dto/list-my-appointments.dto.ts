import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListMyAppointmentsDto {
  @ApiPropertyOptional({
    description: 'Filter by status.',
    enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ description: '1-based page number.', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (1-100).', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
