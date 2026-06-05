import { Job, KnowledgeItem } from '@prisma/client';

export interface TaskDiagnostics {
  url?: string;
  hasPageHtml: boolean;
  pageHtmlSize?: number;
  cookieCount: number;
  localStorageKeyCount: number;
  error?: string;
  errorType?: string;
  suggestion?: string;
  /** 仅成功任务 */
  itemId?: number;
  itemTitle?: string;
  markdownLength?: number;
  htmlLength?: number;
  capturedAt?: string;
}

function safeParseJson(raw: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function deriveSuggestion(
  hasPageHtml: boolean,
  cookieCount: number,
  localStorageKeyCount: number,
  errorType?: string,
): string {
  if (!hasPageHtml && cookieCount === 0 && localStorageKeyCount === 0) {
    return '请打开目标网页并确认正文完整显示后，点击 Chrome 扩展按钮采集。';
  }

  if (!hasPageHtml) {
    return '页面快照未收到，系统将使用 Playwright 回退采集。请确认 Chrome 扩展已正确安装并刷新页面后重试。';
  }

  switch (errorType) {
    case 'LOCKED_CONTENT':
      return '需要登录或订阅后才能查看全文。请先在浏览器中登录目标网站，再使用扩展采集。';
    case 'NETWORK_ERROR':
      return '网络连接失败，请检查目标网站是否可访问后重试。';
    case 'TIMEOUT':
      return '页面加载超时，请检查网络连接后重试。';
    case 'EXTRACTION_FAILED':
      return '正文识别失败，请确认页面包含可读的文章内容。';
    case 'BLOCKED':
      return '目标网站屏蔽了自动访问，请使用 Chrome 扩展直接从浏览器采集。';
    case 'EMPTY_CONTENT':
      return '提取的内容为空或仅包含导航文本，请确认页面包含正文内容。';
    case 'BROWSER_CRASH':
      return '浏览器进程异常，系统将自动重试。如多次失败请联系管理员。';
    default:
      return '采集失败，请重试或查看错误详情。';
  }
}

function extractErrorType(jobError: string | null, input: Record<string, any> | null): string | undefined {
  if (!jobError) return undefined;

  if (input && !input.pageHtml) return 'NO_SNAPSHOT';

  const typeMap: Array<[RegExp, string]> = [
    [/LOCKED_CONTENT/i, 'LOCKED_CONTENT'],
    [/NETWORK_ERROR/i, 'NETWORK_ERROR'],
    [/timeout/i, 'TIMEOUT'],
    [/EXTRACTION_FAILED/i, 'EXTRACTION_FAILED'],
    [/BLOCKED/i, 'BLOCKED'],
    [/EMPTY_CONTENT/i, 'EMPTY_CONTENT'],
    [/BROWSER_CRASH/i, 'BROWSER_CRASH'],
  ];

  for (const [pattern, type] of typeMap) {
    if (pattern.test(jobError)) return type;
  }
  return undefined;
}

/**
 * 从 Job 和可选 KnowledgeItem 派生前端可用的诊断信息。
 * 不暴露 raw cookie 值、localStorage 值或完整 pageHtml。
 */
export function deriveJobDiagnostics(
  job: { input: string | null; output: string | null; error: string | null },
  knowledgeItem?: KnowledgeItem | null,
): TaskDiagnostics {
  const input = safeParseJson(job.input);
  const output = safeParseJson(job.output);

  const url = input?.url as string | undefined;
  const hasPageHtml = typeof input?.pageHtml === 'string' && input.pageHtml.length > 0;
  const pageHtmlSize = hasPageHtml
    ? Buffer.byteLength(input.pageHtml, 'utf-8')
    : undefined;
  const cookies = Array.isArray(input?.cookies) ? input.cookies : [];
  const cookieCount = cookies.length;
  const lsData = input?.localStorage && typeof input.localStorage === 'object' ? input.localStorage : {};
  const localStorageKeyCount = Object.keys(lsData).length;

  const errorType = extractErrorType(job.error, input);
  const suggestion = deriveSuggestion(hasPageHtml, cookieCount, localStorageKeyCount, errorType);

  const diagnostics: TaskDiagnostics = {
    url,
    hasPageHtml,
    pageHtmlSize,
    cookieCount,
    localStorageKeyCount,
    error: job.error || undefined,
    errorType,
    suggestion,
  };

  // 成功任务：附加关联的 KnowledgeItem 元数据
  if (knowledgeItem) {
    diagnostics.itemId = knowledgeItem.id;
    diagnostics.itemTitle = knowledgeItem.title;
    diagnostics.markdownLength = knowledgeItem.contentMarkdown
      ? knowledgeItem.contentMarkdown.length
      : 0;
    diagnostics.htmlLength = knowledgeItem.contentHtml
      ? knowledgeItem.contentHtml.length
      : 0;
    diagnostics.capturedAt = knowledgeItem.capturedAt
      ? knowledgeItem.capturedAt.toISOString()
      : undefined;
  }

  return diagnostics;
}

/**
 * 诊断摘要文案 — 用于表格"诊断"列。
 */
export function diagnosticsSummary(d: TaskDiagnostics): string {
  if (d.errorType === 'LOCKED_CONTENT') return '付费/登录内容';
  if (d.errorType === 'NETWORK_ERROR') return '网络错误';
  if (d.errorType === 'TIMEOUT') return '页面超时';
  if (d.errorType === 'BLOCKED') return '被目标屏蔽';
  if (d.errorType === 'EXTRACTION_FAILED') return '正文识别失败';
  if (d.errorType === 'EMPTY_CONTENT') return '内容为空';
  if (d.errorType === 'BROWSER_CRASH') return '浏览器崩溃';
  if (d.error) return '采集失败';
  if (!d.hasPageHtml && d.cookieCount === 0 && d.localStorageKeyCount === 0)
    return '未收到快照';
  if (!d.hasPageHtml) return '未收到快照';
  if (d.itemId) return '快照已收到';
  return '采集中';
}
