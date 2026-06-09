export interface ValidationStepInfo {
  id: string;
  step_name: string;
  exit_code: number | null;
  duration_ms: number | null;
  status: string;
  artifact_id: string | null;
}

export interface ValidationRunInfo {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  steps: ValidationStepInfo[];
}

export interface ArtifactInfo {
  id: string;
  artifact_type: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  checksum: string;
}

export interface ExecutionLogInfo {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

export interface ExecutionMetadata {
  execution_id: string;
  task_id: string;
  agent_id: string;
  pid: number | null;
  head_commit: string | null;
  branch: string | null;
  started_at: string;
  ended_at: string | null;
  validation_run_id: string | null;
  status: string;
}

export interface MergeCandidateInfo {
  id: string;
  execution_id: string;
  patch_artifact_id: string;
  status: "pending_review" | "approved" | "rejected" | "merged" | "failed" | "merging" | "merge_failed";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}
