import { ApiProperty } from '@nestjs/swagger';

export class PublicCategoryDto {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ description: 'Display name.' })
  name!: string;
}
