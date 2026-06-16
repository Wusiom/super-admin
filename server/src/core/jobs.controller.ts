import { Controller, Get, Param, Post, Query, Sse } from '@nestjs/common';
import { concat, from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { captureProcessor } from '../tools/knowledge-capture/capture.processor';
import {
  deriveJobDiagnostics,
  diagnosticsSummary,
} from '../tools/knowledge-capture/diagnostics';
import { JobEvent, JobEventService } from './job-events.service';

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

  private parseOutputItemId(output: string | null): number | null {
    if (!output) return null;
    try {
      const parsed = JSON.parse(output);
      return typeof parsed?.itemId === 'number' ? parsed.itemId : null;
    } catch {
      return null;
    }
  }

  private async enrichJobs(items: any[]) {
    const itemIds = Array.from(
      new Set(
        items
          .filter((job) => job.toolKey === 'knowledge-capture')
          .map((job) => this.parseOutputItemId(job.output))
          .filter((id): id is number => typeof id === 'number'),
      ),
    );

    const knowledgeItems =
      itemIds.length > 0
        ? await this.prisma.knowledgeItem.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, title: true, capturedAt: true },
          })
        : [];
    const itemById = new Map(knowledgeItems.map((item) => [item.id, item]));

    return items.map((job) => {
      const itemId = this.parseOutputItemId(job.output);
      const diagnostics =
        job.toolKey === 'knowledge-capture'
          ? deriveJobDiagnostics(
              job,
              itemId ? (itemById.get(itemId) as any) : null,
            )
          : undefined;

      return {
        id: job.id,
        toolKey: job.toolKey,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        diagnostics,
        diagnosticsSummary: diagnostics
          ? diagnosticsSummary(diagnostics)
          : undefined,
      };
    });
  }

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

    return {
      jobs: await this.enrichJobs(items),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  @Get('metrics')
  async getMetrics(@Query('toolKey') toolKey?: string) {
    return this.jobEvents.getMetricsSnapshot(toolKey);
  }

  @Post(':id/retry')
  async retryJob(@Param('id') id: string) {
    const existingJob = await this.prisma.job.findUnique({
      where: { id: Number(id) },
    });
    if (!existingJob) return { error: 'Job not found' };

    let input: Record<string, any> = {};
    try {
      input = existingJob.input ? JSON.parse(existingJob.input) : {};
    } catch {
      return { error: 'Job input is corrupted' };
    }

    if (!input.url) return { error: 'Job input missing URL' };

    await this.prisma.job.update({
      where: { id: Number(id) },
      data: { status: 'running', error: null },
    });
    void this.jobEvents.emitEnrichedJob(Number(id));
    void this.jobEvents.emitMetricsSnapshot(existingJob.toolKey);

    const mockJob = {
      id: `retry-${existingJob.id}`,
      data: { ...input, jobRecordId: existingJob.id },
    } as any;

    const timeoutMs = 60_000;
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Retry processing timed out (60s)')),
        timeoutMs,
      );
    });

    console.log(
      `[retry] Starting processor for job #${existingJob.id}, url=${input.url}`,
    );
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
          void this.jobEvents.emitMetricsSnapshot(existingJob.toolKey);
        } catch (dbErr: any) {
          console.error(
            `[retry] Failed to update job ${existingJob.id} to success:`,
            dbErr.message,
          );
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
          void this.jobEvents.emitMetricsSnapshot(existingJob.toolKey);
        } catch (dbErr: any) {
          console.error(
            `[retry] Failed to update job ${existingJob.id} to failed:`,
            dbErr.message,
          );
        }
      });

    return { message: 'Job re-queued for direct processing' };
  }

  @Sse('events')
  sseEvents(@Query('toolKey') toolKey?: string): Observable<MessageEvent> {
    return concat(
      from(this.getInitialState(toolKey)).pipe(
        map(
          (data) =>
            ({
              data: { type: 'init', ...data },
              type: 'init',
            }) as MessageEvent,
        ),
      ),
      this.jobEvents.stream$.pipe(
        map(
          (event: JobEvent) =>
            ({
              data: event,
              type: event.type,
            }) as MessageEvent,
        ),
      ),
    );
  }

  private async getInitialState(toolKey?: string) {
    const where: any = {};
    if (toolKey) where.toolKey = toolKey;

    const [items, total, metrics] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.job.count({ where }),
      this.jobEvents.getMetricsSnapshot(toolKey),
    ]);

    return {
      jobs: await this.enrichJobs(items),
      total,
      metrics,
    };
  }
}
