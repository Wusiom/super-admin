jest.mock('../tools/knowledge-capture/capture.processor', () => ({
  captureProcessor: jest.fn(),
}));

import { JobsController } from './jobs.controller';

describe('JobsController getJobs', () => {
  it('returns lightweight knowledge-capture jobs with batched item metadata', async () => {
    const createdAt = new Date('2026-06-16T01:00:00Z');
    const prisma = {
      job: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            toolKey: 'knowledge-capture',
            status: 'success',
            input: JSON.stringify({
              url: 'https://example.com/a',
              pageHtml: '<html>' + 'x'.repeat(5000) + '</html>',
            }),
            output: JSON.stringify({ itemId: 10 }),
            error: null,
            bullmqJobId: 'bull-1',
            createdAt,
            updatedAt: createdAt,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      knowledgeItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            title: 'Article A',
            capturedAt: createdAt,
          },
        ]),
      },
    };
    const controller = new JobsController(prisma as any, {} as any, {} as any);

    const result = await controller.getJobs(
      { userId: 99, role: 'USER', sessionId: 1, kind: 'web' },
      'knowledge-capture',
    );
    const job = result.jobs[0] as any;

    expect(prisma.knowledgeItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: [10] }, userId: 99 },
      select: { id: true, title: true, capturedAt: true },
    });
    expect(job).toEqual(
      expect.objectContaining({
        id: 1,
        toolKey: 'knowledge-capture',
        status: 'success',
        error: null,
        createdAt,
        updatedAt: createdAt,
        diagnostics: expect.objectContaining({
          url: 'https://example.com/a',
          itemId: 10,
          itemTitle: 'Article A',
          capturedAt: '2026-06-16T01:00:00.000Z',
        }),
      }),
    );
    expect(job.input).toBeUndefined();
    expect(job.output).toBeUndefined();
    expect(job.bullmqJobId).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain('xxxxx');
    expect(JSON.stringify(job)).not.toContain('contentMarkdown');
    expect(JSON.stringify(job)).not.toContain('contentHtml');
  });
});
