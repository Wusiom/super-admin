import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JobEventService } from './job-events.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobEvents: JobEventService,
  ) {}

  @Cron('*/5 * * * *')
  async cleanupStaleJobs() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // 标记过期的 pending 任务
    const stalePending = await this.prisma.job.findMany({
      where: { status: 'pending', createdAt: { lt: tenMinutesAgo } },
      select: { id: true },
    });

    if (stalePending.length > 0) {
      await this.prisma.job.updateMany({
        where: { id: { in: stalePending.map((j) => j.id) } },
        data: {
          status: 'failed',
          error: 'BullMQ enqueue failed: Redis unavailable or job expired',
        },
      });
      this.logger.warn(`Marked ${stalePending.length} stale pending jobs as failed`);
      // 推送 SSE 通知
      for (const { id } of stalePending) {
        void this.jobEvents.emitEnrichedJob(id);
      }
    }

    // 标记卡住的 running 任务（server 重启等场景）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stalledRunning = await this.prisma.job.findMany({
      where: { status: 'running', updatedAt: { lt: fiveMinutesAgo } },
      select: { id: true },
    });

    if (stalledRunning.length > 0) {
      await this.prisma.job.updateMany({
        where: { id: { in: stalledRunning.map((j) => j.id) } },
        data: {
          status: 'failed',
          error: 'Job appears stalled: processing did not complete within expected time',
        },
      });
      this.logger.warn(`Marked ${stalledRunning.length} stalled running jobs as failed`);
      for (const { id } of stalledRunning) {
        void this.jobEvents.emitEnrichedJob(id);
      }
    }
  }
}
