import { captureProcessor } from './capture.processor';

class FakeElement {
  removed = false;
  tagName: string;
  id = '';
  className = '';

  constructor(
    tagName: string,
    private rawHtml: string,
    private innerHtml: string,
    attrs = '',
  ) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.match(/\sid="([^"]*)"/)?.[1] || '';
    this.className = attrs.match(/\sclass="([^"]*)"/)?.[1] || '';
  }

  get outerHTML() {
    return this.removed ? '' : this.rawHtml;
  }

  get textContent() {
    if (this.removed) return '';
    return this.innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  remove() {
    this.removed = true;
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector: string) {
    if (this.removed) return [];
    if (selector === 'p') return findElements(this.innerHtml, ['p']);
    if (selector === 'a') return findElements(this.innerHtml, ['a']);
    if (selector === 'li') return findElements(this.innerHtml, ['li']);
    if (selector === 'h1') return findElements(this.innerHtml, ['h1']);
    if (selector === 'h1,h2,h3,h4,h5,h6') {
      return findElements(this.innerHtml, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    }
    return [];
  }
}

class FakeBody extends FakeElement {
  constructor(private children: FakeElement[]) {
    super('body', '<body></body>', '');
  }

  get outerHTML() {
    return `<body>${this.children.map((child) => child.outerHTML).join('')}</body>`;
  }

  get textContent() {
    return this.children
      .map((child) => child.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  querySelectorAll(selector: string) {
    return this.children.flatMap((child) => {
      const selfMatches =
        (selector === 'main' && child.tagName === 'MAIN') ||
        (selector === 'article' && child.tagName === 'ARTICLE') ||
        (selector === 'aside' && child.tagName === 'ASIDE') ||
        (selector === 'nav' && child.tagName === 'NAV') ||
        (selector === '.doc-reader' && child.className.includes('doc-reader')) ||
        (selector.includes('toc') && child.className.includes('toc'));
      return [
        ...(selfMatches ? [child] : []),
        ...child.querySelectorAll(selector),
      ];
    });
  }
}

class FakeDocument {
  title: string;
  body: FakeBody;

  constructor(html: string) {
    this.title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
    this.body = new FakeBody(
      findElements(html, ['article', 'main', 'aside', 'nav']),
    );
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector: string) {
    return this.body.querySelectorAll(selector);
  }
}

function findElements(html: string, tagNames: string[]) {
  return tagNames.flatMap((tagName) => {
    const pattern = new RegExp(
      `<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
      'gi',
    );
    const elements: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      elements.push(new FakeElement(tagName, match[0], match[2], match[1]));
    }
    return elements;
  });
}

jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: {
      document: new FakeDocument(html),
    },
  })),
}));

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation((document: any) => ({
    parse: jest.fn(() => ({
      title: document.title,
      content: document.body.outerHTML,
      textContent: document.body.textContent,
    })),
  })),
}));

jest.mock('turndown', () =>
  jest.fn().mockImplementation(() => ({
    turndown: jest.fn((html: string) => html),
  })),
);

var mockCreate = jest.fn();
const originalFetch = global.fetch;
var mockFetch = jest.fn();

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
    mockFetch = jest.fn();
    global.fetch = mockFetch as any;
    mockCreate.mockResolvedValue({ id: 42 });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('captures Yuque Markdown from the Yuque document API before HTML fallback', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          title: 'API Title',
          sourcecode: '# API Title\n\n- one\n- two\n\n```ts\nconst ok = true;\n```',
          content: '<h1>API Title</h1><ul><li>one</li><li>two</li></ul>',
        },
      }),
    });

    const result = await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/api-capture',
        jobRecordId: 21,
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: { bookId: 3001, articleSlug: 'api-capture', host: 'www.yuque.com' },
        pageHtml: `
          <html>
            <head><title>Rendered Title</title></head>
            <body>
              <main><h1>Rendered Title</h1><p>This fallback body should not be saved when API succeeds.</p><p>More fallback content.</p><p>Enough fallback content.</p></main>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.yuque.com/api/docs/api-capture?book_id=3001&merge_dynamic_data=false&mode=markdown',
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: '_yuque_session=abc',
        }),
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'API Title',
        url: 'https://www.yuque.com/team/api-capture',
        contentMarkdown: '# API Title\n\n- one\n- two\n\n```ts\nconst ok = true;\n```',
        contentHtml: '<h1>API Title</h1><ul><li>one</li><li>two</li></ul>',
        source: 'yuque',
        status: 'published',
        jobId: 21,
      }),
    });
    expect(result).toEqual({ itemId: 42 });
  });

  it('captures Yuque Markdown from the Yuque document API when pageHtml is omitted', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          title: 'Metadata Only API Title',
          sourcecode: '# Metadata Only API Title\n\nCapture succeeds from Yuque API.',
          content: '<h1>Metadata Only API Title</h1><p>Capture succeeds from Yuque API.</p>',
        },
      }),
    });

    const result = await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/metadata-only',
        jobRecordId: 28,
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: { bookId: 3001, articleSlug: 'metadata-only', host: 'www.yuque.com' },
      },
    } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.yuque.com/api/docs/metadata-only?book_id=3001&merge_dynamic_data=false&mode=markdown',
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: '_yuque_session=abc',
        }),
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Metadata Only API Title',
        url: 'https://www.yuque.com/team/metadata-only',
        contentMarkdown: '# Metadata Only API Title\n\nCapture succeeds from Yuque API.',
        source: 'yuque',
        status: 'published',
        jobId: 28,
      }),
    });
    expect(result).toEqual({ itemId: 42 });
  });

  it('uses the submitted Yuque URL slug when pageAppData still has the previous SPA document slug', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          title: 'Current URL API Title',
          sourcecode: '# Current URL API Title\n\nThis is the current document.',
          content: '<h1>Current URL API Title</h1><p>This is the current document.</p>',
        },
      }),
    });

    await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/book/current-doc',
        jobRecordId: 29,
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: {
          bookId: 3001,
          articleSlug: 'previous-doc',
          host: 'www.yuque.com',
        },
        pageHtml: `
          <html>
            <head><title>Current URL API Title</title></head>
            <body>
              <main><h1>Current URL API Title</h1><p>Fallback content for current document.</p><p>More current content.</p><p>Enough current content.</p></main>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.yuque.com/api/docs/current-doc?book_id=3001&merge_dynamic_data=false&mode=markdown',
      expect.any(Object),
    );
    expect(mockFetch.mock.calls[0][0]).not.toContain('previous-doc');
  });

  it('falls back to the HTML pipeline for Yuque URLs without pageAppData', async () => {
    const result = await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/missing-metadata',
        jobRecordId: 22,
        pageHtml: `
          <html>
            <head><title>Fallback Title</title></head>
            <body>
              <main class="doc-reader">
                <h1>Fallback Title</h1>
                <p>This paragraph is rendered from the snapshot because metadata is missing.</p>
                <p>Another complete paragraph keeps fallback extraction valid.</p>
                <p>The third paragraph keeps the body above the extractor threshold.</p>
              </main>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Fallback Title',
        jobId: 22,
      }),
    });
    expect(mockCreate.mock.calls[0][0].data.source).toBeUndefined();
    expect(result).toEqual({ itemId: 42 });
  });

  it('falls back to the HTML pipeline when pageAppData host does not match the Yuque page host', async () => {
    const result = await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/host-mismatch',
        jobRecordId: 26,
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: {
          bookId: 3001,
          articleSlug: 'host-mismatch',
          host: '169.254.169.254#.yuque.com',
        },
        pageHtml: `
          <html>
            <head><title>Safe Fallback Title</title></head>
            <body>
              <article>
                <h1>Safe Fallback Title</h1>
                <p>A malicious appData host should never be used for the API request.</p>
                <p>The rendered snapshot is still available as the recoverable fallback.</p>
                <p>This paragraph keeps the fallback content above the extractor threshold.</p>
              </article>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Safe Fallback Title',
        jobId: 26,
      }),
    });
    expect(result).toEqual({ itemId: 42 });
  });

  it('preserves browser cookie values when building the Yuque API cookie header', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          title: 'Cookie Title',
          sourcecode: '# Cookie Title\n\nCookie capture keeps auth bytes unchanged.',
          content: '<h1>Cookie Title</h1><p>Cookie capture keeps auth bytes unchanged.</p>',
        },
      }),
    });

    await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/cookie-doc',
        jobRecordId: 27,
        cookies: [{ name: '_yuque_session', value: 'abc%2Fdef==' }],
        pageAppData: { bookId: 3001, articleSlug: 'cookie-doc', host: 'www.yuque.com' },
        pageHtml: `
          <html>
            <head><title>Rendered Cookie Title</title></head>
            <body>
              <main><h1>Rendered Cookie Title</h1><p>Fallback body should not be used.</p><p>More text.</p><p>Enough text.</p></main>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: '_yuque_session=abc%2Fdef==',
        }),
      }),
    );
  });

  it('falls back to the HTML pipeline when Yuque API returns unusable Markdown', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: { title: 'API Empty', sourcecode: '   ', content: '' } }),
    });

    await captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/api-empty',
        jobRecordId: 23,
        cookies: [{ name: '_yuque_session', value: 'abc' }],
        pageAppData: { bookId: 3001, articleSlug: 'api-empty', host: 'www.yuque.com' },
        pageHtml: `
          <html>
            <head><title>Fallback After Empty API</title></head>
            <body>
              <article>
                <h1>Fallback After Empty API</h1>
                <p>The API returned empty markdown so the rendered snapshot remains useful.</p>
                <p>A second paragraph gives the extractor enough meaningful prose.</p>
                <p>A third paragraph keeps the content above the acceptance threshold.</p>
              </article>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Fallback After Empty API',
        jobId: 23,
      }),
    });
    expect(mockCreate.mock.calls[0][0].data.source).toBeUndefined();
  });

  it('fails with LOCKED_CONTENT when Yuque API returns 401 or 403', async () => {
    mockFetch.mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({ message: 'Forbidden' }),
    });

    await expect(
      captureProcessor({
        data: {
          url: 'https://www.yuque.com/team/private-doc',
          jobRecordId: 24,
          cookies: [{ name: '_yuque_session', value: 'expired' }],
          pageAppData: { bookId: 3001, articleSlug: 'private-doc', host: 'www.yuque.com' },
          pageHtml: `
            <html>
              <body>
                <main>
                  <h1>Private Doc Snapshot</h1>
                  <p>This fallback snapshot must not be saved after API authorization failure.</p>
                  <p>Even with enough text, the processor should fail explicitly.</p>
                  <p>This third paragraph proves the fallback would otherwise be acceptable.</p>
                </main>
              </body>
            </html>
          `,
        },
      } as any),
    ).rejects.toMatchObject({
      message: 'Yuque document API requires authentication',
      jobErrorType: 'LOCKED_CONTENT',
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps non-Yuque snapshot capture behavior unchanged', async () => {
    await captureProcessor({
      data: {
        url: 'https://example.com/article',
        jobRecordId: 25,
        pageAppData: { bookId: 3001, articleSlug: 'ignored', host: 'www.yuque.com' },
        pageHtml: `
          <html>
            <head><title>Example Article</title></head>
            <body>
              <article>
                <h1>Example Article</h1>
                <p>This non-Yuque article should stay on the generic snapshot pipeline.</p>
                <p>A second paragraph keeps the test representative.</p>
                <p>A third paragraph keeps the extractor threshold satisfied.</p>
              </article>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Example Article',
        url: 'https://example.com/article',
        jobId: 25,
      }),
    });
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

  it('uses the real Yuque document title instead of the site title', async () => {
    await captureProcessor({
      data: {
        url: 'https://www.yuque.com/example/doc-title',
        jobRecordId: 12,
        pageHtmlMeta: { title: 'Yuque' },
        pageHtml: `
          <html>
            <head><title>Yuque</title></head>
            <body>
              <main class="doc-reader">
                <h1>Architecture Notes</h1>
                <p>This is the first meaningful paragraph from the document body.</p>
                <p>This is the second meaningful paragraph from the document body.</p>
                <p>This is the third meaningful paragraph from the document body.</p>
              </main>
            </body>
          </html>
        `,
      },
    } as any);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Architecture Notes',
      }),
    });
  });

  it('captures Yuque body content instead of the outline', async () => {
    await captureProcessor({
      data: {
        url: 'https://www.yuque.com/example/doc-body',
        jobRecordId: 13,
        pageHtmlMeta: { title: 'Yuque' },
        pageHtml: `
          <html>
            <head><title>Yuque</title></head>
            <body>
              <aside class="toc">
                <a href="#a">Outline one</a>
                <a href="#b">Outline two</a>
                <a href="#c">Outline three</a>
              </aside>
              <main class="doc-reader">
                <h1>Implementation Guide</h1>
                <p>The actual body has enough complete prose to be selected over the table of contents.</p>
                <p>Another full paragraph explains the implementation details in natural language.</p>
                <p>A final paragraph keeps the body candidate comfortably above the quality threshold.</p>
              </main>
            </body>
          </html>
        `,
      },
    } as any);

    const saved = mockCreate.mock.calls[0][0].data;
    expect(saved.title).toBe('Implementation Guide');
    expect(saved.contentMarkdown).toContain('actual body');
    expect(saved.contentMarkdown).not.toContain('Outline one');
  });

  it('rejects Yuque 401 slider snapshots instead of saving them', async () => {
    await expect(
      captureProcessor({
        data: {
          url: 'https://www.yuque.com/example/private-doc',
          jobRecordId: 8,
          pageHtml: `
            <html>
              <head><title>401 - Unauthorized - Yuque</title></head>
              <body>
                <main>
                  <p>Please hold the slider and drag it to the far right.</p>
                  <p>Verify you are a human before continuing.</p>
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
              <head><title>Premium article</title></head>
              <body>
                <article>
                  <h1>Preview</h1>
                  <p>This is a short free preview.</p>
                  <p>Subscribe to read the full article.</p>
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
    await expect(
      captureProcessor({
        data: {
          url: 'https://example.com/empty',
          jobRecordId: 11,
          pageHtml:
            '<html><head><title>Empty Page</title></head><body><nav>Just navigation links here</nav></body></html>',
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
