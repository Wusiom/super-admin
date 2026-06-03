import { Module, OnModuleInit } from '@nestjs/common';
import { KnowledgeCaptureController } from './knowledge-capture.controller';
import { ToolRegistry } from '../../core/tool-registry.service';
import { CoreModule } from '../../core/core.module';
import { AuthModule } from '../../core/auth/auth.module';
import { manifest } from './manifest';

@Module({
  imports: [CoreModule, AuthModule],
  controllers: [KnowledgeCaptureController],
})
export class KnowledgeCaptureModule implements OnModuleInit {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async onModuleInit() {
    await this.toolRegistry.register(manifest);
  }
}
