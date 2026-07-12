import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '../interfaces/session.interface.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: SessionUser }>();
    return request.user;
  },
);
