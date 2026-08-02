import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_DOCTOR_ADDRESS_LENGTH } from '../../common/constants.js';

export class UpdateDoctorDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Id of an ACTIVE category to reassign the doctor to.',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({
    description:
      'New clinic address. Pass an empty string to clear the address (and the doctor\'s Google Maps link, if no coordinates are set).',
    maxLength: MAX_DOCTOR_ADDRESS_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCTOR_ADDRESS_LENGTH)
  address?: string;

  @ApiPropertyOptional({
    description:
      "New clinic latitude (decimal degrees, WGS84, -90..90). Must be paired with `longitude`; if exactly one of lat/lng is supplied the request is rejected (enforced in the service layer). Pass `null` to clear.",
    minimum: -90,
    maximum: 90,
    example: 30.0444,
    nullable: true,
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number | null;

  @ApiPropertyOptional({
    description:
      "New clinic longitude (decimal degrees, WGS84, -180..180). Must be paired with `latitude`. Pass `null` to clear.",
    minimum: -180,
    maximum: 180,
    example: 31.2357,
    nullable: true,
  })
  @IsOptional()
  @IsLongitude()
  longitude?: number | null;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DEACTIVATED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
