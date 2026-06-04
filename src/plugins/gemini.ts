import { AgentPlugin } from "./types";

export const geminiPlugin: AgentPlugin = {
  id: "gemini",
  name: "Gemini CLI",
  cliCommand: "gemini",
  defaultArgs: [],
  capabilities: { coding: false, review: true, testing: true, planning: true },
  checkCmd: "gemini",
  installHelp: {
    url: "https://ai.google.dev/gemini-api/docs",
    command: "npm install -g @google/generative-ai-cli",
    instructions: "Install the Generative AI command line interface globally using: npm install -g @google/generative-ai-cli. Ensure GEMINI_API_KEY is exported."
  },
  parseOutput: (cleanText: string): string[] => {
    const logs: string[] = [];
    const lines = cleanText.split(/[\r\n]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes("Thinking:")) {
        const match = trimmed.split("Thinking:").pop()?.trim();
        if (match) logs.push(`Gemini: Thinking: ${match}`);
      } else if (trimmed.includes("Output written to")) {
        const match = trimmed.split("Output written to").pop()?.trim();
        if (match) logs.push(`Gemini: Saved code generation to: ${match}`);
      }
    }
    
    return logs;
  }
};
