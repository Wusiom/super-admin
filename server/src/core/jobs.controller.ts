import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqService } from './bullmq.service';
import {
  deriveJobDiagnostics,
  diagnosticsSummary,
} from '../tools/knowledge-capture/diagnostics';

@Controller('api/jobs')
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullMqService: BullMqService,
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
    const job = await this.prisma.job.findUnique({ where: { id: Number(id) } });
    if (!job) return { error: 'Job not found' };

    await this.prisma.job.update({
      where: { id: Number(id) },
      data: { status: 'pending', error: null },
    });

    await this.bullMqService.retryJob(id, job.toolKey);
    return { message: 'Job re-queued' };
  }
}
