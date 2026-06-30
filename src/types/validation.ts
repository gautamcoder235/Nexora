export type ValidationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface ValidationStep {
  id: string;
  name: string;
  status: ValidationStatus;
  durationMs: number;
  exitCode?: number;
  output?: string;
  errorMessage?: string;
}

export interface ValidationProfile {
  id: string;
  name: string;
  steps: ValidationStep[];
  overallStatus: 'passed' | 'failed' | 'running' | 'idle';
  triggerType: 'commit' | 'manual' | 'agent_request';
  startedAt?: string;
  completedAt?: string;
}
