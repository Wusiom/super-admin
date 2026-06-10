import { KnowledgeCaptureController } from './knowledge-capture.controller';

jest.mock('./capture.processor', () => ({
  captureProcessor: jest.fn().mockResolvedValue({ itemId: 1 }),
}));

function mockJobEvents() {
  return { emitEnrichedJob: jest.fn().mockResolvedValue(undefined) } as any;
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
});

describe('KnowledgeCaptureController updateItem', () => {
  let controller: KnowledgeCaptureController;
  let prisma: any;

  beforeEach(() => {
    prisma = {
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
      },
    };
    controller = new KnowledgeCaptureController(prisma, {} as any, mockJobEvents());
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
});
