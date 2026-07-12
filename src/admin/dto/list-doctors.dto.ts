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

export type DoctorStatusFilter = 'ACTIVE' | 'DEACTIVATED';

export class ListDoctorsDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DEACTIVATED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: DoctorStatusFilter;

  @ApiPropertyOptional({
    description: 'Filter to doctors assigned to this categoryId.',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Substring match on name or category name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
