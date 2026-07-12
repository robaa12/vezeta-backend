import { describe, it, expect } from '@jest/globals';

// Replicate the role-coercion logic from src/auth/auth.ts
// `databaseHooks.user.create.before` callback. The callback lives inside
// the Better Auth handler and is not directly importable, so we test the
// behavior in isolation by re-implementing the same logic against a set
// of inputs and asserting the expected output.

interface UserCreateInput {
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

const allowedRoles = new Set(['user', 'admin']);

function coerceRoleOnCreate(user: UserCreateInput): { data: UserCreateInput } {
  const record = user;
  const role = record.role;
  if (role !== undefined && !allowedRoles.has(role)) {
    throw new Error('invalid_role');
  }
  return { data: { ...record, role: role ?? 'user' } };
}

describe('databaseHooks.user.create.before (role coercion)', () => {
  it('accepts role: "user"', () => {
    const result = coerceRoleOnCreate({ role: 'user' });
    expect(result.data.role).toBe('user');
  });

  it('accepts role: "admin"', () => {
    const result = coerceRoleOnCreate({ role: 'admin' });
    expect(result.data.role).toBe('admin');
  });

  it('defaults to "user" when role is omitted', () => {
    const result = coerceRoleOnCreate({ name: 'A' });
    expect(result.data.role).toBe('user');
  });

  it('rejects role: "doctor"', () => {
    expect(() => coerceRoleOnCreate({ role: 'doctor' })).toThrow(
      'invalid_role',
    );
  });

  it('rejects role: "patient" (legacy value)', () => {
    expect(() => coerceRoleOnCreate({ role: 'patient' })).toThrow(
      'invalid_role',
    );
  });

  it('rejects unknown role values', () => {
    expect(() => coerceRoleOnCreate({ role: 'superuser' })).toThrow(
      'invalid_role',
    );
    expect(() => coerceRoleOnCreate({ role: '' })).toThrow('invalid_role');
  });

  it('preserves other input fields when role is allowed', () => {
    const result = coerceRoleOnCreate({
      name: 'Jane',
      email: 'jane@x.com',
      role: 'user',
    });
    expect(result.data.name).toBe('Jane');
    expect(result.data.email).toBe('jane@x.com');
    expect(result.data.role).toBe('user');
  });
});
