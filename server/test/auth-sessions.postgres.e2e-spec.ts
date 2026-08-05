import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { argon2id, hash as hashPassword } from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import request from 'supertest';
import { AccountsService } from '../src/auth/accounts/accounts.service';
import { PasswordResetService } from '../src/auth/password/password-reset.service';
import { JwtAuthGuard } from '../src/auth/sessions/jwt-auth.guard';
import { SessionController } from '../src/auth/sessions/session.controller';
import { SessionService } from '../src/auth/sessions/session.service';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://unconfigured';
const enabled =
  process.env.AUTH_SESSION_PG_E2E === '1' && !!process.env.DATABASE_URL;
const suiteSchema = `auth_session_e2e_${randomUUID().replaceAll('-', '')}`;
const describePostgres = enabled ? describe : describe.skip;

describePostgres('rotating web sessions against PostgreSQL', () => {
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set('schema', suiteSchema);
  const cleanupUrl = new URL(databaseUrl);
  cleanupUrl.searchParams.set('schema', 'public');
  const prisma = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
  const cleanup = new PrismaClient({ datasourceUrl: cleanupUrl.toString() });
  const config = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('test-jwt-access-secret-at-least-32-characters'),
  } as unknown as ConfigService;
  let sessions: SessionService;
  let resets: PasswordResetService;
  let userId: number;

  beforeAll(async () => {
    const serverRoot = resolve(__dirname, '..');
    execFileSync(
      process.execPath,
      [
        resolve(serverRoot, '../node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        'prisma/schema.prisma',
      ],
      {
        cwd: serverRoot,
        env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        stdio: 'pipe',
        windowsHide: true,
      },
    );
    await prisma.$connect();
    sessions = new SessionService(prisma as never, new JwtService(), config);
    resets = new PasswordResetService(prisma as never);
    const user = await prisma.user.create({
      data: {
        email: 'session@example.test',
        emailNormalized: 'session@example.test',
        passwordHash: await hashPassword('initial-password', {
          type: argon2id,
        }),
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanup.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`,
      );
    } finally {
      await Promise.allSettled([prisma.$disconnect(), cleanup.$disconnect()]);
    }
  }, 30_000);

  it('allows one concurrent refresh and revokes its complete family after reuse', async () => {
    const issued = await sessions.createSession({ id: userId, role: 'USER' });
    const results = await Promise.allSettled([
      sessions.rotate(issued.refreshToken),
      sessions.rotate(issued.refreshToken),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rows = await prisma.webSession.findMany({ where: { userId } });
    expect(rows).not.toHaveLength(0);
    expect(rows.every((row) => row.revokedAt)).toBe(true);
  });

  it('allows one reset redemption, rejects the other, and revokes active sessions', async () => {
    const issued = await sessions.createSession({ id: userId, role: 'USER' });
    const rawToken = randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const results = await Promise.allSettled([
      resets.resetPassword(rawToken, 'reset-password-123'),
      resets.resetPassword(rawToken, 'reset-password-123'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: createHash('sha256').update(rawToken).digest('hex') },
    });
    expect(token?.consumedAt).toBeInstanceOf(Date);
    const session = await prisma.webSession.findUnique({
      where: {
        tokenHash: createHash('sha256')
          .update(issued.refreshToken)
          .digest('hex'),
      },
    });
    expect(session?.revokedAt).toBeInstanceOf(Date);
  });

  it('sets only the HttpOnly refresh cookie and rejects a forged access JWT', async () => {
    const accounts = {
      authenticate: jest.fn().mockResolvedValue({ id: userId, role: 'USER' }),
    };
    const sessionService = {
      createSession: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh-secret',
      }),
      logout: jest.fn(),
      logoutAll: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        JwtService,
        JwtAuthGuard,
        { provide: AccountsService, useValue: accounts },
        { provide: SessionService, useValue: sessionService },
        { provide: PasswordResetService, useValue: resets },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    await app.init();
    try {
      const server = app.getHttpServer();
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: 'session@example.test', password: 'initial-password' })
        .expect(200);
      expect(login.body).toEqual({ accessToken: 'access' });
      expect(JSON.stringify(login.body)).not.toContain('refresh-secret');
      expect(login.headers['set-cookie'][0]).toMatch(
        /super_admin_refresh=refresh-secret; Path=\/api\/auth; HttpOnly; SameSite=Lax/i,
      );
      await request(server)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer forged.jwt.token')
        .expect(401);
    } finally {
      await app.close();
    }
  });
});
