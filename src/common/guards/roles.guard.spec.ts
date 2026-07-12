import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import type { SessionUser } from '../interfaces/session.interface.js';

type HandlerFn = (...args: unknown[]) => unknown;
type ClassCtor = new (...args: unknown[]) => unknown;

interface MockContext {
  switchToHttp: () => { getRequest: () => { user?: SessionUser } };
  getHandler: () => HandlerFn;
  getClass: () => ClassCtor;
}

function createContext(user: SessionUser | undefined): ExecutionContext {
  const ctx: MockContext = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  };
  return ctx as unknown as ExecutionContext;
}

function createReflector(roles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows request when no @Roles metadata is set', () => {
    const guard = new RolesGuard(createReflector(undefined));
    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('throws when user is missing', () => {
    const guard = new RolesGuard(createReflector(['admin']));
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('throws when user is deactivated', () => {
    const guard = new RolesGuard(createReflector(['admin']));
    const user: SessionUser = {
      id: 'u1',
      name: 'A',
      email: 'a@x.com',
      emailVerified: true,
      phoneNumber: null,
      phoneNumberVerified: false,
      role: 'admin',
      isActive: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(() => guard.canActivate(createContext(user))).toThrow(
      ForbiddenException,
    );
  });

  it('throws when role does not match', () => {
    const guard = new RolesGuard(createReflector(['admin']));
    const user: SessionUser = {
      id: 'u1',
      name: 'A',
      email: 'a@x.com',
      emailVerified: true,
      phoneNumber: null,
      phoneNumberVerified: false,
      role: 'user',
      isActive: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(() => guard.canActivate(createContext(user))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when role matches', () => {
    const guard = new RolesGuard(createReflector(['admin']));
    const user: SessionUser = {
      id: 'u1',
      name: 'A',
      email: 'a@x.com',
      emailVerified: true,
      phoneNumber: null,
      phoneNumberVerified: false,
      role: 'admin',
      isActive: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(guard.canActivate(createContext(user))).toBe(true);
  });
});
