import {
  createLockedContentError,
  hasLockedContentPrompt,
  normalizeVisibleText,
} from './content-quality';

describe('content quality checks', () => {
  it('normalizes visible text before matching page prompts', () => {
    expect(normalizeVisibleText('  first\n\n  second\tthird  ')).toBe(
      'first second third',
    );
  });

  it('detects pages that only expose a locked preview', () => {
    expect(
      hasLockedContentPrompt('Preview text only... 订阅并查看全文'),
    ).toBe(true);
    expect(hasLockedContentPrompt('Preview text only... 解锁全文')).toBe(true);
    expect(hasLockedContentPrompt('Sign in to read the full article')).toBe(
      true,
    );
  });

  it('does not flag normal article text', () => {
    expect(
      hasLockedContentPrompt('This is the full article body with normal content.'),
    ).toBe(false);
  });

  it('marks locked content errors for job classification', () => {
    const error = createLockedContentError() as Error & {
      jobErrorType?: string;
    };

    expect(error.message).toBe(
      'Page requires authentication or subscription to view full content',
    );
    expect(error.jobErrorType).toBe('LOCKED_CONTENT');
  });
});
