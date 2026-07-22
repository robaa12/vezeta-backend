import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface DoctorRef {
  id: string;
  name: string;
}

export class ReviewResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Appointment the review was left for.' })
  appointmentId!: string;

  @ApiProperty({ description: 'Doctor this review is about.' })
  doctor!: DoctorRef;

  @ApiProperty({ description: 'Numeric rating from 1 to 5.', example: 5 })
  rating!: number;

  @ApiPropertyOptional({ description: 'Optional patient-written comment.' })
  comment!: string | null;

  @ApiProperty({ description: 'Author (patient) display name.' })
  authorName!: string;

  @ApiProperty({ description: 'Creation timestamp.' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last-update timestamp.' })
  updatedAt!: Date;
}

export class ListReviewsResult {
  @ApiProperty({ type: [ReviewResponseDto] })
  reviews!: ReviewResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: Number, nullable: true, description: '1-5 aggregate, null if no reviews yet.' })
  averageRating!: number | null;
}