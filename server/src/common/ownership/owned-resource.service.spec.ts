import { NotFoundException } from '@nestjs/common';
import { OwnedResourceService } from './owned-resource.service';

describe('OwnedResourceService', () => {
  it('looks up a job by both its external id and the principal owner', async () => {
    const prisma = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    const service = new OwnedResourceService(prisma as any);

    await expect(service.getJobOrThrow(7, 12)).resolves.toEqual({ id: 7 });
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: 7, userId: 12 },
    });
  });

  it("returns not found instead of exposing another owner's knowledge item", async () => {
    const prisma = {
      knowledgeItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new OwnedResourceService(prisma as any);

    await expect(service.getKnowledgeItemOrThrow(7, 12)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.knowledgeItem.findFirst).toHaveBeenCalledWith({
      where: { id: 7, userId: 12 },
    });
  });
});
