import { Job } from 'bullmq';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const turndown = new TurndownService();

/**
 * 从 Readability 提取后的内容中检测页面类型。
 * Readability 已剥离导航/侧栏/脚本/样式，剩下的就是正文（或验证码/付费墙提示文本）。
 * 在提取后的内容上做匹配，误杀率极低。
 */
function detectContentIssue(
  extractedText: string,
  contentLength: number,
): 'blocked' | 'locked' | null {
  const text = extractedText.toLowerCase();

  // 验证码/滑块页面 — Readability 提取出来的就是"请拖动滑块"之类的文本
  if (
    /请按住滑块[，,]\s*拖动到最右边/.test(text) ||
    /滑块验证/.test(text) ||
    /人机验证/.test(text) ||
    /请完成安全验证/.test(text) ||
    /verify you are a human/i.test(text)
  ) {
    return 'blocked';
  }

  // 付费/登录墙 — 提取出的内容极短且包含付费提示
  if (contentLength < 500) {
    if (
      /订阅并查看全文/.test(text) ||
      /订阅后可查看/.test(text) ||
      /付费阅读/.test(text) ||
      /购买后可阅读/.test(text) ||
      /subscribe to (read|view)/i.test(text) ||
      /unlock this article/i.test(text) ||
      /this content is for subscribers/i.test(text) ||
      /premium content/i.test(text) ||
      /登录后(即可)?(阅读|查看|浏览)/.test(text) ||
      /请先登录/.test(text) ||
      /sign in to (continue|read|view)/i.test(text)
    ) {
      return 'locked';
    }
  }

  return null;
}

/**
 * 从 Chrome 扩展发来的 pageHtml 快照中提取正文，转为 Markdown 存入 KnowledgeItem。
 * 不做预处理拦截——让 Readability 先提取，再在提取结果上判断页面类型。
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
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article || !article.content || article.content.trim().length < 100) {
      throw Object.assign(
        new Error('Content extraction produced empty or negligible result'),
        { jobErrorType: 'EMPTY_CONTENT' },
      );
    }

    // 在 Readability 提取后的文本内容上检测，而非原始 HTML
    const extractedText = (article.textContent || article.content || '').trim();
    const issue = detectContentIssue(extractedText, article.content.length);
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
