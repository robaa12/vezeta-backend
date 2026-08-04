import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_DOCTOR_ADDRESS_LENGTH } from '../../common/constants.js';

export class CreateDoctorDto {
  @ApiProperty({
    description: "Doctor's full display name.",
    minLength: 2,
    maxLength: 120,
    example: 'Dr. Jane Smith',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: "Id of the ACTIVE category this doctor belongs to.",
    example: 'seed_cardiology',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Short biography / about section.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ description: 'Clinic city.', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Clinic area or district.', maxLength: 160 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(160)
  area?: string;

  @ApiPropertyOptional({
    description:
      'Clinic address. Coordinates take priority for Google Maps; otherwise the address is used as a search query.',
    maxLength: MAX_DOCTOR_ADDRESS_LENGTH,
    example: '15 Tahrir Square, Cairo, Egypt',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCTOR_ADDRESS_LENGTH)
  address?: string;

  @ApiPropertyOptional({
    description:
      "Clinic latitude in decimal degrees (WGS84, -90..90). Must be paired with `longitude`; if exactly one of lat/lng is supplied the request is rejected (enforced in the service layer).",
    minimum: -90,
    maximum: 90,
    example: 30.0444,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description:
      "Clinic longitude in decimal degrees (WGS84, -180..180). Must be paired with `latitude`.",
    minimum: -180,
    maximum: 180,
    example: 31.2357,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
