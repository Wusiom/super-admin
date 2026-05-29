import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqService } from './bullmq.service';

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

    return { jobs: items, total, page: Number(page), pageSize: Number(pageSize) };
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
