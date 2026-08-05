import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Roles } from '../src/auth/rbac/roles.decorator';
import { RolesGuard } from '../src/auth/rbac/roles.guard';
import { JwtAuthGuard } from '../src/auth/sessions/jwt-auth.guard';

const secret = 'test-jwt-access-secret-at-least-32-characters';

@Controller('api')
class ProtectedProbeController {
  @Get('protected-probe')
  protectedProbe() {
    return { ok: true };
  }

  @Get('admin/probe')
  @Roles('ADMIN')
  adminProbe() {
    return { ok: true };
  }
}

describe('web authentication and RBAC HTTP contract', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 for an unauthenticated protected web API request', async () => {
    await request(app.getHttpServer()).get('/api/protected-probe').expect(401);
  });

  it('returns 403 when a USER requests an admin route', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/probe')
      .set('Authorization', `Bearer ${tokenFor('USER')}`)
      .expect(403);
  });

  it('allows an ADMIN through the same role-protected route', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/probe')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .expect(200, { ok: true });
  });
});

async function createApp() {
  const module = await Test.createTestingModule({
    controllers: [ProtectedProbeController],
    providers: [
      JwtService,
      Reflector,
      JwtAuthGuard,
      RolesGuard,
      {
        provide: ConfigService,
        useValue: { getOrThrow: () => secret },
      },
      { provide: APP_GUARD, useExisting: JwtAuthGuard },
      { provide: APP_GUARD, useExisting: RolesGuard },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

function tokenFor(role: 'USER' | 'ADMIN') {
  return new JwtService().sign(
    { userId: 1, role, sessionId: 1, kind: 'web' },
    { secret },
  );
}
