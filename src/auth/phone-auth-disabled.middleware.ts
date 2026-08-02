import type { NextFunction, Request, Response } from 'express';

export function rejectPhoneAuthRoutes(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.path.includes('/phone-number')) {
    response.status(503).json({
      statusCode: 503,
      message: 'phone_auth_unavailable',
      error: 'Service Unavailable',
    });
    return;
  }

  next();
}
