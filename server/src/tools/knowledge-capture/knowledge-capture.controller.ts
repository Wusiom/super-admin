import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { IsUrl, IsString, IsOptional } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { BullMqService } from '../../core/bullmq.service';
import { ApiTokenGuard } from '../../core/auth/api-token.guard';
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
}

@Controller('api/tools/knowledge-capture')
export class KnowledgeCaptureController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullMqService: BullMqService,
  ) {}

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

    // 创建 DB 记录
    const job = await this.prisma.job.create({
      data: {
        toolKey: 'knowledge-capture',
        status: 'running',
        input: JSON.stringify(jobData),
      },
    });

    // 同步执行采集，避免 BullMQ 幽灵 Worker 问题
    const mockJob = {
      id: `direct-${job.id}`,
      data: { ...jobData, jobRecordId: job.id },
    } as any;

    captureProcessor(mockJob)
      .then(async (result) => {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'success', output: JSON.stringify(result) },
        });
      })
      .catch(async (err: any) => {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: err.message },
        });
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
