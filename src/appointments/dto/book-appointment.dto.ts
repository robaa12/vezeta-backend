import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BookAppointmentDto {
  @ApiProperty({
    description:
      'Id of an AVAILABLE slot for an ACTIVE doctor in an ACTIVE category.',
    maxLength: 64,
    example: 'slot_abc',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  slotId!: string;

  @ApiPropertyOptional({
    description: 'Patient-supplied context (e.g. reason for visit).',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  patientNotes?: string;
}
