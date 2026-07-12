import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { UserRole } from '../../common/interfaces/session.interface.js';

export class RoleChangeDto {
  @ApiProperty({ enum: ['user', 'admin'] })
  @IsIn(['user', 'admin'])
  role!: UserRole;
}
