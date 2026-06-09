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
    <div className="bg-[#161b22] border border-gray-800 rounded-lg p-6">
      <div className="flex gap-8 mb-6 pb-6 border-b border-gray-800">
        <div>
          <div className="text-sm text-gray-500 mb-1">Owned Files</div>
          <div className="text-xl font-bold text-gray-200">12</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Violations</div>
          <div className={`text-xl font-bold ${hasViolations ? 'text-red-500' : 'text-green-500'}`}>
            {hasViolations ? '1' : '0'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Ownership Hash</div>
          <div className="text-xl font-bold text-green-500">Valid</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 font-mono text-sm">
        <div className="flex justify-between items-center p-2 rounded hover:bg-gray-800">
          <span className="text-gray-300">src/components/Settings.tsx</span>
          <span className="text-green-400 flex items-center gap-2">✓ Allowed</span>
        </div>
        <div className="flex justify-between items-center p-2 rounded hover:bg-gray-800">
          <span className="text-gray-300">src/hooks/useTheme.ts</span>
          <span className="text-green-400 flex items-center gap-2">✓ Allowed</span>
        </div>
        {hasViolations && (
          <div className="flex justify-between items-center p-2 rounded bg-red-500/10 border border-red-500/30">
            <span className="text-red-400">src/main.ts</span>
            <span className="text-red-400 font-bold flex items-center gap-2">✗ Outside Ownership Contract</span>
          </div>
        )}
      </div>
    </div>
  );
}
