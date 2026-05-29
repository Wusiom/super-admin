import { Job } from 'bullmq';
import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const turndown = new TurndownService();

export async function captureProcessor(job: Job) {
  const { url, jobRecordId, cookies, localStorage: lsData } = job.data;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    // 注入 cookie（Playwright 格式：[{name, value, domain, path?}]）
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    // 先导航到目标 URL 建立 origin，再注入 localStorage，然后刷新
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err: any) {
      await browser.close();
      if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
        throw Object.assign(new Error('Page load timeout'), { jobErrorType: 'TIMEOUT' });
      }
      throw Object.assign(new Error(`Network error: ${err.message}`), { jobErrorType: 'NETWORK_ERROR' });
    }

    // 在已建立 origin 的页面注入 localStorage，然后刷新让 SPA 重新读取
    if (lsData && typeof lsData === 'object' && Object.keys(lsData).length > 0) {
      await page.evaluate((items: Record<string, string>) => {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, value);
        }
      }, lsData);
      // 重新加载，等 SPA 完成所有 API 请求后抓取
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    }
    // 额外等待，确保 Vue 渲染完成
    await page.waitForTimeout(2000);

    const html = await page.content();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    await browser.close();

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
    if (browser) await browser.close().catch(() => {});
    if (!err.jobErrorType) {
      throw Object.assign(err, { jobErrorType: 'EXTRACTION_FAILED' });
    }
    throw err;
  }
}
