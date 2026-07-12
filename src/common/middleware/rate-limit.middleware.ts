import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly store = new Map<string, RateLimitEntry>();

  private readonly windowMs = 60_000;
  private readonly max = 5;

  use(req: Request, res: Response, next: NextFunction): void {
    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').toString();
    const key = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();

    const entry = this.store.get(key);
    if (!entry || entry.resetAt < now) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      this.setHeaders(res, this.max - 1, this.windowMs);
      next();
      return;
    }

    if (entry.count >= this.max) {
      this.logger.warn(`Rate limit exceeded: ${key}`);
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests',
        error: 'Too Many Requests',
      });
      return;
    }

    entry.count += 1;
    this.setHeaders(res, this.max - entry.count, entry.resetAt - now);
    next();
  }

  private setHeaders(
    res: Response,
    remaining: number,
    retryAfterMs: number,
  ): void {
    res.setHeader('x-ratelimit-remaining', Math.max(0, remaining));
    res.setHeader(
      'x-ratelimit-retry-after-ms',
      Math.max(0, Math.ceil(retryAfterMs / 1000)),
    );
  }
}
