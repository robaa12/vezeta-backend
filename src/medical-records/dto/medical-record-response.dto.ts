import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface DoctorRef {
  id: string;
  name: string;
}

export class MedicalRecordResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  appointmentId!: string;

  @ApiProperty({ description: 'Patient the record belongs to.' })
  patientId!: string;

  @ApiProperty({ description: 'Treating doctor (denormalised name for read).' })
  doctor!: DoctorRef;

  @ApiPropertyOptional({ description: 'Clinical notes.' })
  notes!: string | null;

  @ApiProperty({ description: 'Attachment URLs.', type: [String] })
  attachmentUrls!: string[];

  @ApiProperty({ description: 'Admin who authored the record.' })
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/**
 * List-view DTO for the patient's medical history. Omits `notes`,
 * `attachmentUrls`, and `createdById` (detail-only fields that can be
 * up to 10 KB per record). The detail DTO is `MedicalRecordResponseDto`;
 * fetch the full record via `GET /api/appointments/:id/medical-record`.
 */
export class MedicalRecordListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  appointmentId!: string;

  @ApiProperty({ description: 'Patient the record belongs to.' })
  patientId!: string;

  @ApiProperty({ description: 'Treating doctor (denormalised name for read).' })
  doctor!: DoctorRef;

  @ApiProperty({ description: 'Admin who authored the record.' })
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ListMedicalHistoryResult {
  @ApiProperty({ type: [MedicalRecordListItemDto] })
  records!: MedicalRecordListItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}