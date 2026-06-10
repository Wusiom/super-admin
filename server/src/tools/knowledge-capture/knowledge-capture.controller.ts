import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiTokenGuard } from '../../core/auth/api-token.guard';
import { BullMqService } from '../../core/bullmq.service';
import { JobEventService } from '../../core/job-events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { captureProcessor } from './capture.processor';

class CaptureDto {
  @IsUrl({ require_tld: false }, { message: 'Invalid URL format' })
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  cookies?: string;

  @IsOptional()
  @IsString()
  localStorage?: string;

  @IsOptional()
  @IsString()
  pageHtml?: string;

  @IsOptional()
  @IsString()
  pageHtmlMeta?: string;
}

class UpdateKnowledgeItemDto {
  @IsNotEmpty()
  @IsString()
  contentMarkdown: string;
}

@Controller('api/tools/knowledge-capture')
export class KnowledgeCaptureController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullMqService: BullMqService,
    private readonly jobEvents: JobEventService,
  ) {
    void this.bullMqService;
  }

  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiTokenGuard)
  async capture(@Body() dto: CaptureDto) {
    const jobData: Record<string, any> = { url: dto.url };

    if (dto.cookies) {
      try {
        jobData.cookies = JSON.parse(dto.cookies);
      } catch {
        return { error: 'cookies 格式错误，需要合法的 JSON 数组' };
      }
    }

    if (dto.localStorage) {
      try {
        jobData.localStorage = JSON.parse(dto.localStorage);
      } catch {
        return { error: 'localStorage 格式错误，需要合法的 JSON 对象' };
      }
    }

    if (dto.pageHtml) {
      jobData.pageHtml = dto.pageHtml;
    }

    if (dto.pageHtmlMeta) {
      try {
        jobData.pageHtmlMeta = JSON.parse(dto.pageHtmlMeta);
      } catch {
        return { error: 'pageHtmlMeta 格式错误，需要合法的 JSON 对象' };
      }
    }

    if (!jobData.pageHtml) {
      const job = await this.prisma.job.create({
        data: {
          toolKey: 'knowledge-capture',
          status: 'failed',
          input: JSON.stringify(jobData),
          error: 'Page snapshot was not received from the extension',
        },
      });
      void this.jobEvents.emitEnrichedJob(job.id);
      return { jobId: job.id };
    }

    const job = await this.prisma.job.create({
      data: {
        toolKey: 'knowledge-capture',
        status: 'running',
        input: JSON.stringify(jobData),
      },
    });

    // 通知前端有新任务
    void this.jobEvents.emitEnrichedJob(job.id);

    const mockJob = {
      id: `direct-${job.id}`,
      data: { ...jobData, jobRecordId: job.id },
    } as any;

    const timeoutMs = 60_000;
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Capture processing timed out (60s)')), timeoutMs);
    });

    console.log(`[capture] Starting processor for job #${job.id}, url=${jobData.url}`);
    Promise.race([captureProcessor(mockJob), timeout])
      .then(async (result) => {
        clearTimeout(timeoutId!);
        console.log(`[capture] Job #${job.id} completed successfully`);
        try {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'success', output: JSON.stringify(result) },
          });
          void this.jobEvents.emitEnrichedJob(job.id);
        } catch (dbErr: any) {
          console.error(`[capture] Failed to update job ${job.id} to success:`, dbErr.message);
        }
      })
      .catch(async (err: any) => {
        clearTimeout(timeoutId!);
        console.error(`[capture] Job #${job.id} failed:`, err.message);
        try {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'failed', error: err.message || String(err) },
          });
          void this.jobEvents.emitEnrichedJob(job.id);
        } catch (dbErr: any) {
          console.error(`[capture] Failed to update job ${job.id} to failed:`, dbErr.message);
        }
      });

    return { jobId: job.id };
  }

  @Get('items')
  async listItems(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const [items, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        orderBy: { capturedAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      this.prisma.knowledgeItem.count(),
    ]);
    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  }

  @Get('items/:id')
  async getItem(@Param('id') id: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    return item;
  }

  @Put('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    const updated = await this.prisma.knowledgeItem.update({
      where: { id: Number(id) },
      data: { contentMarkdown: dto.contentMarkdown },
    });
    return updated;
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(@Param('id') id: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    await this.prisma.knowledgeItem.delete({ where: { id: Number(id) } });
  }
}
