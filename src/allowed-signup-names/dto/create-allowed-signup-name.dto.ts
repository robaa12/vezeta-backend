import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAllowedSignupNameDto {
  @ApiProperty({
    description:
      'Full name allowed to register. Must be exactly four words. Trimmed of leading/trailing whitespace.',
    minLength: 1,
    maxLength: 120,
    example: 'Ahmed Ali Hassan Omar',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Entry status. Defaults to ACTIVE when omitted.',
    enum: ['ACTIVE', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
