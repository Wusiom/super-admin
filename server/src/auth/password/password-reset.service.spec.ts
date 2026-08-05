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
});
