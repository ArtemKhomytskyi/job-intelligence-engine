import type { RunFullPipelineInput, RunFullPipelineResult } from './models.js';

export interface FullPipelineRunner {
  execute(input: RunFullPipelineInput): Promise<RunFullPipelineResult>;
}

export class ActivePipelineRunError extends Error {
  public constructor() {
    super('A pipeline run is already active.');
    this.name = 'ActivePipelineRunError';
  }
}

export class SingleActivePipelineRunner implements FullPipelineRunner {
  private active = false;

  public constructor(private readonly pipeline: FullPipelineRunner) {}

  public isActive(): boolean {
    return this.active;
  }

  public async execute(
    input: RunFullPipelineInput,
  ): Promise<RunFullPipelineResult> {
    if (this.active) throw new ActivePipelineRunError();
    this.active = true;
    try {
      return await this.pipeline.execute(input);
    } finally {
      this.active = false;
    }
  }
}
