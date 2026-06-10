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

  /**
   * 便捷方法：根据 DB 中的 job id 查询、富化诊断信息后广播
   */
  async emitEnrichedJob(jobId: number): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    let knowledgeItem: any = null;
    if (job.output) {
      try {
        const output = JSON.parse(job.output);
        if (output?.itemId) {
          knowledgeItem = await this.prisma.knowledgeItem.findUnique({
            where: { id: output.itemId },
          });
        }
      } catch { /* ignore */ }
    }

    const diagnostics = deriveJobDiagnostics(job, knowledgeItem);
    this.subject.next({
      type: 'job-changed',
      job: {
        ...job,
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
