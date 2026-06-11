import { captureProcessor } from './capture.processor';

jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: {
      document: {
        title: html.includes('401 - Unauthorized') ? '401 - Unauthorized · 语雀' : 'Real Yuque Doc',
        body: {
          textContent: html,
        },
      },
    },
  })),
}));

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation((document: any) => ({
    parse: jest.fn(() => ({
      title: document.title,
      content: document.body.textContent,
    })),
  })),
}));

jest.mock('turndown', () =>
  jest.fn().mockImplementation(() => ({
    turndown: jest.fn((html: string) => html),
  })),
);

var mockCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    knowledgeItem: {
      create: (...args: any[]) => mockCreate(...args),
    },
  })),
}));

describe('captureProcessor snapshot capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 42 });
  });

  it('parses pageHtml snapshots directly without launching a browser', async () => {
    const result = await captureProcessor({
      data: {
        url: 'https://www.yuque.com/example/doc',
        jobRecordId: 7,
        pageHtml: `
          <html>
            <head><title>Real Yuque Doc</title></head>
            <body>
              <article>
                <h1>Real Yuque Doc</h1>
                <p>This is a complete paragraph from the rendered browser page.</p>
                <p>This second paragraph proves the snapshot is parsed as content.</p>
                <p>This third paragraph keeps the content above the extractor threshold.</p>
              </article>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Real Yuque Doc',
        url: 'https://www.yuque.com/example/doc',
        status: 'published',
        jobId: 7,
      }),
    });
    expect(result).toEqual({ itemId: 42 });
  });

  it('rejects Yuque 401 slider snapshots instead of saving them', async () => {
    await expect(
      captureProcessor({
        data: {
          url: 'https://www.yuque.com/example/private-doc',
          jobRecordId: 8,
          pageHtml: `
            <html>
              <head><title>401 - Unauthorized · 语雀</title></head>
              <body>
                <main>
                  <p>+86 请按住滑块，拖动到最右边</p>
                  <p>我已阅读并同意语雀服务协议和隐私权政策</p>
                </main>
              </body>
            </html>
          `,
        },
      } as any),
    ).rejects.toMatchObject({
      message: 'Captured page is a login or verification page',
      jobErrorType: 'BLOCKED',
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects locked subscription content with LOCKED_CONTENT error type', async () => {
    await expect(
      captureProcessor({
        data: {
          url: 'https://xiaobot.net/post/locked-article',
          jobRecordId: 10,
          pageHtml: `
            <html>
              <head><title>付费专栏文章</title></head>
              <body>
                <article>
                  <h1>开头预览</h1>
                  <p>这是免费预览部分。</p>
                  <p>订阅并查看全文</p>
                </article>
              </body>
            </html>
          `,
        },
      } as any),
    ).rejects.toMatchObject({
      message: 'Page requires authentication or subscription to view full content',
      jobErrorType: 'LOCKED_CONTENT',
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects empty extracted content with EMPTY_CONTENT error type', async () => {
    const { Readability } = require('@mozilla/readability');
    (Readability as jest.Mock).mockImplementationOnce(() => ({
      parse: jest.fn(() => ({ title: 'Empty', content: 'short' })),
    }));

    await expect(
      captureProcessor({
        data: {
          url: 'https://example.com/empty',
          jobRecordId: 11,
          pageHtml: '<html><head><title>Empty Page</title></head><body><nav>Just navigation links here</nav></body></html>',
        },
      } as any),
    ).rejects.toMatchObject({
      message: 'Content extraction produced empty or negligible result',
      jobErrorType: 'EMPTY_CONTENT',
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('fails when processor receives a job without a page snapshot', async () => {
    await expect(
      captureProcessor({
        data: {
          url: 'https://www.yuque.com/example/doc',
          jobRecordId: 9,
        },
      } as any),
    ).rejects.toMatchObject({
      message: 'Page snapshot was not received from the extension',
      jobErrorType: 'NO_SNAPSHOT',
    });
  });
});
