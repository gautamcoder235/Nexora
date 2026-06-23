import { invoke } from "@tauri-apps/api/core";

export interface ExecutionSummary {
  id: string;
  task_title: string;
  agent_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  validation_status: string | null;
  validation_steps_passed: number;
  validation_steps_total: number;
  current_gate: string | null;
  has_merge_candidate: boolean;
  merge_status: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_total: number;
  estimated_cost: number;
}

export interface ExecutionEventInfo {
  id: string;
  event_type: string;
  detail: string | null;
  timestamp: string;
}

export interface ExecutionDraft {
  id: string;
  repo_name: string;
  repo_path: string;
  task_title: string;
  task_description: string | null;
  agent_id: string;
  allowed_patterns: string[];
  created_at: string;
}

// ── Event Abstraction Layer ───────────────────────────────────────────────────
// This interface is the swap point for Phase 5.5 (Tauri Events).
// Current impl: polling. Future: TauriExecutionEvents that calls listen().

export type Unsubscribe = () => void;

export interface IExecutionEvents {
  /** Starts delivering execution list updates to the callback. Returns a cleanup fn. */
  subscribe(onUpdate: (executions: ExecutionSummary[]) => void): Unsubscribe;
}

import { listen, UnlistenFn } from "@tauri-apps/api/event";

export class TauriExecutionEvents implements IExecutionEvents {
  private _unlisten: UnlistenFn | null = null;
  private executionsMap = new Map<string, ExecutionSummary>();

  subscribe(onUpdate: (executions: ExecutionSummary[]) => void): Unsubscribe {
    let isSubscribed = true;

    // Load initial state
    swarmApi.listExecutions().then(execs => {
      if (!isSubscribed) return;
      execs.forEach(e => this.executionsMap.set(e.id, e));
      this.emitUpdate(onUpdate);
    });

    const setupListeners = async () => {
      const handleEvent = (event: any) => {
        const payload = event.payload as ExecutionSummary;
        this.executionsMap.set(payload.id, payload);
        this.emitUpdate(onUpdate);
      };

      const unlistenCreated = await listen("execution:created", handleEvent);
      const unlistenUpdated = await listen("execution:updated", handleEvent);
      const unlistenTerminated = await listen("execution:terminated", handleEvent);
      const unlistenValidation = await listen("validation:updated", handleEvent);

      this._unlisten = () => {
        unlistenCreated();
        unlistenUpdated();
        unlistenTerminated();
        unlistenValidation();
      };
    };

    setupListeners();

    return () => {
      isSubscribed = false;
      if (this._unlisten) {
        this._unlisten();
        this._unlisten = null;
      }
    };
  }

  private emitUpdate(onUpdate: (executions: ExecutionSummary[]) => void) {
    const execs = Array.from(this.executionsMap.values()).sort((a, b) => {
      const aTime = new Date(a.started_at || 0).getTime();
      const bTime = new Date(b.started_at || 0).getTime();
      return bTime - aTime;
    });
    onUpdate(execs);
  }
}

// Factory — swap this in Phase 5.5 for TauriExecutionEvents
export function createExecutionEvents(): IExecutionEvents {
  return new TauriExecutionEvents();
}

// ── Direct invoke helpers ─────────────────────────────────────────────────────

export const swarmApi = {
  listExecutions: (limit = 50) =>
    invoke<ExecutionSummary[]>("list_executions", { limit }),

  terminateExecution: (executionId: string) =>
    invoke<void>("terminate_execution", { executionId }),

  getExecutionEvents: (executionId: string) =>
    invoke<ExecutionEventInfo[]>("get_execution_events", { executionId }),

  saveDraft: (draft: Omit<ExecutionDraft, "id" | "created_at">) =>
    invoke<ExecutionDraft>("save_execution_draft", {
      repoName: draft.repo_name,
      repoPath: draft.repo_path,
      taskTitle: draft.task_title,
      taskDescription: draft.task_description ?? "",
      agentId: draft.agent_id,
      allowedPatterns: draft.allowed_patterns,
    }),

  listDrafts: () => invoke<ExecutionDraft[]>("list_execution_drafts"),

  discardDraft: (draftId: string) =>
    invoke<void>("discard_execution_draft", { draftId }),

  approveMerge: (executionId: string) =>
    invoke<void>("review_merge_candidate", { executionId, action: "approve" }),

  rejectMerge: (executionId: string) =>
    invoke<void>("review_merge_candidate", { executionId, action: "reject" }),
};
