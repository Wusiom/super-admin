import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ToolRegistry } from './tool-registry.service';
import { BullMqService } from './bullmq.service';
import { ToolsController } from './tools.controller';
import { JobsController } from './jobs.controller';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ToolRegistry, BullMqService, CleanupService],
  controllers: [ToolsController, JobsController],
  exports: [ToolRegistry, BullMqService],
})
export class CoreModule {}
