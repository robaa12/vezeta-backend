import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  claimAllowedSignupName,
  type AllowedSignupNameClaimClient,
} from './signup-name-claim.js';

const mockClient = () => ({
  allowedSignupName: {
    updateMany: jest.fn<() => Promise<{ count: number }>>(),
  },
});

describe('claimAllowedSignupName', () => {
  let prisma: ReturnType<typeof mockClient>;

  beforeEach(() => {
    prisma = mockClient();
  });

  const claim = (name: string, email = 'user@example.com') =>
    claimAllowedSignupName(
      prisma as unknown as AllowedSignupNameClaimClient,
      name,
      email,
    );

  it('claims a matching ACTIVE entry and reports success', async () => {
    prisma.allowedSignupName.updateMany.mockResolvedValue({ count: 1 });

    await expect(claim('Ahmed Ali Hassan Omar')).resolves.toBe(true);
  });

  it('matches case-insensitively and ignores sloppy whitespace', async () => {
    prisma.allowedSignupName.updateMany.mockResolvedValue({ count: 1 });

    await expect(claim('  ahmed   ALI hassan Omar ')).resolves.toBe(true);

    const args = prisma.allowedSignupName.updateMany.mock.calls[0]?.[0] as {
      where: { normalizedName: string; status: string };
      data: { status: string; usedByEmail: string };
    };
    expect(args.where.normalizedName).toBe('ahmed ali hassan omar');
  });

  it('guards the update on status ACTIVE so a race cannot double-claim', async () => {
    prisma.allowedSignupName.updateMany.mockResolvedValue({ count: 1 });

    await claim('Ahmed Ali Hassan Omar', 'winner@example.com');

    const args = prisma.allowedSignupName.updateMany.mock.calls[0]?.[0] as {
      where: { normalizedName: string; status: string };
      data: { status: string; usedByEmail: string };
    };
    expect(args.where.status).toBe('ACTIVE');
    expect(args.data.status).toBe('USED');
    expect(args.data.usedByEmail).toBe('winner@example.com');
  });

  it('fails when the entry was already consumed (no rows matched)', async () => {
    prisma.allowedSignupName.updateMany.mockResolvedValue({ count: 0 });

    await expect(claim('Ahmed Ali Hassan Omar')).resolves.toBe(false);
  });

  it('rejects a name that is not four words without querying', async () => {
    await expect(claim('Ahmed Ali Hassan')).resolves.toBe(false);
    await expect(claim('Ahmed Ali Hassan Omar Farouk')).resolves.toBe(false);
    await expect(claim('')).resolves.toBe(false);

    expect(prisma.allowedSignupName.updateMany).not.toHaveBeenCalled();
  });
});
