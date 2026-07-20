import { BullMqService } from './bullmq.service';

describe('BullMqService retryJob', () => {
  it('通过 capture 队列重置任务并重新入队，不直接执行 processor', async () => {
    const prisma = {
      job: {
        update: jest.fn().mockResolvedValue({
          id: 42,
          input: JSON.stringify({ url: 'https://example.test' }),
        }),
      },
    };
    const service = new BullMqService(prisma as any);
    const add = jest.fn().mockResolvedValue({ id: 'bull-2' });
    (service as any).queues.set('tool-knowledge-capture-capture', { add });

    await service.retryJob('42', 'knowledge-capture');

    expect(prisma.job.update).toHaveBeenCalledTimes(1);
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'pending', error: null, bullmqJobId: null },
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('capture', {
      url: 'https://example.test',
      jobRecordId: 42,
    });
  });

  it('缺少重试队列时不重置任务状态', async () => {
    const prisma = {
      job: {
        update: jest.fn(),
      },
    };
    const service = new BullMqService(prisma as any);

    await expect(service.retryJob('42', 'knowledge-capture')).rejects.toThrow(
      'Queue not found: tool-knowledge-capture-capture',
    );

    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});
