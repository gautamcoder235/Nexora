export type ChangesetStatus = 'draft' | 'pending' | 'accepted' | 'rejected' | 'applied' | 'rolled_back';
export type FileChangeStatus = 'pending' | 'accepted' | 'rejected';
export type CommentSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKER';
export type ChangeSource = 'Builder Agent' | 'Reviewer Agent' | 'User Edit' | 'System Refactor';

export interface ChangesetFile {
  id: string;
  changeset_id: string;
  path: string;
  old_content: string;
  new_content: string;
  patch: string;
  change_source: ChangeSource;
  status: FileChangeStatus;
}

export interface ReviewComment {
  id: string;
  changeset_id: string;
  path: string | null;
  line_number: number | null;
  agent_name: string;
  comment: string;
  severity: CommentSeverity;
  created_at: string;
}

export interface Changeset {
  id: string;
  title: string;
  status: ChangesetStatus;
  origin_agent_id: string;
  created_at: string;
  explanation: string;
  files: ChangesetFile[];
  comments: ReviewComment[];
  validationStatus?: 'passed' | 'failed' | 'running' | 'idle';
}
