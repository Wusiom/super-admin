import { Controller, Get, Post, Param, Query, Sse } from '@nestjs/common';
import { Observable, concat, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { captureProcessor } from '../tools/knowledge-capture/capture.processor';
import {
  deriveJobDiagnostics,
  diagnosticsSummary,
} from '../tools/knowledge-capture/diagnostics';
import { JobEventService, JobEvent } from './job-events.service';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('api/jobs')
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobEvents: JobEventService,
  ) {}

  @Get()
  async getJobs(
    @Query('toolKey') toolKey?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const where: any = {};
    if (toolKey) where.toolKey = toolKey;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      this.prisma.job.count({ where }),
    ]);

    // 为 knowledge-capture 任务附加诊断信息
    const jobsWithDiagnostics = await Promise.all(
      items.map(async (job) => {
        if (job.toolKey !== 'knowledge-capture') {
          return job;
        }

        let knowledgeItem: any = null;
        if (job.output) {
          try {
            const output = JSON.parse(job.output);
            if (output?.itemId) {
              knowledgeItem = await this.prisma.knowledgeItem.findUnique({
                where: { id: output.itemId },
              });
            }
          } catch {
            // output 解析失败，忽略
          }
        }

        const diagnostics = deriveJobDiagnostics(job, knowledgeItem);
        return {
          ...job,
          diagnostics,
          diagnosticsSummary: diagnosticsSummary(diagnostics),
        };
      }),
    );

    return {
      jobs: jobsWithDiagnostics,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  @Get('metrics')
  async getMetrics(@Query('toolKey') toolKey?: string) {
    const jobWhere: any = {};
    if (toolKey) jobWhere.toolKey = toolKey;

    const [totalJobs, runningCount, failedCount] = await Promise.all([
      this.prisma.job.count({ where: jobWhere }),
      this.prisma.job.count({
        where: { ...jobWhere, status: { in: ['pending', 'running'] } },
      }),
      this.prisma.job.count({
        where: { ...jobWhere, status: 'failed' },
      }),
    ]);

    // 计算过去 24 小时成功率
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

    // 总采集条目数
    const totalItems = await this.prisma.knowledgeItem.count({
      where: { status: 'published' },
    });

    // 今日新增
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

  @Post(':id/retry')
  async retryJob(@Param('id') id: string) {
    const existingJob = await this.prisma.job.findUnique({ where: { id: Number(id) } });
    if (!existingJob) return { error: 'Job not found' };

    // 解析原始 input 获取 payload
    let input: Record<string, any> = {};
    try {
      input = existingJob.input ? JSON.parse(existingJob.input) : {};
    } catch {
      return { error: 'Job input is corrupted' };
    }

    if (!input.url) return { error: 'Job input missing URL' };

    // 重置为 running 并直接调用 processor（不走 BullMQ）
    await this.prisma.job.update({
      where: { id: Number(id) },
      data: { status: 'running', error: null },
    });
    void this.jobEvents.emitEnrichedJob(Number(id));

    const mockJob = {
      id: `retry-${existingJob.id}`,
      data: { ...input, jobRecordId: existingJob.id },
    } as any;

    const timeoutMs = 60_000;
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Retry processing timed out (60s)')), timeoutMs);
    });

    console.log(`[retry] Starting processor for job #${existingJob.id}, url=${input.url}`);
    Promise.race([captureProcessor(mockJob), timeout])
      .then(async (result) => {
        clearTimeout(timeoutId!);
        console.log(`[retry] Job #${existingJob.id} completed successfully`);
        try {
          await this.prisma.job.update({
            where: { id: existingJob.id },
            data: { status: 'success', output: JSON.stringify(result) },
          });
          void this.jobEvents.emitEnrichedJob(Number(id));
        } catch (dbErr: any) {
          console.error(`[retry] Failed to update job ${existingJob.id} to success:`, dbErr.message);
        }
      })
      .catch(async (err: any) => {
        clearTimeout(timeoutId!);
        console.error(`[retry] Job #${existingJob.id} failed:`, err.message);
        try {
          await this.prisma.job.update({
            where: { id: existingJob.id },
            data: { status: 'failed', error: err.message || String(err) },
          });
          void this.jobEvents.emitEnrichedJob(Number(id));
        } catch (dbErr: any) {
          console.error(`[retry] Failed to update job ${existingJob.id} to failed:`, dbErr.message);
        }
      });

    return { message: 'Job re-queued for direct processing' };
  }

  // ---- SSE 实时推送 ----

  @Sse('events')
  sseEvents(@Query('toolKey') toolKey?: string): Observable<MessageEvent> {
    return concat(
      // 1) 连接时先推送完整当前状态
      from(this.getInitialState(toolKey)).pipe(
        map(
          (data) =>
            ({
              data: { type: 'init', ...data },
              type: 'init',
            } as MessageEvent),
        ),
      ),
      // 2) 之后推送实时变更事件
      this.jobEvents.stream$.pipe(
        map((event: JobEvent) => ({
          data: event,
          type: event.type,
        } as MessageEvent)),
      ),
    );
  }

  private async getInitialState(toolKey?: string) {
    const where: any = {};
    if (toolKey) where.toolKey = toolKey;

    const pageSize = 20;

    const [items, total, totalJobs, runningCount, failedCount] =
      await Promise.all([
        this.prisma.job.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: pageSize,
        }),
        this.prisma.job.count({ where }),
        this.prisma.job.count({ where }),
        this.prisma.job.count({
          where: { ...where, status: { in: ['pending', 'running'] } },
        }),
        this.prisma.job.count({
          where: { ...where, status: 'failed' },
        }),
      ]);

    const jobsWithDiagnostics = await Promise.all(
      items.map(async (job) => {
        if (job.toolKey !== 'knowledge-capture') return job;
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
        return {
          ...job,
          diagnostics,
          diagnosticsSummary: diagnosticsSummary(diagnostics),
        };
      }),
    );

    // 成功率
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentJobs = await this.prisma.job.findMany({
      where: { ...where, createdAt: { gte: oneDayAgo } },
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
      jobs: jobsWithDiagnostics,
      total,
      metrics: {
        totalItems,
        todayItems,
        runningCount,
        successRate,
        failedCount,
      },
    };
  }
}
