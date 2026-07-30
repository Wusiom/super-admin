import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';
import { BullMqService } from './core/bullmq.service';

jest.mock('jsdom', () => ({
  JSDOM: jest.fn(),
}));

describe('AppModule', () => {
  const originalEnvironment = { ...process.env };
  let AppModule: typeof import('./app.module').AppModule;

  beforeAll(() => {
    Object.assign(process.env, {
      DATABASE_URL: 'file:./test.db',
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-chars',
      TOKEN_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
      OBJECT_STORAGE_BUCKET: 'learning-assistant-test',
      OBJECT_STORAGE_ACCESS_KEY: 'test-access-key',
      OBJECT_STORAGE_SECRET_KEY: 'test-secret-key',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_FROM: 'noreply@example.test',
      APP_PUBLIC_URL: 'http://localhost:5173',
    });

    ({ AppModule } = require('./app.module') as typeof import('./app.module'));
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('使用基础设施替身编译并初始化应用模块', async () => {
    const prisma = {
      apiToken: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      },
      tool: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const bullMq = {
      registerProcessor: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(BullMqService)
      .useValue(bullMq)
      .compile();

    try {
      expect(moduleRef.get(PrismaService)).toBe(prisma);
      expect(moduleRef.get(BullMqService)).toBe(bullMq);

      await moduleRef.init();
      expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
      expect(prisma.apiToken.findFirst).not.toHaveBeenCalled();
      expect(prisma.tool.upsert).toHaveBeenCalledTimes(1);
      expect(bullMq.registerProcessor).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });
});
