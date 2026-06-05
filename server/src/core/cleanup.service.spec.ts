import { CleanupService } from './cleanup.service';

describe('CleanupService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks stale pending jobs by last update time, not original creation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:15:00.000Z'));
    const prisma = {
      job: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new CleanupService(prisma as any);

    await service.cleanupStaleJobs();

    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'pending',
        updatedAt: { lt: new Date('2026-01-01T00:05:00.000Z') },
      },
      data: {
        status: 'failed',
        error: 'BullMQ enqueue failed: Redis unavailable or job expired',
      },
    });
  });
});
