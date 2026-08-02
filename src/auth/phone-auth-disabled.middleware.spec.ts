import { describe, expect, it, jest } from '@jest/globals';
import { rejectPhoneAuthRoutes } from './phone-auth-disabled.middleware.js';

describe('rejectPhoneAuthRoutes', () => {
  it.each([
    '/api/auth/sign-in/phone-number',
    '/api/auth/phone-number/send-otp',
    '/api/auth/phone-number/verify',
    '/api/auth/phone-number/request-password-reset',
    '/api/auth/phone-number/reset-password',
  ])('rejects %s before Better Auth can handle it', (path) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();

    rejectPhoneAuthRoutes({ path } as never, { status } as never, next);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'phone_auth_unavailable',
      error: 'Service Unavailable',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows email auth routes through', () => {
    const next = jest.fn();

    rejectPhoneAuthRoutes(
      { path: '/api/auth/email-otp/send-verification-otp' } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
