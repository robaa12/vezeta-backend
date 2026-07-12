import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateSlotDto {
  @ApiPropertyOptional({
    description:
      'New slot status. BOOKED is NOT settable via this endpoint — booking manages that lifecycle.',
    enum: ['AVAILABLE', 'BLOCKED'],
  })
  @IsOptional()
  @IsIn(['AVAILABLE', 'BLOCKED'])
  status?: 'AVAILABLE' | 'BLOCKED';
}
