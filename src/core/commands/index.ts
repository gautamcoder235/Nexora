import { useOrchestratorStore } from "../../stores/orchestratorStore";
import { EventBus } from "../events";

export interface Command<Args = any, Result = any> {
  id: string;
  name: string;
  execute(args: Args): Promise<Result>;
}

export class CommandRegistry {
  private static commands: Record<string, Command> = {};

  /**
   * Register a command unit
   */
  static register(command: Command): void {
    this.commands[command.id] = command;
  }

  /**
   * Fetch a command by ID
   */
  static get(id: string): Command | undefined {
    return this.commands[id];
  }

  /**
   * Run a registered command asynchronously
   */
  static async execute<Args = any, Result = any>(id: string, args?: Args): Promise<Result> {
    const command = this.get(id);
    if (!command) {
      throw new Error(`Command "${id}" is not registered in the Registry.`);
    }

    EventBus.publish("command:executed", { id, args });
    return command.execute(args) as Promise<Result>;
  }

  /**
   * Register default orchestrator command handlers
   */
  static init() {
    this.register(new SpawnTerminalCommand());
    this.register(new KillTerminalCommand());
    this.register(new RunAgentCommand());
    console.log("[CommandRegistry] Registered default Orchestrator command triggers.");
  }
}

// ==========================================
// Concrete Command Implementations
// ==========================================

export class SpawnTerminalCommand implements Command<{ projectId: string; agentId?: string; command?: string; args?: string[] }, string | undefined> {
  id = "spawnTerminal";
  name = "Spawn Terminal Process";

  async execute(args: { projectId: string; agentId?: string; command?: string; args?: string[] }): Promise<string | undefined> {
    if (!args || !args.projectId) {
      throw new Error("Cannot execute spawnTerminal: missing projectId argument.");
    }
    return await useOrchestratorStore.getState().spawnTerminal(
      args.projectId,
      args.agentId,
      args.command,
      args.args
    );
  }
}

export class KillTerminalCommand implements Command<{ sessionId: string }, void> {
  id = "killTerminal";
  name = "Kill Terminal Session";

  async execute(args: { sessionId: string }): Promise<void> {
    if (!args || !args.sessionId) {
      throw new Error("Cannot execute killTerminal: missing sessionId argument.");
    }
    await useOrchestratorStore.getState().killTerminal(args.sessionId);
  }
}

export class RunAgentCommand implements Command<{ agentId: string; projectId: string }, string | undefined> {
  id = "runAgent";
  name = "Launch Agent CLI";

  async execute(args: { agentId: string; projectId: string }): Promise<string | undefined> {
    if (!args || !args.agentId || !args.projectId) {
      throw new Error("Cannot execute runAgent: missing agentId or projectId arguments.");
    }
    return await useOrchestratorStore.getState().spawnTerminal(args.projectId, args.agentId);
  }
}
