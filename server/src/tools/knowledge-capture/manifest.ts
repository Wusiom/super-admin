import { KnowledgeCaptureModule } from './knowledge-capture.module';
import { captureProcessor } from './capture.processor';
import { ToolManifest } from '../../core/tool-manifest.interface';

export const manifest: ToolManifest = {
  key: 'knowledge-capture',
  name: '知识采集',
  icon: 'DocumentCopy',
  route: 'knowledge/capture',
  module: KnowledgeCaptureModule,
  processors: [
    {
      name: 'capture',
      handler: captureProcessor,
      concurrency: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  ],
};
