import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job, QueueEvents, UnrecoverableError } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Processor } from './processor.interface';

@Injectable()
export class BullMqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullMqService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  private readonly connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  };

  constructor(private readonly prisma: PrismaService) {}

  async registerProcessor(toolKey: string, config: Processor): Promise<void> {
    const queueName = `tool-${toolKey}-${config.name}`;
    this.logger.log(`Registering queue: ${queueName}`);

    const queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: config.attempts ?? 3,
        backoff: config.backoff ?? { type: 'exponential', delay: 1000 },
      },
    });
    this.queues.set(queueName, queue);

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        this.logger.log(`Processing job ${job.id} in ${queueName}`);

        // 用 jobRecordId（DB 主键）而非 bullmqJobId，避免竞态条件：
        // controller 是 create job → addJob → update bullmqJobId，
        // Worker 可能在 bullmqJobId 写入 DB 之前就开始执行
        const dbJobId = job.data.jobRecordId;
        await this.prisma.job.updateMany({
          where: { id: dbJobId },
          data: { status: 'running', bullmqJobId: job.id },
        });

        try {
          const result = await config.handler(job);
          return result;
        } catch (err: any) {
          const nonRetriable = ['EXTRACTION_FAILED', 'BLOCKED', 'EMPTY_CONTENT'];
          if (nonRetriable.includes(err.jobErrorType)) {
            throw new UnrecoverableError(err.message);
          }
          throw err;
        }
      },
      {
        connection: this.connection,
        concurrency: config.concurrency ?? 1,
      },
    );
    this.workers.set(queueName, worker);

    const events = new QueueEvents(queueName, {
      connection: this.connection,
    });

    events.on('completed', async ({ jobId, returnvalue }) => {
      this.logger.log(`Job ${jobId} completed`);
      await this.prisma.job.updateMany({
        where: { bullmqJobId: jobId, status: 'running' },
        data: {
          status: 'success',
          output: returnvalue ? JSON.stringify(returnvalue) : null,
        },
      });
    });

    events.on('failed', async ({ jobId, failedReason }) => {
      this.logger.warn(`Job ${jobId} failed: ${failedReason}`);
      await this.prisma.job.updateMany({
        where: { bullmqJobId: jobId, status: 'running' },
        data: { status: 'failed', error: failedReason },
      });
    });

    this.queueEvents.set(queueName, events);
  }

  async addJob(
    toolKey: string,
    processorName: string,
    data: any,
  ): Promise<string> {
    const queueName = `tool-${toolKey}-${processorName}`;
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue not found: ${queueName}`);
    const job = await queue.add(processorName, data);
    return job.id!;
  }

  async retryJob(jobId: string, toolKey: string): Promise<void> {
    // 将旧记录重置为 pending
    const existing = await this.prisma.job.update({
      where: { id: Number(jobId) },
      data: { status: 'pending', error: null, bullmqJobId: null },
    });

    const queueName = `tool-${toolKey}-capture`;
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue not found: ${queueName}`);

    const input = existing.input ? JSON.parse(existing.input) : {};
    await queue.add('capture', {
      ...input,
      jobRecordId: existing.id,
    });

    // bullmqJobId 由 Worker 在处理时自动同步，此处无需再写
  }

  async onModuleDestroy() {
    for (const events of this.queueEvents.values()) await events.close();
    for (const worker of this.workers.values()) await worker.close();
    for (const queue of this.queues.values()) await queue.close();
  }
}
