import { AgentPlugin } from "./types";

const isWindows = typeof window !== 'undefined' && (
  window.navigator.userAgent.toLowerCase().includes('win') ||
  window.navigator.platform.toLowerCase().includes('win')
);

export const agyPlugin: AgentPlugin = {
  id: "agy",
  name: "Antigravity CLI (agy)",
  cliCommand: "agy",
  defaultArgs: [],
  capabilities: { coding: true, review: true, testing: true, planning: true },
  checkCmd: "agy",
  installHelp: {
    url: "https://antigravity.google",
    command: isWindows 
      ? "powershell -Command \"irm https://antigravity.google/cli/install.ps1 | iex\""
      : "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    instructions: "Google's Antigravity development CLI. Install globally to invoke using 'agy' command."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse typical Antigravity tool / workspace updates
      if (trimmed.includes("Saved file:") || trimmed.includes("Saved change to")) {
        const match = trimmed.split(/Saved file:|Saved change to/).pop()?.trim();
        if (match) logs.push(`Antigravity: Saved file changes: ${match}`);
      } else if (trimmed.includes("Invoking subagent:") || trimmed.includes("Spawning subagent")) {
        const match = trimmed.split(/Invoking subagent:|Spawning subagent/).pop()?.trim();
        if (match) logs.push(`Antigravity: Spawned subagent: ${match}`);
      } else if (trimmed.includes("Calling tool:") || trimmed.includes("Running tool:")) {
        const match = trimmed.split(/Calling tool:|Running tool:/).pop()?.trim();
        if (match) logs.push(`Antigravity: Executed workspace tool: ${match}`);
      }
    }
    
    return logs;
  }
};
