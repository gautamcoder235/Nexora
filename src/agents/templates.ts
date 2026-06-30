import { AgentProfile } from "../types";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agents: Omit<AgentProfile, "id" | "status" | "runtimeSeconds" | "lastActive" | "terminalSessionIds">[];
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: "frontend",
    name: "Frontend Development Team",
    description: "Claude Code (Coding/Planning) + Gemini CLI (Review/Testing)",
    agents: [
      {
        name: "Claude Code CLI",
        groupId: "Frontend Team",
        cliCommand: "npx",
        arguments: ["-y", "@claudecode/cli"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: false, testing: false, planning: true }
      },
      {
        name: "Gemini CLI",
        groupId: "Frontend Team",
        cliCommand: "gemini",
        arguments: [],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: false, review: true, testing: true, planning: false }
      }
    ]
  },
  {
    id: "backend",
    name: "Backend Development Team",
    description: "Aider (Coding/Review) + Codex CLI (Unit Testing)",
    agents: [
      {
        name: "Aider Coding Assistant",
        groupId: "Backend Team",
        cliCommand: "aider",
        arguments: ["--auto-commit"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: true, testing: false, planning: false }
      },
      {
        name: "Codex CLI",
        groupId: "Backend Team",
        cliCommand: "codex",
        arguments: ["--", "--test-first"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: false, testing: true, planning: false }
      }
    ]
  },
  {
    id: "fullstack",
    name: "Full Stack Swarm Team",
    description: "Claude Code (Planning/Code) + Aider (Code/Review) + Gemini CLI (Review)",
    agents: [
      {
        name: "Claude Code CLI",
        groupId: "Full Stack Team",
        cliCommand: "npx",
        arguments: ["-y", "@claudecode/cli"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: false, testing: false, planning: true }
      },
      {
        name: "Aider Coding Assistant",
        groupId: "Full Stack Team",
        cliCommand: "aider",
        arguments: ["--auto-commit"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: true, testing: false, planning: false }
      },
      {
        name: "Gemini CLI",
        groupId: "Full Stack Team",
        cliCommand: "gemini",
        arguments: [],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: false, review: true, testing: false, planning: true }
      }
    ]
  },
  {
    id: "testing",
    name: "Automated Testing Team",
    description: "Codex CLI (Testing) + Gemini CLI (Quality Review/Testing)",
    agents: [
      {
        name: "Codex CLI",
        groupId: "Testing Team",
        cliCommand: "codex",
        arguments: ["--", "--test-first"],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: true, review: false, testing: true, planning: false }
      },
      {
        name: "Gemini CLI",
        groupId: "Testing Team",
        cliCommand: "gemini",
        arguments: [],
        env: {},
        projectId: null,
        taskId: null,
        capabilities: { coding: false, review: true, testing: true, planning: true }
      }
    ]
  }
];
