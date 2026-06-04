import { AgentPlugin } from "./types";

export const aiderPlugin: AgentPlugin = {
  id: "aider",
  name: "Aider Coding Assistant",
  cliCommand: "aider",
  defaultArgs: ["--auto-commit"],
  capabilities: { coding: true, review: true, testing: false, planning: false },
  checkCmd: "aider",
  installHelp: {
    url: "https://aider.chat/docs/install.html",
    command: "pip install aider-chat",
    instructions: "Requires Python. Install using: pip install -U aider-chat. Ensure you set your OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Match Aider context adds, edits, and auto-commits
      if (trimmed.includes("Added") && trimmed.includes("to the chat")) {
        const match = trimmed.replace("Added", "").replace("to the chat", "").trim();
        logs.push(`Aider: Added file to AI chat context: ${match}`);
      } else if (trimmed.includes("Commit") && trimmed.includes("committed")) {
        logs.push(`Aider: Created git commit auto-commit changes.`);
      } else if (trimmed.includes("Applied edits to")) {
        const match = trimmed.split("Applied edits to").pop()?.trim();
        if (match) logs.push(`Aider: Applied code modifications to: ${match}`);
      }
    }
    
    return logs;
  }
};
