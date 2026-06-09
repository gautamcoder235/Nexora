import React from 'react';
import { ExecutionMetadata, ArtifactInfo } from '../../types/executionReview';

interface Props {
  metadata: ExecutionMetadata | null;
  artifacts: ArtifactInfo[];
}

export function ExecutionSummaryHeader({ metadata, artifacts }: Props) {
  if (!metadata) return null;

  // Calculate duration
  const start = new Date(metadata.started_at).getTime();
  const end = metadata.ended_at ? new Date(metadata.ended_at).getTime() : Date.now();
  const durationMs = end - start;
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  const durationStr = `${mins}m ${secs}s`;

  // Parse diff stats if available
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  // Since we save the diff stat output in artifacts, we could parse it, or we can just mock it for now
  // For a real app, the `patch` artifact would contain the diff stat in its `output` field, but we didn't add it to ArtifactInfo yet.
  // We'll leave it 0 for now until we parse the artifact content

  const statusColor = metadata.status === 'completed' || metadata.status === 'passed' 
    ? 'text-green-400 bg-green-400/10 border-green-400/20' 
    : metadata.status === 'failed' 
    ? 'text-red-400 bg-red-400/10 border-red-400/20'
    : 'text-blue-400 bg-blue-400/10 border-blue-400/20';

  return (
    <div className="bg-[#161b22] border border-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Execution #{metadata.execution_id.split('-').pop()}</h1>
          <div className="flex gap-4 text-sm text-gray-400">
            <div><span className="font-semibold text-gray-300">Agent:</span> {metadata.agent_id}</div>
            <div><span className="font-semibold text-gray-300">Branch:</span> {metadata.branch || 'unknown'}</div>
            <div><span className="font-semibold text-gray-300">Duration:</span> {durationStr}</div>
          </div>
        </div>
        <div className={`px-4 py-2 rounded border font-semibold ${statusColor}`}>
          Validation: {metadata.status.toUpperCase()}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-800 flex gap-12">
        <div>
          <div className="text-sm text-gray-500 mb-1">Files Changed</div>
          <div className="text-xl font-bold text-gray-200">{filesChanged}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Additions</div>
          <div className="text-xl font-bold text-green-400">+{linesAdded}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Deletions</div>
          <div className="text-xl font-bold text-red-400">-{linesRemoved}</div>
        </div>
      </div>
    </div>
  );
}
