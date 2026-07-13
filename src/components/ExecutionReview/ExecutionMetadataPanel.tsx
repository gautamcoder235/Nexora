import React from 'react';
import { ExecutionMetadata, ValidationRunInfo } from '../../types/executionReview';

interface Props {
  metadata: ExecutionMetadata | null;
  validationRun: ValidationRunInfo | null;
}

export function ExecutionMetadataPanel({ metadata, validationRun }: Props) {
  if (!metadata) return null;

  const renderField = (label: string, value: string | number | null | undefined, monospace = false) => (
    <div className="mb-4">
      <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">{label}</div>
      <div className={`text-sm text-text-secondary ${monospace ? 'font-mono text-xs break-all bg-bg-tertiary p-1.5 rounded border border-border-glass' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );

  return (
    <div>
      {renderField('Execution ID', metadata.execution_id, true)}
      {renderField('Task ID', metadata.task_id, true)}
      {renderField('Agent Name', metadata.agent_id)}
      {renderField('PID', metadata.pid, true)}
      
      <div className="my-6 border-t border-border-glass"></div>
      
      {renderField('Branch', metadata.branch, true)}
      {renderField('Head Commit', metadata.head_commit, true)}
      
      <div className="my-6 border-t border-border-glass"></div>
      
      {renderField('Prompt Tokens', metadata.tokens_prompt?.toLocaleString())}
      {renderField('Completion Tokens', metadata.tokens_completion?.toLocaleString())}
      {renderField('Total Tokens', metadata.tokens_total?.toLocaleString())}
      {renderField('Estimated Cost', `$${metadata.estimated_cost?.toFixed(4)}`)}

      <div className="my-6 border-t border-border-glass"></div>

      {renderField('Created At', new Date(metadata.started_at).toLocaleString())}
      {renderField('Completed At', metadata.ended_at ? new Date(metadata.ended_at).toLocaleString() : null)}
      
      <div className="my-6 border-t border-border-glass"></div>

      {renderField('Validation Run ID', validationRun?.id || metadata.validation_run_id, true)}
    </div>
  );
}
