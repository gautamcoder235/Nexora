import { AgentPlugin } from "./types";

export const opencodePlugin: AgentPlugin = {
  id: "opencode",
  name: "OpenCode CLI",
  cliCommand: "opencode",
  defaultArgs: [],
  capabilities: { coding: true, review: true, testing: true, planning: true },
  checkCmd: "opencode",
  installHelp: {
    url: "https://github.com/opencode",
    command: "npm install -g opencode",
    instructions: "Requires Node.js or the native executable. Install globally via 'npm install -g opencode' or follow the setup instructions in the OpenCode repository."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Basic detection of OpenCode action keywords
      if (trimmed.includes("Executing") || trimmed.includes("Running command")) {
        logs.push(`OpenCode: Executing command...`);
      } else if (trimmed.includes("File edited") || trimmed.includes("Saved")) {
        logs.push(`OpenCode: Modifying file context.`);
      }
    }
    
    return logs;
  }
};
