import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { SocialProvider } from './link-social.dto.js';

export class UnlinkSocialParamDto {
  @ApiProperty({
    description: 'Social provider to unlink from the current account.',
    enum: ['google', 'facebook'],
    example: 'google',
  })
  @IsIn(['google', 'facebook'])
  provider!: SocialProvider;
}
