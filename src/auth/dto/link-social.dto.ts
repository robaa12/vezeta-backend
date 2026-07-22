import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export type SocialProvider = 'google' | 'facebook';

const RELATIVE_PATH_REGEX = /^\/(?!\/)[^\s]*$/;

export class LinkSocialDto {
  @ApiProperty({
    description: 'Social provider to link to the current account.',
    enum: ['google', 'facebook'],
    example: 'google',
  })
  @IsIn(['google', 'facebook'])
  provider!: SocialProvider;

  @ApiPropertyOptional({
    description:
      'Same-origin frontend route to return to after the link completes. Must be a relative path starting with `/` (no scheme, no host, no `//`).',
    example: '/profile/settings',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(RELATIVE_PATH_REGEX, {
    message: 'callbackURL must be a same-origin relative path starting with /',
  })
  callbackURL?: string;
}

export class SignInSocialQueryDto {
  @ApiProperty({
    description: 'Social provider to sign in with.',
    enum: ['google', 'facebook'],
  })
  @IsIn(['google', 'facebook'])
  provider!: SocialProvider;

  @ApiPropertyOptional({
    description:
      'Same-origin frontend route to return to after the OAuth flow completes. Must be a relative path starting with `/` (no scheme, no host, no `//`).',
    example: '/dashboard',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(RELATIVE_PATH_REGEX, {
    message: 'callbackURL must be a same-origin relative path starting with /',
  })
  callbackURL?: string;
}
