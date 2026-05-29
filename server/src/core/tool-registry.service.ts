import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ToolManifest } from './tool-manifest.interface';
import { BullMqService } from './bullmq.service';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private manifests: Map<string, ToolManifest> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly bullMqService: BullMqService,
  ) {}

  async register(manifest: ToolManifest): Promise<void> {
    if (this.manifests.has(manifest.key)) return;

    this.logger.log(`Registering tool: ${manifest.key}`);

    await this.prisma.tool.upsert({
      where: { key: manifest.key },
      update: {
        name: manifest.name,
        icon: manifest.icon,
        route: manifest.route,
      },
      create: {
        key: manifest.key,
        name: manifest.name,
        icon: manifest.icon,
        route: manifest.route,
      },
    });

    for (const processor of manifest.processors) {
      await this.bullMqService.registerProcessor(manifest.key, processor);
    }

    this.manifests.set(manifest.key, manifest);
  }

  getEnabledTools() {
    return this.prisma.tool.findMany({ where: { enabled: true } });
  }
}
