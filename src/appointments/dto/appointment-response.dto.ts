import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface PublicCategoryRef {
  id: string;
  name: string;
}

export interface PublicDoctorRef {
  id: string;
  name: string;
  category: PublicCategoryRef;
}

export class AppointmentResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({
    description: 'Lifecycle status.',
    enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  status!: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({ description: 'When the appointment is scheduled (UTC).' })
  scheduledAt!: Date;

  @ApiPropertyOptional({
    description: 'Patient-supplied notes (e.g. reason for visit).',
  })
  patientNotes!: string | null;

  @ApiPropertyOptional({
    description: 'When the appointment was cancelled, or null.',
  })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Who cancelled the appointment, or null.',
    enum: ['USER', 'ADMIN'],
  })
  cancelledBy!: 'USER' | 'ADMIN' | null;

  @ApiProperty({ description: 'The doctor this appointment is with.' })
  doctor!: PublicDoctorRef;

  @ApiProperty({ description: 'Creation timestamp.' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last-update timestamp.' })
  updatedAt!: Date;
}

export class ListMyAppointmentsResult {
  @ApiProperty({ description: 'Paginated appointments.', type: [AppointmentResponseDto] })
  appointments!: AppointmentResponseDto[];

  @ApiProperty({ description: 'Total matching rows.' })
  total!: number;

  @ApiProperty({ description: '1-based page number.' })
  page!: number;

  @ApiProperty({ description: 'Items per page.' })
  pageSize!: number;
}
