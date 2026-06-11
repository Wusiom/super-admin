import { Job } from 'bullmq';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const turndown = new TurndownService();

// 拦截页面特征 — 验证码、滑块、403 等
const BLOCKED_PATTERNS: RegExp[] = [
  /请按住滑块[，,]\s*拖动到最右边/,
  /滑块验证/,
  /人机验证/,
  /请完成安全验证/,
  /verify you are a human/i,
  /captcha/i,
  /access denied/i,
  /403\s*forbidden/i,
];

// 付费/登录墙特征
const LOCKED_PATTERNS: RegExp[] = [
  /订阅并查看全文/,
  /订阅后可查看/,
  /付费阅读/,
  /购买后可阅读/,
  /subscribe to read/i,
  /subscribe to view/i,
  /unlock this article/i,
  /this content is for subscribers/i,
  /premium content/i,
  /members only/i,
  /登录后(即可)?(阅读|查看|浏览)/,
  /请先登录/,
  /sign in to (continue|read|view)/i,
];

function detectPageType(html: string, title: string): 'blocked' | 'locked' | 'ok' {
  const text = html + ' ' + title;

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) return 'blocked';
  }

  for (const pattern of LOCKED_PATTERNS) {
    if (pattern.test(text)) return 'locked';
  }

  return 'ok';
}

/**
 * 从 Chrome 扩展发来的 pageHtml 快照中提取正文，转为 Markdown 存入 KnowledgeItem。
 * 不再启动 Playwright — 扩展已在用户浏览器中完成渲染，后端只做提取。
 */
export async function captureProcessor(job: Job) {
  const { url, jobRecordId, pageHtml } = job.data;

  if (!pageHtml || typeof pageHtml !== 'string' || pageHtml.trim().length < 100) {
    throw Object.assign(
      new Error('Page snapshot was not received from the extension'),
      { jobErrorType: 'NO_SNAPSHOT' },
    );
  }

  try {
    const doc = new JSDOM(pageHtml, { url });
    const title = doc.window.document.title || '';

    const pageType = detectPageType(pageHtml, title);
    if (pageType === 'blocked') {
      throw Object.assign(
        new Error('Captured page is a login or verification page'),
        { jobErrorType: 'BLOCKED' },
      );
    }
    if (pageType === 'locked') {
      throw Object.assign(
        new Error('Page requires authentication or subscription to view full content'),
        { jobErrorType: 'LOCKED_CONTENT' },
      );
    }

    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article || !article.content || article.content.trim().length < 100) {
      throw Object.assign(
        new Error('Content extraction produced empty or negligible result'),
        { jobErrorType: 'EMPTY_CONTENT' },
      );
    }

    const markdown = turndown.turndown(article.content);

    const item = await prisma.knowledgeItem.create({
      data: {
        title: article.title || url,
        url,
        contentHtml: article.content,
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
