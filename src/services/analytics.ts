import { EventBus } from "../core/events";

export interface MetricEvent {
  metric: 'workspace_changed' | 'terminal_spawned' | 'agent_started' | 'agent_message' | 'commands_executed';
  value?: number;
  metadata?: Record<string, any>;
  timestamp: string;
}

export class AnalyticsService {
  private static logs: MetricEvent[] = [];

  /**
   * Initialize subscriptions to record telemetry from the EventBus
   */
  static init() {
    // Log workspace changes
    EventBus.subscribe("workspace:changed", (payload) => {
      this.logEvent("workspace_changed", 1, { workspaceId: payload.workspaceId });
    });

    // Log terminal spawning
    EventBus.subscribe("terminal:spawned", (payload) => {
      this.logEvent("terminal_spawned", 1, { sessionId: payload.sessionId, projectId: payload.projectId });
    });

    // Log agent status changes
    EventBus.subscribe("agent:state", (payload) => {
      if (payload.status === 'running') {
        this.logEvent("agent_started", 1, { agentId: payload.agentId, command: payload.command });
      }
    });

    // Log agent-to-agent or supervisor messaging
    EventBus.subscribe("agent:message", (payload) => {
      this.logEvent("agent_message", 1, { 
        from: payload.from, 
        to: payload.to, 
        messageLength: payload.message?.length || 0 
      });
    });

    // Log commands
    EventBus.subscribe("command:executed", (payload) => {
      this.logEvent("commands_executed", 1, { command: payload.id, args: payload.args });
    });
    
    console.log("[AnalyticsService] Multi-Agent Orchestrator Telemetry Active.");
  }

  /**
   * Log a new telemetry event
   */
  static logEvent(
    metric: MetricEvent['metric'],
    value: number = 1,
    metadata?: Record<string, any>
  ) {
    const event: MetricEvent = {
      metric,
      value,
      metadata,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(event);
    
    console.log(`%c[Orchestrator Telemetry] ${metric.toUpperCase()}`, "color: #10b981; font-weight: bold;", {
      value,
      metadata,
      time: event.timestamp
    });
  }

  /**
   * Retrieve all recorded events
   */
  static getLogs(): MetricEvent[] {
    return this.logs;
  }
}
