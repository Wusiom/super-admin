import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { BullMqService } from './core/bullmq.service';

jest.mock('jsdom', () => ({
  JSDOM: jest.fn(),
}));

describe('AppModule', () => {
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
      expect(prisma.apiToken.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.tool.upsert).toHaveBeenCalledTimes(1);
      expect(bullMq.registerProcessor).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });
});
