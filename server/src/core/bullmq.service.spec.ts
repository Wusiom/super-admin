import { BullMqService } from './bullmq.service';

describe('BullMqService retryJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts direct execution instead of waiting on BullMQ', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123);
    const prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          input: JSON.stringify({ url: 'https://example.test' }),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new BullMqService(prisma as any);
    const add = jest.fn();
    const handler = jest.fn().mockResolvedValue({ itemId: 7 });
    (service as any).queues.set('tool-knowledge-capture-capture', { add });
    (service as any).processors.set('tool-knowledge-capture-capture', {
      handler,
    });

    await service.retryJob('42', 'knowledge-capture');
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.job.update).toHaveBeenNthCalledWith(1, {
      where: { id: 42 },
      data: { status: 'pending', error: null, bullmqJobId: null },
    });
    expect(add).not.toHaveBeenCalled();
    expect(prisma.job.update).toHaveBeenNthCalledWith(2, {
      where: { id: 42 },
      data: { status: 'running', bullmqJobId: 'direct-42-123' },
    });
    expect(handler).toHaveBeenCalledWith({
      id: 'direct-42-123',
      data: { url: 'https://example.test', jobRecordId: 42 },
    });
    expect(prisma.job.update).toHaveBeenNthCalledWith(3, {
      where: { id: 42 },
      data: {
        status: 'success',
        output: JSON.stringify({ itemId: 7 }),
      },
    });
  });

  it('does not reset job state when the retry processor is missing', async () => {
    const prisma = {
      job: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new BullMqService(prisma as any);

    await expect(service.retryJob('42', 'knowledge-capture')).rejects.toThrow(
      'Processor not found: tool-knowledge-capture-capture',
    );

    expect(prisma.job.findUnique).not.toHaveBeenCalled();
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});
