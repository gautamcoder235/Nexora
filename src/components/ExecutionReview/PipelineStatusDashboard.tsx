import React from 'react';
import { ValidationRunInfo } from '../../types/executionReview';

interface Props {
  run: ValidationRunInfo | null;
}

export function PipelineStatusDashboard({ run }: Props) {
  if (!run) {
    return <div className="text-text-muted italic">No validation pipeline data found for this execution.</div>;
  }

  return (
    <div className="bg-bg-secondary border border-border-glass rounded-lg p-6">
      <div className="flex flex-col gap-4">
        {run.steps.map((step, idx) => {
          const isPass = step.status === 'passed';
          const isFail = step.status === 'failed';
          const icon = isPass ? '✓' : isFail ? '✗' : '⟳';
          const color = isPass ? 'text-success' : isFail ? 'text-error' : 'text-accent-primary';

          return (
            <div key={step.id} className="flex items-center gap-4 group">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-bg-tertiary border border-border-glass ${color}`}>
                {icon}
              </div>
              <div className="flex-1">
                <div className="font-medium text-text-primary">{step.step_name}</div>
                <div className="text-xs text-text-muted">
                  {step.duration_ms ? `${step.duration_ms}ms` : 'Pending'} 
                  {step.exit_code !== null ? ` • Exit Code: ${step.exit_code}` : ''}
                </div>
              </div>
              {/* Future: Add button to view specific step logs or artifact */}
              <button className="opacity-0 group-hover:opacity-100 px-3 py-1 text-xs bg-bg-secondary hover:bg-bg-glass-hover text-text-primary rounded transition-opacity">
                View Details
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
