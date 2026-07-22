import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { StructuredLogger } from '../logging/structured.logger.js';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new StructuredLogger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();

    StructuredLogger.runWithContext(
      {
        requestId,
        method: req.method,
        url: req.originalUrl,
      },
      () => {
        res.on('finish', () => {
          const ms = Date.now() - start;
          const userId = (req as Request & { user?: { id?: string } }).user?.id;
          this.logger.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms req=${requestId} user=${userId ?? '-'}`,
          );
        });

        next();
      },
    );
  }
}
