import { AgentPlugin } from "./types";

export const claudePlugin: AgentPlugin = {
  id: "claude",
  name: "Claude Code CLI",
  cliCommand: "npx",
  defaultArgs: ["-y", "@claudecode/cli"],
  capabilities: { coding: true, review: true, testing: false, planning: true },
  checkCmd: "npx",
  installHelp: {
    url: "https://docs.anthropic.com/en/docs/about-claude/claude-code",
    command: "npm install -g @claudecode/cli",
    instructions: "Requires Node.js. Install globally via 'npm install -g @claudecode/cli' or run using 'npx @claudecode/cli'."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Match typical Claude Code prompt tool actions
      if (trimmed.includes("Saved change to")) {
        const match = trimmed.split("Saved change to").pop()?.trim();
        if (match) logs.push(`Claude: Saved file changes: ${match}`);
      } else if (trimmed.includes("Created") && !trimmed.includes("Created at")) {
        const match = trimmed.split("Created").pop()?.trim();
        if (match && match.includes(".")) logs.push(`Claude: Created new file: ${match}`);
      } else if (trimmed.includes("Running:")) {
        const match = trimmed.split("Running:").pop()?.trim();
        if (match) logs.push(`Claude: Executing shell command: ${match}`);
      } else if (trimmed.includes("Tool Call:")) {
        const match = trimmed.split("Tool Call:").pop()?.trim();
        if (match) logs.push(`Claude: Running workspace tool: ${match}`);
      }
    }
    
    return logs;
  }
};
