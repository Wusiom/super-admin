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
