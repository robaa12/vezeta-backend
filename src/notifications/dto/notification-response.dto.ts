import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnqueueInput {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ enum: ['EMAIL', 'IN_APP'] })
  channel?: 'EMAIL' | 'IN_APP';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  dispatch?: boolean;
}

export class NotificationRecord {
  @ApiProperty({ description: 'Unique identifier.' })
  id!: string;

  @ApiProperty({ enum: ['EMAIL', 'IN_APP'] })
  channel!: 'EMAIL' | 'IN_APP';

  @ApiProperty({ enum: ['QUEUED', 'SENT', 'FAILED'] })
  status!: 'QUEUED' | 'SENT' | 'FAILED';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  sentAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class ListNotificationsResult {
  @ApiProperty({ type: [NotificationRecord] })
  notifications!: NotificationRecord[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ description: 'Number of unread notifications (for badge UI).' })
  unreadCount!: number;
}
