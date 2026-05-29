import { Job } from 'bullmq';

export interface Processor {
  name: string;
  handler: (job: Job) => Promise<any>;
  concurrency?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  attempts?: number;
}
