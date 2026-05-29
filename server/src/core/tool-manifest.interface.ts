import { Type } from '@nestjs/common';
import { Processor } from './processor.interface';

export interface ToolManifest {
  key: string;
  name: string;
  icon: string;
  route: string;
  module: Type<any>;
  processors: Processor[];
}
