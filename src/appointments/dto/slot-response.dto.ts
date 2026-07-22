import { ApiProperty } from '@nestjs/swagger';

export class SlotResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Doctor this slot belongs to.' })
  doctorId!: string;

  @ApiProperty({ description: 'Slot start (UTC).' })
  startsAt!: Date;

  @ApiProperty({ description: 'Slot end (UTC).' })
  endsAt!: Date;

  @ApiProperty({
    description: 'Slot lifecycle status.',
    enum: ['AVAILABLE', 'BOOKED', 'BLOCKED'],
  })
  status!: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';

  @ApiProperty({ description: 'Creation timestamp.' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last-update timestamp.' })
  updatedAt!: Date;
}

export class ListSlotsResult {
  @ApiProperty({ description: 'Paginated slots.', type: [SlotResponseDto] })
  slots!: SlotResponseDto[];

  @ApiProperty({ description: 'Total matching rows.' })
  total!: number;

  @ApiProperty({ description: '1-based page number.' })
  page!: number;

  @ApiProperty({ description: 'Items per page.' })
  pageSize!: number;
}
