import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { message: 'imageUrl must be a valid https:// URL' },
  )
  imageUrl?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DEACTIVATED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}
