import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAllowedSignupNamesDto {
  @ApiPropertyOptional({
    description: 'Filter by status.',
    enum: ['ACTIVE', 'USED', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'USED', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'USED' | 'DEACTIVATED';

  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on name.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

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
