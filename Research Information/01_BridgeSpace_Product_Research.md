# 01 — BridgeSpace Product Research

> Internet research on BridgeSpace — the AI-native Application Development Environment by BridgeMind

---

## What Is BridgeSpace?

**BridgeSpace** is an AI-native **Application Development Environment (ADE)** built by **BridgeMind**. It represents a paradigm shift from traditional IDEs by being designed from the ground up around AI agents rather than retrofitting AI capabilities onto existing editor architectures.

Unlike VS Code + Copilot or Cursor (which are AI-enhanced *editors*), BridgeSpace is an **agent-first workroom** where AI agents are first-class citizens in the development workflow.

---

## Target Audience

- Full-stack developers who want AI-assisted development beyond autocomplete
- Teams looking for multi-agent orchestration in their development workflow
- Developers who want a unified workspace (terminal + editor + AI + project management)
- Early adopters of the ADE (Application Development Environment) paradigm

---

## Key Features

### 1. BridgeSwarm — Multi-Agent Orchestration
- **16 specialized AI agents** that can be orchestrated together
- Each agent has a specific role (coding, reviewing, testing, documentation, etc.)
- Agents can collaborate on complex tasks, dividing work intelligently
- Swarm coordination happens through the BridgeMCP protocol

### 2. BridgeMemory — Markdown Knowledge Graph
- Project knowledge stored as **markdown files** with structured metadata
- Acts as persistent context for AI agents across sessions
- Version-controllable and human-readable
- Agents can read, write, and query the knowledge graph
- No external database dependency — everything is local files

### 3. BridgeVoice — Voice Interface
- Voice-driven development commands
- Natural language interaction with the development environment
- Hands-free coding and navigation

### 4. Integrated Workroom
- Unified workspace combining terminal, editor, file explorer, and AI panels
- **Zero Context Switching** — everything is accessible without leaving the environment
- Kanban boards for task management built directly into the IDE
- Agent activity panels showing real-time AI agent status

---

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | ✅ Supported |
| Windows | ✅ Supported |
| Linux | ✅ Supported |

---

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Desktop Framework | **Tauri** | Rust-based desktop framework for cross-platform apps |
| Backend | **Rust** | Core engine, PTY management, system-level operations |
| AI Protocol | **MCP (Model Context Protocol)** | Via BridgeMCP — standardized AI agent communication |
| AI Models | **Model-Agnostic** | Works with multiple AI providers, not locked to one |
| Frontend | Web Technologies | Rendered in Tauri's WebView |

### Why Tauri?
- **Smaller binary size** compared to Electron (~10MB vs ~150MB+)
- **Lower memory footprint** — native WebView instead of bundled Chromium
- **Rust backend** — memory safety, performance, and system-level access
- **Cross-platform** — single codebase for macOS, Windows, and Linux
- **Security** — fine-grained permission system, no Node.js runtime

---

## Architecture

BridgeSpace uses a **modular agent-orchestration architecture** with 6 core components:

```
┌─────────────────────────────────────────────────┐
│                  BridgeSpace                     │
│            (Desktop Application)                 │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │BridgeSwarm│  │BridgeMemory  │  │BridgeVoice│  │
│  │(16 Agents)│  │(Knowledge    │  │(Voice I/O)│  │
│  │           │  │ Graph)       │  │           │  │
│  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘  │
│        │               │               │         │
│  ┌─────┴───────────────┴───────────────┴─────┐  │
│  │              BridgeMCP (MIT)               │  │
│  │        (Model Context Protocol)            │  │
│  └─────────────────┬─────────────────────────┘  │
│                    │                             │
│  ┌─────────────────┴─────────────────────────┐  │
│  │             BridgeCode                     │  │
│  │     (Code Intelligence Engine)             │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Role |
|-----------|------|
| **BridgeSpace** | The desktop application shell — the workroom that contains everything |
| **BridgeSwarm** | Multi-agent orchestration engine managing 16 specialized AI agents |
| **BridgeMemory** | Markdown-based knowledge graph for persistent project context |
| **BridgeMCP** | MCP protocol implementation for standardized agent communication (MIT license) |
| **BridgeCode** | Code intelligence engine — parsing, analysis, and code generation |
| **BridgeVoice** | Voice input/output interface for hands-free development |

---

## UI Patterns

### Command Center Layout
- Central workspace with configurable panels
- Terminal, editor, file explorer, and AI agent panels arranged in a unified view
- Drag-and-drop panel arrangement

### Agent-Native UI
- AI agents are visible, interactive entities in the UI — not hidden behind a chat window
- Agent status indicators, activity feeds, and direct interaction panels
- Each agent can have its own dedicated UI surface

### Kanban Boards
- Built-in project management with Kanban-style task boards
- Tasks can be created, assigned to agents, and tracked within the IDE
- Integrates with the development workflow (commits, PRs, deployments)

### Zero Context Switching
- All tools accessible from a single window
- Terminal commands, file editing, AI chat, task management — all without alt-tabbing
- Unified search across files, commands, agents, and tasks

---

## APIs — BridgeMCP

BridgeMCP provides a structured API for agent-to-environment communication.

### Authentication
- **API Key authentication** — each agent/client gets an API key
- Keys managed through the BridgeSpace settings panel

### Key Operations

| Operation | Description |
|-----------|-------------|
| `create_project` | Initialize a new project in the workspace |
| `create_agent` | Spawn a new AI agent with a specific role and capabilities |
| `send_message` | Send a message between agents or from agent to user |
| `query_memory` | Query the BridgeMemory knowledge graph |
| `write_memory` | Write new knowledge to the BridgeMemory graph |
| `execute_command` | Execute a terminal command in the workspace |
| `read_file` | Read a file from the project |
| `write_file` | Write/modify a file in the project |

### Example API Call

```json
{
  "method": "create_agent",
  "params": {
    "name": "CodeReviewer",
    "role": "review",
    "capabilities": ["read_file", "query_memory", "send_message"],
    "model": "claude-sonnet-4-20250514",
    "context": {
      "project": "my-project",
      "focus": "security"
    }
  }
}
```

---

## Pricing

| Tier | Monthly Price | Credits | Features |
|------|--------------|---------|----------|
| **Basic** | $16–20/mo | 5,000 credits | Core ADE features, BridgeMemory, limited swarm |
| **Pro** | $40–50/mo | 12,500 credits | Full swarm access, BridgeVoice, priority support |
| **Ultra** | $80–100/mo | 25,000 credits | Unlimited agents, team features, enterprise support |

> **Credits** are consumed by AI agent interactions — more complex tasks use more credits.

---

## Open Source

| Component | License | Repository |
|-----------|---------|-----------|
| **BridgeSpace** (core app) | Commercial / Proprietary | Private |
| **BridgeMCP** | **MIT License** ✅ | [github.com/bridgemind-ai/bridgemcp](https://github.com/bridgemind-ai/bridgemcp) |

### What We Can Learn From
- **BridgeMCP** is fully open source (MIT) — we can study the MCP protocol implementation
- The agent communication patterns, message formats, and orchestration logic are all visible
- BridgeMind's GitHub organization: [github.com/bridgemind-ai](https://github.com/bridgemind-ai)

---

## Key Takeaways for Multi Vibe

1. **ADE > IDE** — BridgeSpace proves the market is ready for agent-first development environments
2. **Markdown knowledge graphs** are practical and developer-friendly (vs complex databases)
3. **MCP protocol** is becoming a standard for AI agent communication — we should support it
4. **Multi-agent orchestration** is the future, not single-agent chat
5. **Tauri is the right framework** — BridgeSpace validates our tech stack choice
6. **Modular architecture** with clear component boundaries enables independent iteration

---

*Research conducted: June 2025*
