import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListReviewsDto {
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

export class ListAdminReviewsDto extends ListReviewsDto {
  @ApiPropertyOptional({ description: 'Filter by doctor id.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Filter by patient user id.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;
}
