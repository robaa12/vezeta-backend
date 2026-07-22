import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateDoctorServiceDto {
  @ApiProperty({
    description:
      'Service display name (free-text, e.g. "Consultation", "ECG"). Trimmed of leading/trailing whitespace.',
    minLength: 1,
    maxLength: 100,
    example: 'Consultation',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description:
      'Service price (no currency). Omit for free / price-on-request services. Must be non-negative and at most 99999999.99.',
    example: 150.0,
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
      'Discount as a percentage 0-100. Only meaningful when a price is also set; rejected with 400 if supplied without a price.',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @ValidateIf((o: CreateDoctorServiceDto) => o.discountPercent !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'Lifecycle status. Defaults to ACTIVE when omitted.',
    enum: ['ACTIVE', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
