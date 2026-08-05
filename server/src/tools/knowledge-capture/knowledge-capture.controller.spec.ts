import { KnowledgeCaptureController } from './knowledge-capture.controller';

const captureRequest = {
  headers: { authorization: 'Bearer test-token' },
  apiTokenPrincipal: { userId: 99, scopes: ['capture:create'] },
};
const webPrincipal = {
  userId: 99,
  role: 'USER' as const,
  sessionId: 1,
  kind: 'web' as const,
};

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

describe('KnowledgeCaptureController capture', () => {
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
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    const result = await controller.capture(
      {
        url: 'https://example.com/article',
        cookies: '[]',
        localStorage: '{}',
        pageHtml:
          '<html><body><article>Snapshot article body</article></body></html>',
        pageHtmlMeta: '{"source":"extension"}',
      },
      captureRequest,
    );

    expect(result).toEqual({ jobId: 11 });
    const input = JSON.parse(createdJobs[0].input);
    expect(input.pageHtml).toBe(
      '<html><body><article>Snapshot article body</article></body></html>',
    );
    expect(input.pageHtmlMeta).toEqual({ source: 'extension' });
    expect(input.url).toBe('https://example.com/article');
    expect(createdJobs[0].userId).toBe(99);
  });

  it('creates a failed diagnostic job when no snapshot is provided', async () => {
    const prisma = {
      job: {
        create: jest.fn().mockResolvedValue({ id: 12 }),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    const result = await controller.capture(
      {
        url: 'https://example.com/article',
        cookies: '[]',
        localStorage: '{}',
      },
      captureRequest,
    );

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
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    await controller.capture(
      {
        url: 'https://example.com/article',
        cookies: '[{"name":"session","value":"abc123"}]',
        localStorage: '{"auth":"token-xyz","theme":"dark"}',
        pageHtml:
          '<html><body><article>Test content with sufficient length to pass extraction check</article></body></html>',
      },
      captureRequest,
    );

    const input = JSON.parse(createdJobs[0].input);
    expect(input.cookies).toEqual([{ name: 'session', value: 'abc123' }]);
    expect(input.localStorage).toEqual({ auth: 'token-xyz', theme: 'dark' });
  });

  it('returns error for invalid cookies JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    const result = await controller.capture(
      {
        url: 'https://example.com/article',
        cookies: 'not-json',
        pageHtml: '<html>test</html>',
      },
      captureRequest,
    );

    expect(result).toEqual({ error: 'cookies 格式错误，需要合法的 JSON 数组' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('returns error for invalid localStorage JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    const result = await controller.capture(
      {
        url: 'https://example.com/article',
        localStorage: '{broken',
        pageHtml: '<html>test</html>',
      },
      captureRequest,
    );

    expect(result).toEqual({
      error: 'localStorage 格式错误，需要合法的 JSON 对象',
    });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('returns error for invalid pageHtmlMeta JSON', async () => {
    const prisma = {
      job: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const controller = new KnowledgeCaptureController(
      prisma as any,
      {} as any,
      mockJobEvents(),
    );

    const result = await controller.capture(
      {
        url: 'https://example.com/article',
        pageHtmlMeta: 'not-json',
        pageHtml: '<html>test</html>',
      },
      captureRequest,
    );

    expect(result).toEqual({
      error: 'pageHtmlMeta 格式错误，需要合法的 JSON 对象',
    });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});

describe('KnowledgeCaptureController updateItem', () => {
  let controller: KnowledgeCaptureController;
  let prisma: any;
  let jobEvents: any;
  let ownedResources: any;

  beforeEach(() => {
    jobEvents = mockJobEvents();
    ownedResources = { getKnowledgeItemOrThrow: jest.fn() };
    prisma = {
      $transaction: jest.fn(async (callback) => callback(prisma)),
      knowledgeItem: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      job: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    controller = new KnowledgeCaptureController(
      prisma,
      {} as any,
      jobEvents,
      ownedResources,
    );
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
    prisma.knowledgeItem.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    ownedResources.getKnowledgeItemOrThrow
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);

    const result = await controller.updateItem(
      '1',
      {
        contentMarkdown: '# New content',
      },
      webPrincipal,
    );

    expect(result).toEqual(updated);
    expect(result.contentMarkdown).toBe('# New content');
    expect(prisma.knowledgeItem.updateMany).toHaveBeenCalledWith({
      where: { id: 1, userId: 99 },
      data: { contentMarkdown: '# New content' },
    });
  });

  it('returns 404 when item not found', async () => {
    ownedResources.getKnowledgeItemOrThrow.mockRejectedValue(
      new Error('Knowledge item not found'),
    );

    await expect(
      controller.updateItem('999', { contentMarkdown: '# Test' }, webPrincipal),
    ).rejects.toThrow('Knowledge item not found');
  });

  it('deletes the knowledge item and its capture job together, then broadcasts deletion and metrics', async () => {
    ownedResources.getKnowledgeItemOrThrow.mockResolvedValue({
      id: 1,
      title: 'Test',
      jobId: 77,
    });

    await controller.deleteItem('1', webPrincipal);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.knowledgeItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 1, userId: 99 },
    });
    expect(prisma.job.deleteMany).toHaveBeenCalledWith({
      where: { id: 77, userId: 99 },
    });
    expect(jobEvents.emitJobDeleted).toHaveBeenCalledWith(77);
    expect(jobEvents.emitMetricsSnapshot).toHaveBeenCalledWith(
      'knowledge-capture',
    );
  });

  it('deletes the knowledge item even when no capture job is linked', async () => {
    ownedResources.getKnowledgeItemOrThrow.mockResolvedValue({
      id: 2,
      title: 'Manual',
      jobId: null,
    });

    await controller.deleteItem('2', webPrincipal);

    expect(prisma.knowledgeItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 2, userId: 99 },
    });
    expect(prisma.job.deleteMany).not.toHaveBeenCalled();
    expect(jobEvents.emitJobDeleted).not.toHaveBeenCalled();
    expect(jobEvents.emitMetricsSnapshot).toHaveBeenCalledWith(
      'knowledge-capture',
    );
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

    const result = await controller.listItems(webPrincipal, '1', '20');

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
