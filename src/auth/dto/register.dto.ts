import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Full display name of the user.',
    minLength: 2,
    maxLength: 120,
    example: 'Jane Doe',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Email address used for sign-in and verification.',
    maxLength: 255,
    example: 'jane@example.com',
  })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    description: 'Password for the new account.',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description: 'Phone number in E.164 format (e.g. +201234567890).',
    example: '+201234567890',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be a valid E.164 number (e.g. +201234567890)',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description:
      'Account role. Only "user" is accepted (the default). Any other value is rejected. Admins are seeded or promoted out of band.',
    enum: ['user'],
    default: 'user',
  })
  @IsOptional()
  @IsIn(['user'])
  role?: 'user';
}
