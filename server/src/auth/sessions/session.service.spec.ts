import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { SessionService } from './session.service';

describe('SessionService', () => {
  const accessSecret = 'test-jwt-access-secret-at-least-32-chars';
  const now = new Date();
  let prisma: any;
  let service: SessionService;

  beforeEach(() => {
    prisma = {
      webSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (work: any) => work(prisma)),
    };
    service = new SessionService(prisma, new JwtService(), {
      getOrThrow: jest.fn().mockReturnValue(accessSecret),
    } as any);
  });

  it('creates a short-lived signed access token and stores only the refresh hash', async () => {
    prisma.webSession.create.mockResolvedValue({
      id: 17,
      familyId: 'family-a',
    });

    const result = await service.createSession({ id: 7, role: 'USER' });

    expect(
      await new JwtService().verifyAsync(result.accessToken, {
        secret: accessSecret,
      }),
    ).toMatchObject({
      userId: 7,
      role: 'USER',
      sessionId: 17,
      kind: 'web',
    });
    expect(prisma.webSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 7,
          tokenHash: expect.any(String),
          familyId: expect.any(String),
        }),
      }),
    );
    const storedHash = prisma.webSession.create.mock.calls[0][0].data.tokenHash;
    expect(storedHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(storedHash).not.toBe(result.refreshToken);
  });

  it('rotates a valid refresh token exactly once and keeps its family', async () => {
    const oldHash = createHash('sha256').update('old-refresh').digest('hex');
    prisma.webSession.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      tokenHash: oldHash,
      familyId: 'family-a',
      expiresAt: new Date(now.getTime() + 60_000),
      rotatedAt: null,
      revokedAt: null,
      user: { id: 7, role: 'USER', status: 'ACTIVE' },
    });
    prisma.webSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.webSession.create.mockResolvedValue({ id: 4, familyId: 'family-a' });

    const result = await service.rotate('old-refresh');

    expect(prisma.webSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rotatedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.webSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ familyId: 'family-a' }),
      }),
    );
    expect(result.refreshToken).not.toBe('old-refresh');
  });

  it('revokes the token family when a rotated refresh token is reused', async () => {
    prisma.webSession.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      familyId: 'family-a',
      expiresAt: new Date(now.getTime() + 60_000),
      rotatedAt: now,
      revokedAt: null,
      user: { id: 7, role: 'USER', status: 'ACTIVE' },
    });

    await expect(service.rotate('reused-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.webSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          familyId: 'family-a',
          revokedAt: null,
        }),
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('revokes the current session and all sessions for logout operations', async () => {
    prisma.webSession.updateMany.mockResolvedValue({ count: 1 });

    await service.logout({
      userId: 7,
      sessionId: 3,
      role: 'USER',
      kind: 'web',
    });
    await service.logoutAll(7);

    expect(prisma.webSession.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 3, userId: 7, revokedAt: null } }),
    );
    expect(prisma.webSession.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { userId: 7, revokedAt: null } }),
    );
  });
});
