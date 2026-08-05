import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const now = new Date();
  let prisma: any;
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = {
      passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn() },
      user: { update: jest.fn() },
      webSession: { updateMany: jest.fn() },
      $transaction: jest.fn(async (work: any) => work(prisma)),
    };
    service = new PasswordResetService(prisma);
  });
  it.each([
    ['expired', new Date(now.getTime() - 1)],
    ['already consumed', new Date(now.getTime() + 60_000), now],
  ])(
    'rejects an %s password reset token',
    async (_label, expiresAt, consumedAt = null) => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 9,
        userId: 7,
        expiresAt,
        consumedAt,
        revokedAt: null,
      });
      await expect(
        service.resetPassword('raw-token', 'long-enough-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('consumes a reset token once, hashes the password with argon2id and revokes web sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 9,
      userId: 7,
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      revokedAt: null,
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

    await service.resetPassword('raw-token', 'long-enough-password');

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('raw-token').digest('hex'),
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { passwordHash: expect.stringMatching(/^\$argon2id\$/) },
      }),
    );
    expect(prisma.webSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, revokedAt: null } }),
    );
  });

  it('retries a serializable reset conflict once and rejects after persistent conflicts', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 9,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementation(async (work: any) => work(prisma));
    await expect(
      service.resetPassword('raw-token', 'long-enough-password'),
    ).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    prisma.$transaction.mockReset().mockRejectedValue({ code: 'P2034' });
    await expect(
      service.resetPassword('raw-token', 'long-enough-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('allows only one concurrent reset redemption to change password or revoke sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 9,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
    });
    prisma.passwordResetToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      service.resetPassword('raw-token', 'long-enough-password'),
      service.resetPassword('raw-token', 'long-enough-password'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.webSession.updateMany).toHaveBeenCalledTimes(1);
  });
});
