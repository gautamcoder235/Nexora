import React from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { ExecutionReviewWorkspace } from '../ExecutionReview/ExecutionReviewWorkspace';
import { FileCode, X } from 'lucide-react';

export const ReviewTab: React.FC = () => {
  const { selectedExecutionId, selectExecution } = useTeamStore();

  if (!selectedExecutionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-6 select-none font-mono">
        <FileCode className="w-6 h-6 mb-2 text-zinc-700 stroke-[1.5]" />
        <span className="text-[10px] text-center">Select an execution from the Executions tab to review its changes.</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ExecutionReviewWorkspace
        executionId={selectedExecutionId}
        onClose={() => selectExecution(null)}
      />
    </div>
  );
};

export default ReviewTab;
