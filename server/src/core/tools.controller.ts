import { Controller, Get } from '@nestjs/common';
import { ToolRegistry } from './tool-registry.service';

@Controller('api/tools')
export class ToolsController {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  @Get()
  async getTools() {
    return this.toolRegistry.getEnabledTools();
  }
}
