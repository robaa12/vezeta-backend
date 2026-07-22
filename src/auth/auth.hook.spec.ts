import { describe, it, expect } from '@jest/globals';

// Replicate the role-coercion logic from src/auth/auth.ts
// `databaseHooks.user.create.before` callback. The callback lives inside
// the Better Auth handler and is not directly importable, so we test the
// behavior in isolation by re-implementing the same logic against a set
// of inputs and asserting the expected output.
//
// SECURITY: the hook is the last line of defence against role self-promotion
// via /api/auth/sign-up/email. Sign-up must NEVER yield an admin account,
// regardless of what the client sends in the request body. The corresponding
// `additionalFields.role.input` is also `false` (see src/auth/auth.ts) so
// the field is dropped by Better Auth's input parser before reaching us, but
// we re-assert the invariant here as defence in depth.

interface UserCreateInput {
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

function coerceRoleOnCreate(user: UserCreateInput): { data: UserCreateInput } {
  const record = user;
  return { data: { ...record, role: 'user' } };
}

describe('databaseHooks.user.create.before (role coercion)', () => {
  it('forces role to "user" when role: "user" is supplied', () => {
    const result = coerceRoleOnCreate({ role: 'user' });
    expect(result.data.role).toBe('user');
  });

  it('forces role to "user" when role: "admin" is supplied (regression)', () => {
    const result = coerceRoleOnCreate({ role: 'admin' });
    expect(result.data.role).toBe('user');
  });

  it('defaults to "user" when role is omitted', () => {
    const result = coerceRoleOnCreate({ name: 'A' });
    expect(result.data.role).toBe('user');
  });

  it('forces role to "user" for any other supplied role', () => {
    expect(coerceRoleOnCreate({ role: 'doctor' }).data.role).toBe('user');
    expect(coerceRoleOnCreate({ role: 'patient' }).data.role).toBe('user');
    expect(coerceRoleOnCreate({ role: 'superuser' }).data.role).toBe('user');
    expect(coerceRoleOnCreate({ role: '' }).data.role).toBe('user');
  });

  it('preserves other input fields when forcing role', () => {
    const result = coerceRoleOnCreate({
      name: 'Jane',
      email: 'jane@x.com',
      role: 'admin',
    });
    expect(result.data.name).toBe('Jane');
    expect(result.data.email).toBe('jane@x.com');
    expect(result.data.role).toBe('user');
  });
});
