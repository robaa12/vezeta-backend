import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  @ApiPropertyOptional({
    description: 'Filter to unread only (readAt is null).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unreadOnly?: boolean;

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

export class MarkReadDto {
  @ApiPropertyOptional({ description: 'Mark as read (true) or unread (false).', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  read?: boolean;
}