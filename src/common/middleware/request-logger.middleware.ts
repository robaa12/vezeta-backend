import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms req=${requestId} user=${userId ?? '-'}`,
      );
    });

    next();
  }
}
