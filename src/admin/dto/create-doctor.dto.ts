import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateDoctorDto {
  @ApiProperty({
    description: "Doctor's full display name.",
    minLength: 2,
    maxLength: 120,
    example: 'Dr. Jane Smith',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: "Id of the ACTIVE category this doctor belongs to.",
    example: 'seed_cardiology',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Short biography / about section.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Profile photo URL. Must be a valid https:// URL.',
    maxLength: 2048,
    example: 'https://cdn.example.com/jane.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { message: 'imageUrl must be a valid https:// URL' },
  )
  imageUrl?: string;
}
