import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const ATTACHMENT_URL_PATTERN = /^(https:\/\/[^\s]+|\/uploads\/laboratory-records\/[a-z0-9-]+\.webp)$/i;

export class SaveLaboratoryMedicalRecordDto {
  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 25 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  @Matches(ATTACHMENT_URL_PATTERN, {
    each: true,
    message: 'Each attachment must be an HTTPS URL or an uploaded image',
  })
  attachmentUrls?: string[];
}

export class LaboratoryMedicalRecordResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  laboratoryBookingId!: string;

  @ApiProperty()
  patientId!: string;

  @ApiProperty()
  laboratory!: { id: string; name: string };

  @ApiPropertyOptional()
  notes!: string | null;

  @ApiProperty({ type: [String] })
  attachmentUrls!: string[];

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
