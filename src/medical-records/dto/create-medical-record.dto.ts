import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateMedicalRecordDto {
  @ApiPropertyOptional({
    description: 'Free-text clinical notes (max 10 000 chars).',
    maxLength: 10_000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Public URLs to attachments (e.g. lab results, prescriptions). Must be valid https:// URLs. Max 25.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { each: true, message: 'Each attachmentUrl must be a valid https:// URL' },
  )
  attachmentUrls?: string[];
}

export class UpdateMedicalRecordDto {
  @ApiPropertyOptional({ description: 'Updated clinical notes.', maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Replacement attachment URL list (max 25). Must be valid https:// URLs.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { each: true, message: 'Each attachmentUrl must be a valid https:// URL' },
  )
  attachmentUrls?: string[];
}