import { AgentSessionState } from "./types";
import { EventBus } from "../core/events";

export class AgentManager {
  private static session: AgentSessionState = {
    currentGoal: "",
    tasks: [],
    logs: [],
    isActive: false,
  };

  /**
   * Fetch current agent workflow session
   */
  static getSession(): AgentSessionState {
    return this.session;
  }

  /**
   * Initiate an autonomous plan to achieve a goal
   */
  static async startGoal(goal: string): Promise<void> {
    this.session = {
      currentGoal: goal,
      tasks: [
        {
          id: "task-1",
          title: "Scan workspace imports",
          description: "Traverse directory tree and parse dependency files",
          status: "pending",
          assignedTo: "manager",
        },
        {
          id: "task-2",
          title: "Draft modification diffs",
          description: "Generate modifications based on context files",
          status: "pending",
          assignedTo: "coder",
          dependencies: ["task-1"],
        },
        {
          id: "task-3",
          title: "Perform static code analysis",
          description: "Verify compilation checks and lint rules",
          status: "pending",
          assignedTo: "reviewer",
          dependencies: ["task-2"],
        }
      ],
      logs: [`[Manager] Starting agent session to achieve: "${goal}"`],
      isActive: true,
    };

    EventBus.publish("agent:started", { goal });
    EventBus.publish("command:executed", { id: "agentStartGoal", args: { goal } });
    
    // Launch simulation thread loop
    this.runSimulatedLoop();
  }

  /**
   * Simulate a multi-agent thinking/execution loop
   */
  private static async runSimulatedLoop() {
    const roles: Record<import("./types").AgentRole, string> = {
      manager: "Orchestrator Agent",
      coder: "Coding Specialist",
      reviewer: "Quality Assurance Agent",
      task_runner: "Task Executor Agent"
    };

    for (const task of this.session.tasks) {
      task.status = "in_progress";
      this.session.logs.push(`[${roles[task.assignedTo || "manager"]}] Starting task: "${task.title}"`);
      EventBus.publish("agent:log", { logs: this.session.logs });
      
      // Simulate task latency
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      task.status = "completed";
      this.session.logs.push(`[${roles[task.assignedTo || "manager"]}] Successfully completed: "${task.title}"`);
      EventBus.publish("agent:log", { logs: this.session.logs });
    }

    this.session.isActive = false;
    this.session.logs.push("[Manager] Agent loop finished. Goal reached!");
    EventBus.publish("agent:finished", { goal: this.session.currentGoal });
  }
}
