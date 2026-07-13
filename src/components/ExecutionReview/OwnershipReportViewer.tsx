import React from 'react';
import { ArtifactInfo } from '../../types/executionReview';

interface Props {
  artifacts: ArtifactInfo[];
}

export function OwnershipReportViewer({ artifacts }: Props) {
  // In reality, this would be parsed from an 'ownership_report' artifact
  // Since we haven't formally saved the report string to an artifact yet, we mock the UI pattern requested.
  const hasViolations = false;

  return (
    <div className="bg-bg-secondary border border-border-glass rounded-lg p-6">
      <div className="flex gap-8 mb-6 pb-6 border-b border-border-glass">
        <div>
          <div className="text-sm text-text-muted mb-1">Owned Files</div>
          <div className="text-xl font-bold text-text-primary">12</div>
        </div>
        <div>
          <div className="text-sm text-text-muted mb-1">Violations</div>
          <div className={`text-xl font-bold ${hasViolations ? 'text-error' : 'text-success'}`}>
            {hasViolations ? '1' : '0'}
          </div>
        </div>
        <div>
          <div className="text-sm text-text-muted mb-1">Ownership Hash</div>
          <div className="text-xl font-bold text-success">Valid</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 font-mono text-sm">
        <div className="flex justify-between items-center p-2 rounded hover:bg-bg-glass-light">
          <span className="text-text-secondary">src/components/Settings.tsx</span>
          <span className="text-success flex items-center gap-2">✓ Allowed</span>
        </div>
        <div className="flex justify-between items-center p-2 rounded hover:bg-bg-glass-light">
          <span className="text-text-secondary">src/hooks/useTheme.ts</span>
          <span className="text-success flex items-center gap-2">✓ Allowed</span>
        </div>
        {hasViolations && (
          <div className="flex justify-between items-center p-2 rounded bg-error/10 border border-error/30">
            <span className="text-error">src/main.ts</span>
            <span className="text-error font-bold flex items-center gap-2">✗ Outside Ownership Contract</span>
          </div>
        )}
      </div>
    </div>
  );
}
