import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveJobDiagnostics,
  diagnosticsSummary,
} from '../tools/knowledge-capture/diagnostics';

/**
 * SSE 推送事件类型
 */
export interface JobChangedEvent {
  type: 'job-changed';
  job: Record<string, any>;
}

export interface MetricsEvent {
  type: 'metrics';
  metrics: Record<string, any>;
}

export type JobEvent = JobChangedEvent | MetricsEvent;

@Injectable()
export class JobEventService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly subject = new Subject<JobEvent>();

  /**
   * 共享的事件流 — 所有 SSE 连接共享同一个订阅
   */
  readonly stream$: Observable<JobEvent> = this.subject.asObservable().pipe(
    share(),
  );

  /**
   * 广播单个任务状态变更（创建/运行/成功/失败）
   */
  emitJobChanged(job: Record<string, any>): void {
    this.subject.next({ type: 'job-changed', job });
  }

  private parseOutputItemId(output: string | null): number | null {
    if (!output) return null;
    try {
      const parsed = JSON.parse(output);
      return typeof parsed?.itemId === 'number' ? parsed.itemId : null;
    } catch {
      return null;
    }
  }

  async getMetricsSnapshot(toolKey?: string) {
    const jobWhere: any = {};
    if (toolKey) jobWhere.toolKey = toolKey;

    const [runningCount, failedCount] = await Promise.all([
      this.prisma.job.count({
        where: { ...jobWhere, status: { in: ['pending', 'running'] } },
      }),
      this.prisma.job.count({
        where: { ...jobWhere, status: 'failed' },
      }),
    ]);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentJobs = await this.prisma.job.findMany({
      where: { ...jobWhere, createdAt: { gte: oneDayAgo } },
      select: { status: true },
    });
    const recentSuccess = recentJobs.filter(
      (j) => j.status === 'success' || j.status === 'completed',
    ).length;
    const successRate =
      recentJobs.length > 0
        ? Math.round((recentSuccess / recentJobs.length) * 1000) / 10
        : null;

    const totalItems = await this.prisma.knowledgeItem.count({
      where: { status: 'published' },
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayItems = await this.prisma.knowledgeItem.count({
      where: { capturedAt: { gte: todayStart } },
    });

    return {
      totalItems,
      todayItems,
      runningCount,
      successRate,
      failedCount,
    };
  }

  async emitMetricsSnapshot(toolKey?: string): Promise<void> {
    this.emitMetrics(await this.getMetricsSnapshot(toolKey));
  }

  /**
   * 便捷方法：根据 DB 中的 job id 查询、富化诊断信息后广播
   */
  async emitEnrichedJob(jobId: number): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    let knowledgeItem: any = null;
    const itemId = this.parseOutputItemId(job.output);
    if (itemId) {
      knowledgeItem = await this.prisma.knowledgeItem.findUnique({
        where: { id: itemId },
        select: { id: true, title: true, capturedAt: true },
      });
    }

    const diagnostics = deriveJobDiagnostics(job, knowledgeItem);
    this.subject.next({
      type: 'job-changed',
      job: {
        id: job.id,
        toolKey: job.toolKey,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        diagnostics,
        diagnosticsSummary: diagnosticsSummary(diagnostics),
      },
    });
  }

  /**
   * 广播指标更新
   */
  emitMetrics(metrics: Record<string, any>): void {
    this.subject.next({ type: 'metrics', metrics });
  }
}
