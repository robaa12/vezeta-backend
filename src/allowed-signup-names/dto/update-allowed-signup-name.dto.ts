import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAllowedSignupNameDto {
  @ApiPropertyOptional({
    description:
      'New full name. Must be exactly four words. Trimmed of leading/trailing whitespace.',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description:
      'New status. Setting it back to ACTIVE releases a consumed entry so it can admit another account.',
    enum: ['ACTIVE', 'USED', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'USED', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'USED' | 'DEACTIVATED';
}
