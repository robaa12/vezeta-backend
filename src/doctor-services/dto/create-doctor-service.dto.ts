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
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price?: number | null;

  @ApiPropertyOptional({
    description:
      'Optional discount percentage 0-100. It can be supplied independently when the service has no listed price.',
    example: 10,
    minimum: 0,
    maximum: 100,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Lifecycle status. Defaults to ACTIVE when omitted.',
    enum: ['ACTIVE', 'DEACTIVATED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
