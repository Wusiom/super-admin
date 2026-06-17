import { KnowledgeCaptureController } from './knowledge-capture.controller';
import { captureProcessor } from './capture.processor';

jest.mock('./capture.processor', () => ({
  captureProcessor: jest.fn().mockResolvedValue({ itemId: 1 }),
}));

function mockJobEvents() {
  return {
    emitEnrichedJob: jest.fn().mockResolvedValue(undefined),
    emitJobDeleted: jest.fn(),
    emitMetricsSnapshot: jest.fn().mockResolvedValue(undefined),
  } as any;
}

async function waitForJobUpdate(prisma: any) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (prisma.job.update.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('KnowledgeCaptureController capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores pageHtml and pageHtmlMeta in the job input', async () => {
    const createdJobs: any[] = [];
    const prisma = {
      job: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdJobs.push(data);
          return { id: 11, ...data };
        }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://example.com/article',
      cookies: '[]',
      localStorage: '{}',
      pageHtml: '<html><body><article>Snapshot article body</article></body></html>',
      pageHtmlMeta: '{"source":"extension"}',
    });

    expect(result).toEqual({ jobId: 11 });
    const input = JSON.parse(createdJobs[0].input);
    expect(input.pageHtml).toBe(
      '<html><body><article>Snapshot article body</article></body></html>',
    );
    expect(input.pageHtmlMeta).toEqual({ source: 'extension' });
    expect(input.url).toBe('https://example.com/article');
  });

  it('stores pageAppData in the job input for Yuque captures', async () => {
    const createdJobs: any[] = [];
    const prisma = {
      job: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdJobs.push(data);
          return { id: 14, ...data };
        }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://www.yuque.com/team/api-capture',
      cookies: '[{"name":"_yuque_session","value":"abc"}]',
      localStorage: '{}',
      pageHtml: '<html><body><main>Yuque rendered snapshot with enough text for diagnostics</main></body></html>',
      pageAppData: '{"bookId":3001,"articleSlug":"api-capture","host":"www.yuque.com"}',
    } as any);

    expect(result).toEqual({ jobId: 14 });
    const input = JSON.parse(createdJobs[0].input);
    expect(input.pageAppData).toEqual({
      bookId: 3001,
      articleSlug: 'api-capture',
      host: 'www.yuque.com',
    });
    expect(input.pageHtml).toContain('Yuque rendered snapshot');
  });

  it('starts Yuque API capture when pageHtml is omitted but metadata and cookies are present', async () => {
    const createdJobs: any[] = [];
    const prisma = {
      job: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdJobs.push(data);
          return { id: 16, ...data };
        }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://www.yuque.com/team/api-capture',
      cookies: '[{"name":"_yuque_session","value":"abc"}]',
      localStorage: '{}',
      pageAppData: '{"bookId":3001,"articleSlug":"api-capture","host":"www.yuque.com"}',
    } as any);

    expect(result).toEqual({ jobId: 16 });
    expect(createdJobs[0]).toEqual(
      expect.objectContaining({
        toolKey: 'knowledge-capture',
        status: 'running',
      }),
    );
    const input = JSON.parse(createdJobs[0].input);
    expect(input).toEqual(
      expect.objectContaining({
        url: 'https://www.yuque.com/team/api-capture',
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: {
          bookId: 3001,
          articleSlug: 'api-capture',
          host: 'www.yuque.com',
        },
      }),
    );
    expect(input.pageHtml).toBeUndefined();
    expect(captureProcessor).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobRecordId: 16,
          pageAppData: {
            bookId: 3001,
            articleSlug: 'api-capture',
            host: 'www.yuque.com',
          },
        }),
      }),
    );
    expect((captureProcessor as jest.Mock).mock.calls[0][0].data).not.toHaveProperty(
      'pageHtml',
    );
  });

  it('persists processor jobErrorType in failed direct capture diagnostics', async () => {
    const mockedCaptureProcessor = captureProcessor as jest.MockedFunction<typeof captureProcessor>;
    mockedCaptureProcessor.mockRejectedValueOnce(
      Object.assign(new Error('Yuque document API requires authentication'), {
        jobErrorType: 'LOCKED_CONTENT',
      }),
    );
    const prisma = {
      job: {
        create: jest.fn().mockResolvedValue({ id: 15 }),
        update: jest.fn().mockResolvedValue({ id: 15 }),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://www.yuque.com/team/private-doc',
      pageHtml: '<html><body><main>Yuque private snapshot with enough text for processor dispatch</main></body></html>',
      pageAppData: '{"bookId":3001,"articleSlug":"private-doc","host":"www.yuque.com"}',
    } as any);

    expect(result).toEqual({ jobId: 15 });
    await waitForJobUpdate(prisma);

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 15 },
      data: {
        status: 'failed',
        error: expect.stringContaining('LOCKED_CONTENT'),
      },
    });
    expect(prisma.job.update.mock.calls[0][0].data.error).toContain(
      'Yuque document API requires authentication',
    );
  });

  it('creates a failed diagnostic job when no snapshot is provided', async () => {
    const prisma = {
      job: {
        create: jest.fn().mockResolvedValue({ id: 12 }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://example.com/article',
      cookies: '[]',
      localStorage: '{}',
    });

    expect(result).toEqual({ jobId: 12 });
    expect(prisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        error: 'Page snapshot was not received from the extension',
      }),
    });
  });

  it('parses cookies and localStorage from extension payload', async () => {
    const createdJobs: any[] = [];
    const prisma = {
      job: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdJobs.push(data);
          return { id: 13, ...data };
        }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    await controller.capture({
      url: 'https://example.com/article',
      cookies: '[{"name":"session","value":"abc123"}]',
      localStorage: '{"auth":"token-xyz","theme":"dark"}',
      pageHtml: '<html><body><article>Test content with sufficient length to pass extraction check</article></body></html>',
    });

    const input = JSON.parse(createdJobs[0].input);
    expect(input.cookies).toEqual([{ name: 'session', value: 'abc123' }]);
    expect(input.localStorage).toEqual({ auth: 'token-xyz', theme: 'dark' });
  });

  it('returns error for invalid cookies JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://example.com/article',
      cookies: 'not-json',
      pageHtml: '<html>test</html>',
    });

    expect(result).toEqual({ error: 'cookies 格式错误，需要合法的 JSON 数组' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('returns error for invalid localStorage JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://example.com/article',
      localStorage: '{broken',
      pageHtml: '<html>test</html>',
    });

    expect(result).toEqual({ error: 'localStorage 格式错误，需要合法的 JSON 对象' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('returns error for invalid pageHtmlMeta JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://example.com/article',
      pageHtmlMeta: 'not-json',
      pageHtml: '<html>test</html>',
    });

    expect(result).toEqual({ error: 'pageHtmlMeta 格式错误，需要合法的 JSON 对象' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('returns error for invalid pageAppData JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

    const result = await controller.capture({
      url: 'https://www.yuque.com/team/api-capture',
      pageHtml: '<html>test</html>',
      pageAppData: 'not-json',
    } as any);

    expect(result).toEqual({ error: 'pageAppData 格式错误，需要合法的 JSON 对象' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});

describe('KnowledgeCaptureController updateItem', () => {
  let controller: KnowledgeCaptureController;
  let prisma: any;
  let jobEvents: any;

  beforeEach(() => {
    jobEvents = mockJobEvents();
    prisma = {
      $transaction: jest.fn(async (callback) => callback(prisma)),
      knowledgeItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      job: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    controller = new KnowledgeCaptureController(prisma, {} as any, jobEvents);
  });

  it('updates contentMarkdown and returns updated item', async () => {
    const existing = {
      id: 1,
      title: 'Test',
      contentMarkdown: '# Old',
      url: 'https://example.com',
      source: 'test',
      capturedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updated = { ...existing, contentMarkdown: '# New content' };
    prisma.knowledgeItem.findUnique.mockResolvedValue(existing);
    prisma.knowledgeItem.update.mockResolvedValue(updated);

    const result = await controller.updateItem('1', { contentMarkdown: '# New content' });

    expect(result).toEqual(updated);
    expect(result.contentMarkdown).toBe('# New content');
    expect(prisma.knowledgeItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { contentMarkdown: '# New content' },
    });
  });

  it('returns 404 when item not found', async () => {
    prisma.knowledgeItem.findUnique.mockResolvedValue(null);

    await expect(
      controller.updateItem('999', { contentMarkdown: '# Test' }),
    ).rejects.toThrow('Knowledge item not found');
  });

  it('deletes the knowledge item and its capture job together, then broadcasts deletion and metrics', async () => {
    prisma.knowledgeItem.findUnique.mockResolvedValue({
      id: 1,
      title: 'Test',
      jobId: 77,
    });

    await controller.deleteItem('1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.knowledgeItem.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(prisma.job.delete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(jobEvents.emitJobDeleted).toHaveBeenCalledWith(77);
    expect(jobEvents.emitMetricsSnapshot).toHaveBeenCalledWith('knowledge-capture');
  });

  it('deletes the knowledge item even when no capture job is linked', async () => {
    prisma.knowledgeItem.findUnique.mockResolvedValue({
      id: 2,
      title: 'Manual',
      jobId: null,
    });

    await controller.deleteItem('2');

    expect(prisma.knowledgeItem.delete).toHaveBeenCalledWith({
      where: { id: 2 },
    });
    expect(prisma.job.delete).not.toHaveBeenCalled();
    expect(jobEvents.emitJobDeleted).not.toHaveBeenCalled();
    expect(jobEvents.emitMetricsSnapshot).toHaveBeenCalledWith('knowledge-capture');
  });

  it('lists items without markdown or html bodies', async () => {
    prisma.knowledgeItem.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Test',
        url: 'https://example.com',
        status: 'published',
      },
    ]);
    prisma.knowledgeItem.count.mockResolvedValue(1);

    const result = await controller.listItems('1', '20');

    expect(prisma.knowledgeItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          contentMarkdown: true,
          contentHtml: true,
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('contentMarkdown');
    expect(JSON.stringify(result)).not.toContain('contentHtml');
  });
});
