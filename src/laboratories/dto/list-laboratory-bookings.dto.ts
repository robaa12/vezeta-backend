import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListLaboratoryBookingsDto {
  @ApiPropertyOptional({
    description: 'Filter reservations by lifecycle status.',
    enum: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['CONFIRMED', 'COMPLETED', 'CANCELLED'])
  status?: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'Filter by laboratory id (admin).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  laboratoryId?: string;

  @ApiPropertyOptional({
    description:
      'Search patients, laboratories, and services (admin only).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
