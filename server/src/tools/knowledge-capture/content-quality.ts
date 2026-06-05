const LOCKED_CONTENT_PATTERNS = [
  /\u8ba2\u9605\u5e76\u67e5\u770b\u5168\u6587/,
  /\u89e3\u9501\u5168\u6587/,
  /\u4ed8\u8d39\u9605\u8bfb/,
  /subscribe\s+(to\s+)?(read|view)/i,
  /sign\s+in\s+to\s+(read|view)/i,
];

export function normalizeVisibleText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function hasLockedContentPrompt(text: string) {
  const normalized = normalizeVisibleText(text);
  return LOCKED_CONTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function createLockedContentError() {
  return Object.assign(
    new Error('Page requires authentication or subscription to view full content'),
    { jobErrorType: 'LOCKED_CONTENT' },
  );
}
