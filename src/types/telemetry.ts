/** Structured JSON telemetry from agent communication file */
export interface AgentTelemetry {
  status?: 'idle' | 'running' | 'error';
  task?: string;
  message?: string;
  to?: string;      // Routing: agent_id | "all" | undefined (dashboard only)
  from?: string;     // Auto-filled by watcher from filename
}

/** Payload from the Tauri "agent:comms" event */
export interface CommsEventPayload {
  agent_id: string;
  lines: AgentTelemetry[];
}

export interface InboxMessage {
  from: string;
  from_label: string;
  message: string;
  task?: string | null;
  timestamp: string;
}

export interface InboxEventPayload {
  agent_id: string;
  lines: InboxMessage[];
}
