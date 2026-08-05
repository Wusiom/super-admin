import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ToolRegistry } from './tool-registry.service';
import { BullMqService } from './bullmq.service';
import { ToolsController } from './tools.controller';
import { JobsController } from './jobs.controller';
import { CleanupService } from './cleanup.service';
import { JobEventService } from './job-events.service';
import { OwnedResourceService } from '../common/ownership/owned-resource.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    ToolRegistry,
    BullMqService,
    CleanupService,
    JobEventService,
    OwnedResourceService,
  ],
  controllers: [ToolsController, JobsController],
  exports: [ToolRegistry, BullMqService, JobEventService, OwnedResourceService],
})
export class CoreModule {}
