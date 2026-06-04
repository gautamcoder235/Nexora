import { AgentPlugin } from "./types";

export const codexPlugin: AgentPlugin = {
  id: "codex",
  name: "Codex CLI",
  cliCommand: "codex",
  defaultArgs: ["--", "--test-first"],
  capabilities: { coding: true, review: false, testing: true, planning: false },
  checkCmd: "codex",
  installHelp: {
    url: "https://github.com/openai/codex-cli",
    command: "npm install -g codex-cli-tool",
    instructions: "Install the Codex automated testing agent globally using: npm install -g codex-cli-tool."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes("Ran tests:")) {
        const match = trimmed.split("Ran tests:").pop()?.trim();
        if (match) logs.push(`Codex: Executed tests: ${match}`);
      } else if (trimmed.includes("Test failed:")) {
        const match = trimmed.split("Test failed:").pop()?.trim();
        if (match) logs.push(`Codex: Assertion Error: ${match}`);
      } else if (trimmed.includes("Test passed") || trimmed.includes("All tests passed")) {
        logs.push("Codex: All unit tests passed successfully.");
      }
    }
    
    return logs;
  }
};
