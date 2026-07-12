import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';
import { AuthService } from './auth.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type {
  AuthSession,
  SessionUser,
} from '../common/interfaces/session.interface.js';
import { LinkSocialDto } from './dto/link-social.dto.js';
import type { SocialProvider } from './dto/link-social.dto.js';

@ApiTags('auth')
@ApiProduces('application/json')
@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get the currently authenticated user',
    description:
      'Returns the session user resolved from the Better Auth session cookie.',
  })
  @ApiCookieAuth('vezeta.session_token')
  @ApiOkResponse({
    description: 'The session user.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        emailVerified: { type: 'boolean' },
        phoneNumber: { type: 'string', nullable: true },
        phoneNumberVerified: { type: 'boolean' },
        role: { type: 'string', enum: ['user', 'admin'] },
        isActive: { type: 'boolean' },
        image: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        linkedSocialProviders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['google', 'facebook'] },
              linkedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  async me(
    @CurrentUser() _user: SessionUser | undefined,
    @Session() session: AuthSession | undefined,
  ): Promise<SessionUser> {
    return this.authService.getMe(session);
  }

  @Get('health')
  @AllowAnonymous()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({
    description: 'Service is up.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('auth/link-social')
  @ApiOperation({
    summary: 'Initiate linking a social provider to the current account',
    description:
      'Returns a URL the frontend should navigate to in order to start the OAuth flow. The callback will only succeed if the social account email matches the current user email.',
  })
  @ApiCookieAuth('vezeta.session_token')
  @ApiOkResponse({
    description: 'OAuth initiation URL.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({
    description: "User's email is not verified, or the user is deactivated.",
  })
  @ApiConflictResponse({
    description: 'A linked account for this provider already exists.',
  })
  async linkSocial(
    @CurrentUser() user: SessionUser | undefined,
    @Body() body: LinkSocialDto,
  ): Promise<{ url: string }> {
    if (!user) {
      throw new ForbiddenException('No active session');
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        message: 'Account deactivated',
        error: 'account_deactivated',
      });
    }
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Email must be verified before linking a social account',
        error: 'email_not_verified',
      });
    }

    const existing = await this.authService.findSocialAccount(
      user.id,
      body.provider,
    );
    if (existing) {
      throw new UnprocessableEntityException({
        message: 'A linked account for this provider already exists',
        error: 'provider_already_linked',
      });
    }

    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
    const callbackURL = body.callbackURL ?? '/';
    const url = `${baseUrl}/api/auth/sign-in/social?provider=${body.provider}&callbackURL=${encodeURIComponent(callbackURL)}&linkAccount=${user.id}`;

    return { url };
  }

  @Delete('auth/social-accounts/:provider')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unlink a social provider from the current account',
    description:
      'Removes a previously linked Google or Facebook account. Fails with 422 if the unlink would leave the user with no remaining sign-in method.',
  })
  @ApiCookieAuth('vezeta.session_token')
  @ApiOkResponse({
    description: 'Account unlinked.',
    schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['google', 'facebook'] },
        unlinkedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({
    description: 'No linked account for this provider.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Cannot unlink the last remaining sign-in method.',
  })
  async unlinkSocial(
    @CurrentUser() user: SessionUser | undefined,
    @Param('provider') provider: SocialProvider,
  ): Promise<{ provider: SocialProvider; unlinkedAt: string }> {
    if (!user) {
      throw new ForbiddenException('No active session');
    }
    if (provider !== 'google' && provider !== 'facebook') {
      throw new NotFoundException('Unknown provider');
    }

    const existing = await this.authService.findSocialAccount(
      user.id,
      provider,
    );
    if (!existing) {
      throw new NotFoundException({
        message: 'No linked account for this provider',
        error: 'provider_not_linked',
      });
    }

    const remaining = await this.authService.countRemainingSignInMethods(
      user.id,
    );
    if (remaining <= 1) {
      throw new UnprocessableEntityException({
        message: 'Cannot unlink the last remaining sign-in method',
        error: 'cannot_unlink_last_method',
      });
    }

    const result = await this.authService.unlinkSocialAccount(
      user.id,
      provider,
    );
    return {
      provider: result.provider,
      unlinkedAt: result.unlinkedAt.toISOString(),
    };
  }
}
