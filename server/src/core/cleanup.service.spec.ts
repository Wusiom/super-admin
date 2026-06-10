import { CleanupService } from './cleanup.service';

describe('CleanupService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks stale pending jobs by last update time, not original creation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:15:00.000Z'));
    const prisma = {
      job: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const jobEvents = { emitEnrichedJob: jest.fn() } as any;
    const service = new CleanupService(prisma as any, jobEvents);

    await service.cleanupStaleJobs();

    // 应查询过期的 pending 任务
    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: {
        status: 'pending',
        createdAt: { lt: new Date('2026-01-01T00:05:00.000Z') },
      },
      select: { id: true },
    });

    // 应查询卡住的 running 任务
    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: {
        status: 'running',
        updatedAt: { lt: new Date('2026-01-01T00:10:00.000Z') },
      },
      select: { id: true },
    });
  });

  it('emits SSE events for each stale job marked as failed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:15:00.000Z'));
    const prisma = {
      job: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 1 }, { id: 3 }]) // stale pending
          .mockResolvedValueOnce([{ id: 5 }]), // stalled running
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const jobEvents = { emitEnrichedJob: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new CleanupService(prisma as any, jobEvents);

    await service.cleanupStaleJobs();

    expect(jobEvents.emitEnrichedJob).toHaveBeenCalledTimes(3);
    expect(jobEvents.emitEnrichedJob).toHaveBeenCalledWith(1);
    expect(jobEvents.emitEnrichedJob).toHaveBeenCalledWith(3);
    expect(jobEvents.emitEnrichedJob).toHaveBeenCalledWith(5);
  });
});
