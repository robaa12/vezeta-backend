import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Display name.' })
  name!: string;

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
