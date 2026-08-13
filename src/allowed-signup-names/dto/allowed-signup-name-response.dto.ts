import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AllowedSignupNameResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Full name as the admin entered it.' })
  name!: string;

  @ApiProperty({
    description: 'Lifecycle status. USED means an account has claimed it.',
    enum: ['ACTIVE', 'USED', 'DEACTIVATED'],
  })
  status!: 'ACTIVE' | 'USED' | 'DEACTIVATED';

  @ApiPropertyOptional({
    description: 'Email of the account that consumed this entry.',
    nullable: true,
  })
  usedByEmail!: string | null;

  @ApiPropertyOptional({
    description: 'When the entry was consumed.',
    nullable: true,
  })
  usedAt!: Date | null;

  @ApiProperty({ description: 'Creation timestamp.' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last-update timestamp.' })
  updatedAt!: Date;
}
