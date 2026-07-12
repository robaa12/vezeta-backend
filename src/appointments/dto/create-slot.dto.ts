import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class CreateSlotDto {
  @ApiProperty({
    description: 'Slot start time (UTC, ISO 8601). Must be in the future.',
    example: '2026-08-01T09:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate({ message: 'startsAt must be a valid ISO 8601 date' })
  startsAt!: Date;

  @ApiProperty({
    description:
      'Slot end time (UTC, ISO 8601). Must be strictly after startsAt (service-layer check).',
    example: '2026-08-01T09:30:00.000Z',
  })
  @Type(() => Date)
  @IsDate({ message: 'endsAt must be a valid ISO 8601 date' })
  endsAt!: Date;
}
