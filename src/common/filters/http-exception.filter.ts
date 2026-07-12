import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body: ErrorResponseBody = this.normalizeHttpException(
        status,
        payload,
      );
      response.status(status).json(body);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }

  private normalizeHttpException(
    status: number,
    payload: string | object,
  ): ErrorResponseBody {
    if (typeof payload === 'string') {
      return {
        statusCode: status,
        message: payload,
        error: HttpStatus[status] ?? 'Error',
      };
    }
    const obj = payload as Record<string, unknown>;
    const message = (obj.message as string | string[] | undefined) ?? 'Error';
    const error =
      (obj.error as string | undefined) ?? HttpStatus[status] ?? 'Error';
    return {
      statusCode: status,
      message: Array.isArray(message) ? message.join('; ') : message,
      error,
    };
  }
}
