import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
    const payload = await new JwtService().verifyAsync<{
      exp: number;
      iat: number;
    }>(result.accessToken, { secret: accessSecret });
    expect(payload.exp - payload.iat).toBe(15 * 60);
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

  it('persists family revocation after a rotated refresh token is reused', async () => {
    const sessions = [
      session({ id: 3, token: 'old', familyId: 'family-a', rotatedAt: now }),
      session({ id: 4, token: 'active', familyId: 'family-a' }),
    ];
    const statefulPrisma = createSessionPrisma(sessions);
    const statefulService = new SessionService(
      statefulPrisma as any,
      new JwtService(),
      {
        getOrThrow: jest.fn().mockReturnValue(accessSecret),
      } as any,
    );

    await expect(statefulService.rotate('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(sessions.every((entry) => entry.revokedAt instanceof Date)).toBe(
      true,
    );
  });

  it('lets only one concurrent refresh succeed and persists family revocation', async () => {
    const sessions = [session({ id: 3, token: 'old', familyId: 'family-a' })];
    const statefulPrisma = createSessionPrisma(sessions);
    const statefulService = new SessionService(
      statefulPrisma as any,
      new JwtService(),
      {
        getOrThrow: jest.fn().mockReturnValue(accessSecret),
      } as any,
    );

    const results = await Promise.allSettled([
      statefulService.rotate('old'),
      statefulService.rotate('old'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(sessions.every((entry) => entry.revokedAt instanceof Date)).toBe(
      true,
    );
  });

  it('revokes the family when conditional rotation detects a concurrent consume', async () => {
    prisma.webSession.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      familyId: 'family-a',
      expiresAt: new Date(Date.now() + 60_000),
      rotatedAt: null,
      revokedAt: null,
      user: { id: 7, role: 'USER', status: 'ACTIVE' },
    });
    prisma.webSession.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(service.rotate('old-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.webSession.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 7, familyId: 'family-a', revokedAt: null },
      }),
    );
  });

  it('retries one serializable conflict before rotating a refresh token', async () => {
    const oldHash = createHash('sha256').update('old-refresh').digest('hex');
    prisma.webSession.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      tokenHash: oldHash,
      familyId: 'family-a',
      expiresAt: new Date(Date.now() + 60_000),
      rotatedAt: null,
      revokedAt: null,
      user: { id: 7, role: 'USER', status: 'ACTIVE' },
    });
    prisma.webSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.webSession.create.mockResolvedValue({ id: 4, familyId: 'family-a' });
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementation(async (work: any) => work(prisma));

    await expect(service.rotate('old-refresh')).resolves.toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects deterministically after three serializable conflicts', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(service.rotate('anything')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
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

type StoredSession = {
  id: number;
  userId: number;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  user: { id: number; role: 'USER'; status: 'ACTIVE' };
};

function session(
  input: Partial<StoredSession> & {
    id: number;
    token: string;
    familyId: string;
  },
): StoredSession {
  return {
    id: input.id,
    userId: 7,
    tokenHash: createHash('sha256').update(input.token).digest('hex'),
    familyId: input.familyId,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
    rotatedAt: input.rotatedAt ?? null,
    revokedAt: input.revokedAt ?? null,
    user: input.user ?? { id: 7, role: 'USER', status: 'ACTIVE' },
  };
}

function createSessionPrisma(sessions: StoredSession[]) {
  let previous = Promise.resolve();
  const tx = () => ({
    webSession: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          sessions.find((item) => item.tokenHash === where.tokenHash) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matches = sessions.filter(
          (item) =>
            (where.id === undefined || item.id === where.id) &&
            (where.userId === undefined || item.userId === where.userId) &&
            (where.familyId === undefined ||
              item.familyId === where.familyId) &&
            (where.revokedAt === undefined ||
              item.revokedAt === where.revokedAt) &&
            (where.rotatedAt === undefined ||
              item.rotatedAt === where.rotatedAt) &&
            (!where.expiresAt?.gt || item.expiresAt > where.expiresAt.gt),
        );
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        const entry = {
          ...data,
          id: Math.max(...sessions.map((item) => item.id), 0) + 1,
          rotatedAt: null,
          revokedAt: null,
          user: {
            id: data.userId,
            role: 'USER' as const,
            status: 'ACTIVE' as const,
          },
        };
        sessions.push(entry);
        return entry;
      }),
    },
  });
  return {
    $transaction: async (work: any) => {
      const waitFor = previous;
      let release: () => void = () => undefined;
      previous = new Promise<void>((resolve) => {
        release = resolve;
      });
      await waitFor;
      const snapshot = sessions.map((item) => ({ ...item }));
      try {
        return await work(tx());
      } catch (error) {
        sessions.splice(0, sessions.length, ...snapshot);
        throw error;
      } finally {
        release();
      }
    },
    webSession: tx().webSession,
  };
}
