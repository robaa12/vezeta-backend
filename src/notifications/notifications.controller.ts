import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { NotificationsService } from './notifications.service.js';
import {
  ListNotificationsDto,
  MarkReadDto,
} from './dto/list-notifications.dto.js';
import type {
  ListNotificationsResult,
  NotificationRecord,
} from './dto/notification-response.dto.js';

@ApiTags('notifications')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Account is deactivated.' })
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List my notifications (in-app inbox)',
    description:
      'Paginated list of the caller\u2019s notifications, newest first. Optional unreadOnly filter. Includes unreadCount for unread-badge UI.',
  })
  @ApiOkResponse({ description: 'Paginated notification list.' })
  listMine(
    @Query() query: ListNotificationsDto,
    @CurrentUser() user: SessionUser,
  ): Promise<ListNotificationsResult> {
    return this.notificationsService.listMine(user.id, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read or unread' })
  @ApiParam({ name: 'id', description: 'Notification id (cuid)' })
  @ApiOkResponse({ description: 'Notification updated.' })
  @ApiNotFoundResponse({
    description: 'Notification does not exist or belongs to another user.',
  })
  markRead(
    @Param('id') id: string,
    @Body() body: MarkReadDto,
    @CurrentUser() user: SessionUser,
  ): Promise<NotificationRecord> {
    return this.notificationsService.markRead(user.id, id, body.read ?? true);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({ description: 'Updated count.' })
  markAllRead(@CurrentUser() user: SessionUser): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(user.id);
  }
}
