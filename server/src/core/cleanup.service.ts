import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/5 * * * *')
  async cleanupStaleJobs() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = await this.prisma.job.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: tenMinutesAgo },
      },
      data: {
        status: 'failed',
        error: 'BullMQ enqueue failed: Redis unavailable or job expired',
      },
    });
    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} stale pending jobs as failed`);
    }
  }
}
