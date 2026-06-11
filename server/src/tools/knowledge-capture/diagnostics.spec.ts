import { deriveJobDiagnostics, diagnosticsSummary } from './diagnostics';

describe('deriveJobDiagnostics', () => {
  function job(input: any, output?: any, error?: string | null) {
    return {
      input: input ? JSON.stringify(input) : null,
      output: output ? JSON.stringify(output) : null,
      error: error ?? null,
    };
  }

  it('derives diagnostics for snapshot-based successful capture', () => {
    const d = deriveJobDiagnostics(
      job(
        { url: 'https://example.com/article', pageHtml: '<html>...article...</html>', cookies: [], localStorage: {} },
        { itemId: 1 },
      ),
      {
        id: 1,
        title: 'Test Article',
        contentMarkdown: '# Hello',
        contentHtml: '<h1>Hello</h1>',
        capturedAt: new Date('2026-06-05T06:20:00Z'),
      } as any,
    );

    expect(d.url).toBe('https://example.com/article');
    expect(d.hasPageHtml).toBe(true);
    expect(d.pageHtmlSize).toBeGreaterThan(0);
    expect(d.cookieCount).toBe(0);
    expect(d.localStorageKeyCount).toBe(0);
    expect(d.itemId).toBe(1);
    expect(d.itemTitle).toBe('Test Article');
    expect(d.markdownLength).toBe(7);
    expect(d.htmlLength).toBe(14);
    expect(d.capturedAt).toBe('2026-06-05T06:20:00.000Z');
  });

  it('derives diagnostics for failed capture with no snapshot and no auth', () => {
    const d = deriveJobDiagnostics(
      job({ url: 'https://xiaobot.net/post/123', pageHtml: '', cookies: [], localStorage: {} }, undefined, 'Page requires authentication or subscription'),
    );

    expect(d.hasPageHtml).toBe(false);
    expect(d.cookieCount).toBe(0);
    expect(d.localStorageKeyCount).toBe(0);
    expect(d.error).toBe('Page requires authentication or subscription');
    expect(d.suggestion).toContain('Chrome 扩展');
  });

  it('derives diagnostics for failed capture with LOCKED_CONTENT', () => {
    const d = deriveJobDiagnostics(
      job({ url: 'https://example.com/locked', pageHtml: '<html>subscribe to read</html>' }, undefined, 'LOCKED_CONTENT: paywall'),
    );

    expect(d.errorType).toBe('LOCKED_CONTENT');
    expect(d.suggestion).toContain('登录');
  });

  it('derives diagnostics for failed capture with no pageHtml', () => {
    const d = deriveJobDiagnostics(
      job(
        { url: 'https://public.example.com', pageHtml: undefined, cookies: [{ name: 's' }], localStorage: { token: 'x' } },
        undefined,
        'Page snapshot was not received from the extension',
      ),
    );

    expect(d.hasPageHtml).toBe(false);
    expect(d.cookieCount).toBe(1);
    expect(d.localStorageKeyCount).toBe(1);
    expect(d.suggestion).toContain('快照未收到');
  });

  it('does not expose raw pageHtml or credential values in diagnostics', () => {
    const d = deriveJobDiagnostics(
      job({
        url: 'https://example.com',
        pageHtml: '<html><body>secret article content</body></html>',
        cookies: [{ name: 'session', value: 'abc123secret' }],
        localStorage: { token: 'bearer-xyz', vuex: '{"user":"admin"}' },
      }),
    );

    // Raw content should never be in diagnostics
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain('secret article');
    expect(serialized).not.toContain('abc123secret');
    expect(serialized).not.toContain('bearer-xyz');
    expect(serialized).not.toContain('"user":"admin"');
  });
});

describe('diagnosticsSummary', () => {
  const base: any = {
    url: 'https://example.com',
    hasPageHtml: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
  };

  it('returns "快照已收到" when itemId exists', () => {
    expect(diagnosticsSummary({ ...base, hasPageHtml: true, itemId: 1 })).toBe('快照已收到');
  });

  it('returns "未收到快照" when no snapshot and no auth', () => {
    expect(diagnosticsSummary(base)).toBe('未收到快照');
  });

  it('returns "付费/登录内容" for LOCKED_CONTENT', () => {
    expect(diagnosticsSummary({ ...base, errorType: 'LOCKED_CONTENT', error: 'err' })).toBe('付费/登录内容');
  });

  it('returns "正文识别失败" for EXTRACTION_FAILED', () => {
    expect(diagnosticsSummary({ ...base, errorType: 'EXTRACTION_FAILED', error: 'err' })).toBe('正文识别失败');
  });

  it('returns "内容为空" for EMPTY_CONTENT', () => {
    expect(diagnosticsSummary({ ...base, errorType: 'EMPTY_CONTENT', error: 'err' })).toBe('内容为空');
  });

  it('returns "采集中" when no error and not captured yet', () => {
    expect(diagnosticsSummary({ ...base, hasPageHtml: true })).toBe('采集中');
  });
});
