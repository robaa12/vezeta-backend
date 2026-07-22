import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminSlotsDto {
  @ApiPropertyOptional({ description: 'Filter by doctor id.' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status.',
    enum: ['AVAILABLE', 'BOOKED', 'BLOCKED'],
  })
  @IsOptional()
  @IsIn(['AVAILABLE', 'BOOKED', 'BLOCKED'])
  status?: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';

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
