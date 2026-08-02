import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorServiceResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Id of the owning doctor.' })
  doctorId!: string;

  @ApiProperty({ description: 'Service display name.' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Service price (no currency). Null when not priced.',
    example: 150.0,
  })
  price!: number | null;

  @ApiProperty({
    description:
      'FIXED for a known price, or ON_REQUEST when the clinic confirms the price directly.',
    enum: ['FIXED', 'ON_REQUEST'],
  })
  pricingMode!: 'FIXED' | 'ON_REQUEST';

  @ApiPropertyOptional({
    description:
      'Independent discount percentage 0-100. May be set when price is null. Null when no discount.',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  discountPercent!: number | null;

  @ApiPropertyOptional({
    description:
      'Computed final price after discount. Null when pricingMode is ON_REQUEST because the clinic confirms the price. Equal to `price` when `discountPercent` is null or 0.',
    example: 135.0,
  })
  finalPrice!: number | null;

  @ApiProperty({
    description: 'Lifecycle status.',
    enum: ['ACTIVE', 'DEACTIVATED'],
  })
  status!: 'ACTIVE' | 'DEACTIVATED';

  @ApiProperty({ description: 'Creation timestamp.' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last-update timestamp.' })
  updatedAt!: Date;
}
