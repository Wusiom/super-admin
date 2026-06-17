import { BullMqService } from './bullmq.service';

describe('BullMqService retryJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resets the job and re-enqueues it on the capture queue', async () => {
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

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'pending', error: null, bullmqJobId: null },
    });
    expect(add).toHaveBeenCalledWith('capture', {
      url: 'https://example.test',
      jobRecordId: 42,
    });
  });

  it('resets the job before surfacing a missing retry queue', async () => {
    const prisma = {
      job: {
        update: jest.fn().mockResolvedValue({
          id: 42,
          input: JSON.stringify({ url: 'https://example.test' }),
        }),
      },
    };
    const service = new BullMqService(prisma as any);

    await expect(service.retryJob('42', 'knowledge-capture')).rejects.toThrow(
      'Queue not found: tool-knowledge-capture-capture',
    );

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'pending', error: null, bullmqJobId: null },
    });
  });

  it('re-enqueues an empty payload when the existing job input is empty', async () => {
    const prisma = {
      job: {
        update: jest.fn().mockResolvedValue({
          id: 43,
          input: null,
        }),
      },
    };
    const service = new BullMqService(prisma as any);
    const add = jest.fn().mockResolvedValue({ id: 'bull-3' });
    (service as any).queues.set('tool-knowledge-capture-capture', { add });

    await service.retryJob('43', 'knowledge-capture');

    expect(add).toHaveBeenCalledWith('capture', { jobRecordId: 43 });
  });
});
