import { AgentPlugin } from "./types";

export const nexoraPlugin: AgentPlugin = {
  id: "nexora",
  name: "Nexora CLI (nx)",
  cliCommand: "nx",
  defaultArgs: [],
  capabilities: { coding: true, review: true, testing: true, planning: true },
  checkCmd: "nx",
  installHelp: {
    url: "https://nexora.dev",
    command: "cargo install --path ./cli",
    instructions: "Install Nexora CLI globally by building from the workspace directory: 'cargo install --path ./cli'."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse Nexora CLI logs
      if (trimmed.includes("Dispatching command:") || trimmed.includes("Running command")) {
        const match = trimmed.split(/Dispatching command:|Running command/).pop()?.trim();
        if (match) logs.push(`Nexora: Running command: ${match}`);
      } else if (trimmed.includes("Error:") || trimmed.includes("Code: NX")) {
        logs.push(`Nexora Error encountered.`);
      } else if (trimmed.includes("Conventional Commit") || trimmed.includes("Commit message")) {
        logs.push(`Nexora: Generated Conventional Commit message.`);
      }
    }
    
    return logs;
  }
};
