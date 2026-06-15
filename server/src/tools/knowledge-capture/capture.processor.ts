import { Job } from 'bullmq';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const turndown = new TurndownService();

type ContentIssue = 'blocked' | 'locked' | null;

interface ExtractedContent {
  title?: string;
  content: string;
  textContent: string;
}

const BLOCKED_PATTERNS = [
  /hold the slider/i,
  /drag it to the far right/i,
  /verify you are a human/i,
  /human verification/i,
  /\u6ed1\u5757\u9a8c\u8bc1/,
  /\u4eba\u673a\u9a8c\u8bc1/,
  /\u8bf7\u5b8c\u6210\u5b89\u5168\u9a8c\u8bc1/,
  /\u62d6\u52a8\u5230\u6700\u53f3\u8fb9/,
];

const LOCKED_PATTERNS = [
  /subscribe to (read|view)/i,
  /subscribe to read the full/i,
  /unlock this article/i,
  /this content is for subscribers/i,
  /premium content/i,
  /sign in to (continue|read|view)/i,
  /\u8ba2\u9605\u5e76\u67e5\u770b\u5168\u6587/,
  /\u8ba2\u9605\u540e\u53ef\u67e5\u770b/,
  /\u4ed8\u8d39\u9605\u8bfb/,
  /\u8d2d\u4e70\u540e\u53ef\u9605\u8bfb/,
  /\u8bf7\u5148\u767b\u5f55/,
];

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[aria-label*="toc" i]',
  '[aria-label*="catalog" i]',
  '[aria-label*="outline" i]',
  '[class*="toc" i]',
  '[class*="catalog" i]',
  '[class*="outline" i]',
  '[class*="sidebar" i]',
  '[class*="directory" i]',
  '[class*="menu" i]',
  '[id*="toc" i]',
  '[id*="catalog" i]',
  '[id*="outline" i]',
  '[id*="sidebar" i]',
];

const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.doc-reader',
  '.yuque-doc',
  '.ne-viewer-body',
  '.lake-content',
  '.lake-engine',
  '.markdown-body',
  '.article-content',
  '.post-content',
  '.content',
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function parsePageHtmlMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function cleanTitle(raw: string | undefined | null) {
  if (!raw) return '';
  let title = normalizeText(raw)
    .replace(/\s*[-|·]\s*(Yuque|\u8bed\u96c0)\s*$/i, '')
    .replace(/\s*(Yuque|\u8bed\u96c0)\s*$/i, '')
    .trim();

  title = title.replace(/^[-|·\s]+|[-|·\s]+$/g, '').trim();
  if (/^(yuque|\u8bed\u96c0)$/i.test(title)) return '';
  if (/^401\b/i.test(title)) return '';
  return title;
}

function titleFromDocument(document: any, contentRoot?: any) {
  const roots = [contentRoot, document].filter(Boolean);
  const selectors = [
    'h1',
    '[data-testid*="title" i]',
    '[class*="title" i]',
    '[class*="doc-name" i]',
  ];

  for (const root of roots) {
    for (const selector of selectors) {
      const element = root.querySelector?.(selector);
      const title = cleanTitle(element?.textContent);
      if (title) return title;
    }
  }

  return '';
}

function detectContentIssue(
  extractedText: string,
  contentLength: number,
): ContentIssue {
  const text = normalizeText(extractedText);

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'blocked';
  }

  if (
    contentLength < 700 &&
    LOCKED_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return 'locked';
  }

  return null;
}

function removeNoise(document: any) {
  for (const selector of REMOVE_SELECTORS) {
    document.querySelectorAll(selector).forEach((node: any) => node.remove());
  }
}

function candidateSignature(element: any) {
  return `${element.tagName || ''} ${element.id || ''} ${element.className || ''}`;
}

function isOutlineLike(element: any, text: string) {
  const signature = candidateSignature(element);
  if (/(toc|catalog|outline|sidebar|directory|menu)/i.test(signature)) {
    return true;
  }

  const links = Array.from(element.querySelectorAll?.('a') || []) as any[];
  const headings = Array.from(
    element.querySelectorAll?.('h1,h2,h3,h4,h5,h6') || [],
  ) as any[];
  const paragraphs = Array.from(element.querySelectorAll?.('p') || []) as any[];
  const listItems = Array.from(element.querySelectorAll?.('li') || []) as any[];
  const linkTextLength = links.reduce(
    (sum, link) => sum + normalizeText(link.textContent || '').length,
    0,
  );
  const paragraphCount = paragraphs.filter(
    (p) => normalizeText(p.textContent || '').length >= 40,
  ).length;
  const linkRatio = text.length ? linkTextLength / text.length : 0;
  const shortListOnly =
    listItems.length >= 3 &&
    paragraphCount === 0 &&
    text.length / Math.max(listItems.length, 1) < 60;

  return (
    (links.length >= 3 && linkRatio > 0.35 && paragraphCount < 2) ||
    (headings.length >= 4 && paragraphCount < 2) ||
    shortListOnly
  );
}

function scoreCandidate(element: any) {
  const text = normalizeText(element.textContent || '');
  if (text.length < 100 || isOutlineLike(element, text)) return null;

  const paragraphs = Array.from(element.querySelectorAll?.('p') || []) as any[];
  const meaningfulParagraphs = paragraphs.filter(
    (p) => normalizeText(p.textContent || '').length >= 40,
  ).length;
  const links = Array.from(element.querySelectorAll?.('a') || []) as any[];
  const linkTextLength = links.reduce(
    (sum, link) => sum + normalizeText(link.textContent || '').length,
    0,
  );
  const linkRatio = text.length ? linkTextLength / text.length : 0;
  const signature = candidateSignature(element);
  const semanticBonus = /^(ARTICLE|MAIN)$/i.test(element.tagName || '')
    ? 600
    : 0;
  const yuqueBonus = /(doc-reader|yuque|lake|ne-viewer)/i.test(signature)
    ? 500
    : 0;
  const score =
    text.length +
    meaningfulParagraphs * 450 +
    semanticBonus +
    yuqueBonus -
    linkRatio * 1200;

  return { element, score, text };
}

function findBestDomContent(document: any): ExtractedContent | null {
  removeNoise(document);

  const candidates = new Set<any>();
  for (const selector of CONTENT_SELECTORS) {
    document
      .querySelectorAll(selector)
      .forEach((element: any) => candidates.add(element));
  }
  if (document.body) candidates.add(document.body);

  const ranked = Array.from(candidates)
    .map(scoreCandidate)
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score) as Array<{
    element: any;
    score: number;
    text: string;
  }>;

  const best = ranked[0];
  if (!best) return null;

  return {
    title: titleFromDocument(document, best.element),
    content: best.element.outerHTML,
    textContent: best.text,
  };
}

function extractReadableContent(pageHtml: string, url: string): ExtractedContent | null {
  const dom = new JSDOM(pageHtml, { url });
  const domContent = findBestDomContent(dom.window.document);
  if (domContent) return domContent;

  const readabilityDom = new JSDOM(pageHtml, { url });
  removeNoise(readabilityDom.window.document);
  const article = new Readability(readabilityDom.window.document).parse();
  if (!article || !article.content) return null;

  return {
    title: cleanTitle(article.title),
    content: article.content,
    textContent: normalizeText(article.textContent || article.content),
  };
}

function resolveTitle(
  document: any,
  content: ExtractedContent,
  pageHtmlMeta: Record<string, any>,
  url: string,
) {
  return (
    cleanTitle(content.title) ||
    titleFromDocument(document) ||
    cleanTitle(pageHtmlMeta.title) ||
    cleanTitle(document.title) ||
    url
  );
}

export async function captureProcessor(job: Job) {
  const { url, jobRecordId, pageHtml } = job.data;
  const pageHtmlMeta = parsePageHtmlMeta(job.data.pageHtmlMeta);

  if (!pageHtml || typeof pageHtml !== 'string' || pageHtml.trim().length < 100) {
    throw Object.assign(
      new Error('Page snapshot was not received from the extension'),
      { jobErrorType: 'NO_SNAPSHOT' },
    );
  }

  try {
    const documentDom = new JSDOM(pageHtml, { url });
    const content = extractReadableContent(pageHtml, url);

    if (!content || !content.content || content.content.trim().length < 100) {
      throw Object.assign(
        new Error('Content extraction produced empty or negligible result'),
        { jobErrorType: 'EMPTY_CONTENT' },
      );
    }

    const extractedText = normalizeText(content.textContent || content.content);
    const issue = detectContentIssue(extractedText, content.content.length);
    if (issue === 'blocked') {
      throw Object.assign(
        new Error('Captured page is a login or verification page'),
        { jobErrorType: 'BLOCKED' },
      );
    }
    if (issue === 'locked') {
      throw Object.assign(
        new Error('Page requires authentication or subscription to view full content'),
        { jobErrorType: 'LOCKED_CONTENT' },
      );
    }

    const markdown = turndown.turndown(content.content);
    const title = resolveTitle(
      documentDom.window.document,
      content,
      pageHtmlMeta,
      url,
    );

    const item = await prisma.knowledgeItem.create({
      data: {
        title,
        url,
        contentHtml: content.content,
        contentMarkdown: markdown,
        status: 'published',
        jobId: jobRecordId,
      },
    });

    return { itemId: item.id };
  } catch (err: any) {
    if (!err.jobErrorType) {
      throw Object.assign(err, { jobErrorType: 'EXTRACTION_FAILED' });
    }
    throw err;
  }
}
