import { AgentCapabilities } from "../types";

export interface AgentPlugin {
  id: string;
  name: string;
  cliCommand: string;
  defaultArgs: string[];
  capabilities: AgentCapabilities;
  checkCmd: string; // Command executable to query inside path
  installHelp: {
    url: string;
    command: string;
    instructions: string;
  };
  parseOutput(cleanText: string): string[]; // Parse logs for telemetry
  group?: string;
  projectId?: string;
  startupInstructions?: string[];
  rolePreset?: string;
}
