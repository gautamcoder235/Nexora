import { AgentPlugin } from "./types";

export const genericPlugin: AgentPlugin = {
  id: "generic",
  name: "Generic CLI Shell",
  cliCommand: navigator.userAgent.includes("Windows") ? "powershell.exe" : "/bin/bash",
  defaultArgs: [],
  capabilities: { coding: true, review: true, testing: true, planning: true },
  checkCmd: navigator.userAgent.includes("Windows") ? "powershell" : "bash",
  installHelp: {
    url: "https://tauri.app",
    command: "",
    instructions: "Uses your native operating system shell (bash/sh on Unix, Powershell/cmd on Windows) to execute arbitrary commands."
  },
  parseOutput: (_cleanText: string): string[] => {
    // Falls back to direct stdout without logging activity milestones
    return [];
  }
};
