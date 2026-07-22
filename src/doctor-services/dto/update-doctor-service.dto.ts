import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateDoctorServiceDto {
  @ApiPropertyOptional({
    description: 'New service display name. Trimmed of leading/trailing whitespace.',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'New service price (no currency). Omit to clear; supply a number to set. Must be non-negative and at most 99999999.99.',
    minimum: 0,
    maximum: 99999999.99,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price?: number;

  @ApiPropertyOptional({
    description:
      'New discount as a percentage 0-100. Omit to clear; supply a number to set. Requires a price to be set either in this PATCH body or already on the service (enforced in the service layer).',
    minimum: 0,
    maximum: 100,
  })
  @ValidateIf((o: UpdateDoctorServiceDto) => o.discountPercent !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'New lifecycle status.',
    enum: ['ACTIVE', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
