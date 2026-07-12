import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type SocialProvider = 'google' | 'facebook';

export class LinkSocialDto {
  @ApiProperty({
    description: 'Social provider to link to the current account.',
    enum: ['google', 'facebook'],
    example: 'google',
  })
  @IsIn(['google', 'facebook'])
  provider!: SocialProvider;

  @ApiPropertyOptional({
    description: 'Frontend route to return to after the link completes.',
    example: '/profile/settings',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  callbackURL?: string;
}
