import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OwnedResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async getJobOrThrow(id: number, userId: number) {
    const job = await this.prisma.job.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getKnowledgeItemOrThrow(id: number, userId: number) {
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { id, userId },
    });
    if (!item) throw new NotFoundException('Knowledge item not found');
    return item;
  }
}
