import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { argon2id, hash as hashPassword } from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import request from 'supertest';
import { AccountsService } from '../src/auth/accounts/accounts.service';
import { PasswordResetService } from '../src/auth/password/password-reset.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/sessions/jwt-auth.guard';
import { SessionController } from '../src/auth/sessions/session.controller';
import { SessionService } from '../src/auth/sessions/session.service';

const databaseUrl = process.env.DATABASE_URL;
const suiteSchema = `auth_session_e2e_${randomUUID().replaceAll('-', '')}`;
const MIGRATE_DEPLOY_TIMEOUT_MS = 25_000;

if (!databaseUrl) {
  throw new Error(
    'auth-sessions E2E requires DATABASE_URL for real PostgreSQL',
  );
}
if (!/^[a-z0-9_]+$/.test(suiteSchema)) {
  throw new Error(`Unsafe E2E schema name: ${suiteSchema}`);
}

describe('rotating web sessions against PostgreSQL', () => {
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
  let app: INestApplication;
  let sessions: SessionService;
  let userId: number;
  let otherUserId: number;

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
        timeout: MIGRATE_DEPLOY_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    await prisma.$connect();
    const [user, otherUser] = await Promise.all([
      createUser(prisma, 'session'),
      createUser(prisma, 'other'),
    ]);
    userId = user.id;
    otherUserId = otherUser.id;
    const accounts = {
      authenticate: jest.fn().mockResolvedValue({ id: userId, role: 'USER' }),
    };
    const module = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        JwtService,
        JwtAuthGuard,
        SessionService,
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AccountsService, useValue: accounts },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    sessions = module.get(SessionService);
  }, 30_000);

  afterAll(async () => {
    try {
      await app?.close();
      await cleanup.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`,
      );
    } finally {
      await Promise.allSettled([prisma.$disconnect(), cleanup.$disconnect()]);
    }
  }, 30_000);

  it('rotates one shared refresh cookie once and persists family revocation', async () => {
    const login = await loginThroughHttp(app);
    const cookie = refreshCookie(login);
    const originalHash = createHash('sha256')
      .update(cookie.value)
      .digest('hex');
    const original = await prisma.webSession.findUnique({
      where: { tokenHash: originalHash },
    });
    expect(original).not.toBeNull();

    const results = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie.raw),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie.raw),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    const family = await prisma.webSession.findMany({
      where: { userId, familyId: original!.familyId },
    });
    expect(family).not.toHaveLength(0);
    expect(family.every((session) => session.revokedAt instanceof Date)).toBe(
      true,
    );
  });

  it('does not expose refresh token and uses the required cookie attributes', async () => {
    const response = await loginThroughHttp(app);

    expect(response.body).toEqual({ accessToken: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('super_admin_refresh');
    expect(refreshCookie(response).attributes).toMatch(
      /Path=\/api\/auth; HttpOnly; SameSite=Lax/i,
    );
  });

  it('clears cookies on logout and only revokes the JWT principal on logout-all', async () => {
    const login = await loginThroughHttp(app);
    const logoutTokenHash = createHash('sha256')
      .update(refreshCookie(login).value)
      .digest('hex');
    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);
    expect(logout.headers['set-cookie'][0]).toMatch(
      /super_admin_refresh=; Path=\/api\/auth/i,
    );
    const loggedOutSession = await prisma.webSession.findUnique({
      where: { tokenHash: logoutTokenHash },
    });
    expect(loggedOutSession?.revokedAt).toBeInstanceOf(Date);

    const own = await loginThroughHttp(app);
    const additionalOwnSession = await sessions.createSession({
      id: userId,
      role: 'USER',
    });
    const otherSession = await sessions.createSession({
      id: otherUserId,
      role: 'USER',
    });
    const logoutAll = await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${own.body.accessToken}`)
      .send({ userId: otherUserId })
      .expect(204);
    expect(logoutAll.headers['set-cookie'][0]).toMatch(
      /super_admin_refresh=; Path=\/api\/auth/i,
    );
    const ownSessions = await prisma.webSession.findMany({
      where: {
        tokenHash: {
          in: [refreshCookie(own).value, additionalOwnSession.refreshToken].map(
            (token) => createHash('sha256').update(token).digest('hex'),
          ),
        },
      },
    });
    expect(ownSessions).toHaveLength(2);
    expect(
      ownSessions.every((session) => session.revokedAt instanceof Date),
    ).toBe(true);
    const other = await prisma.webSession.findUnique({
      where: {
        tokenHash: createHash('sha256')
          .update(otherSession.refreshToken)
          .digest('hex'),
      },
    });
    expect(other?.revokedAt).toBeNull();
  });

  it('rejects forged JWTs and allows only one HTTP reset redemption', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer forged.jwt.token')
      .expect(401);

    const first = await loginThroughHttp(app);
    const second = await loginThroughHttp(app);
    const rawToken = randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const results = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'reset-password-123' }),
      request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'reset-password-123' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([204, 401]);
    const sessionsAfterReset = await prisma.webSession.findMany({
      where: {
        tokenHash: {
          in: [first, second].map((response) =>
            createHash('sha256')
              .update(refreshCookie(response).value)
              .digest('hex'),
          ),
        },
      },
    });
    expect(sessionsAfterReset).toHaveLength(2);
    expect(
      sessionsAfterReset.every((session) => session.revokedAt instanceof Date),
    ).toBe(true);
  });
});

async function createUser(prisma: PrismaClient, prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  return prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: await hashPassword('initial-password', { type: argon2id }),
      emailVerifiedAt: new Date(),
    },
  });
}

async function loginThroughHttp(app: INestApplication) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'session@example.test', password: 'initial-password' })
    .expect(200);
}

function refreshCookie(response: request.Response) {
  const attributes = response.headers['set-cookie'][0] as string;
  const [nameValue] = attributes.split(';');
  const value = nameValue.split('=').slice(1).join('=');
  return { raw: nameValue, value, attributes };
}
