import { Injectable, LoggerService } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = {
  requestId?: string;
  userId?: string;
  method?: string;
  url?: string;
};

const requestStore = new AsyncLocalStorage<RequestContext>();

export function getRequestStore(): AsyncLocalStorage<RequestContext> {
  return requestStore;
}

const LEVEL_LABELS: Record<string, string> = {
  log: 'LOG',
  error: 'ERROR',
  warn: 'WARN',
  debug: 'DEBUG',
  verbose: 'VERBOSE',
};

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly isProduction: boolean;
  private readonly context?: string;

  constructor(context?: string) {
    this.context = context;
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  private emit(
    level: string,
    message: string,
    context?: string,
    trace?: string,
  ): void {
    if (this.isProduction) {
      const ctx = requestStore.getStore();
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context: context ?? this.context,
      };
      if (ctx?.requestId) entry.requestId = ctx.requestId;
      if (ctx?.userId) entry.userId = ctx.userId;
      if (ctx?.method) entry.method = ctx.method;
      if (ctx?.url) entry.url = ctx.url;
      if (trace) entry.trace = trace;

      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const label = LEVEL_LABELS[level] ?? level;
      const ctx = context ?? this.context ?? '';
      const ts = new Date().toISOString();
      const extra = trace ? `\n${trace}` : '';
      process.stdout.write(`[${ts}] ${label} [${ctx}] ${message}${extra}\n`);
    }
  }

  log(message: unknown, context?: string): void {
    this.emit('info', String(message), context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.emit('error', String(message), context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', String(message), context);
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', String(message), context);
  }

  verbose(message: unknown, context?: string): void {
    this.emit('debug', String(message), context);
  }

  /**
   * Wrap a callback in a request-scoped context so all logs emitted
   * during the callback automatically include requestId, userId, etc.
   */
  static runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return requestStore.run(ctx, fn);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setLogLevels(_levels: string[]): void {
    // no-op: all levels are always enabled
  }
}
