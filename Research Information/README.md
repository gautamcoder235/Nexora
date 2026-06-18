# Nexora — Research Information

> **Project Name:** Nexora  
> **Tagline:** A full Application Development Environment (ADE) with Warp-inspired block terminal  
> **Status:** Research & Planning Phase

---

## Quick Reference

| # | Document | Description |
|---|----------|-------------|
| 1 | [Nexora Product Research](./01_BridgeSpace_Product_Research.md) | Internet research on Nexora — the AI-native ADE by BridgeMind |
| 2 | [Warp Terminal Architecture](./02_Warp_Terminal_Architecture.md) | Deep codebase analysis of Warp's Rust terminal architecture |
| 3 | [Tech Stack Research](./03_Tech_Stack_Research.md) | Package versions, integration patterns, and code examples |
| 4 | [Design Decisions](./04_Design_Decisions.md) | 11 design decisions from the grill-me planning session |
| 5 | [Architecture Recommendations](./05_Architecture_Recommendations.md) | How to build Nexora using patterns learned from Warp |

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Framework | **Tauri v2** | Native desktop app shell (Rust backend + WebView frontend) |
| Frontend | **React + TypeScript** | UI framework for the workroom interface |
| Terminal Emulator | **xterm.js 6.0 + WebGL** | High-performance terminal rendering in the WebView |
| PTY Backend | **tauri-plugin-pty 0.2.1** | Pseudo-terminal management via Rust/portable-pty |
| State Management | **Zustand** | Lightweight, flexible client-side state |
| Styling | **Dark Glassmorphism** | Frosted glass aesthetic with deep blue/purple palette |
| AI Integration | **CLI Agent Detection** | Detects Claude, Codex, Gemini binaries on the system |
| Knowledge Graph | **Local Markdown + YAML** | BridgeMemory-style markdown files with YAML frontmatter |

---

## Core Features (V1)

1. **Multi-Pane Terminal** — Split terminal with Warp-style block architecture
2. **AI Agent Mode** — Detect and integrate existing CLI AI agents (Claude, Codex, Gemini)
3. **Swarm Orchestration** — Multi-agent coordination for complex development tasks
4. **BridgeMemory** — Local markdown-based knowledge graph for project context
5. **Block-Based Output** — Each command and its output is an interactive, selectable block
6. **Command Center Layout** — Nexora-inspired workroom with zero context switching

---

## Research Sources

| Source | Type | Key Insights |
|--------|------|-------------|
| [Nexora Website](https://nexora.app) | Product | ADE concept, agent-native UI, BridgeSwarm architecture |
| [Warp GitHub (leaked/OSS)](https://github.com/warpdotdev/warp) | Codebase | Block terminal architecture, rendering pipeline, input modes |
| [Tauri v2 Docs](https://v2.tauri.app) | Documentation | Desktop framework APIs, plugin system, IPC |
| [xterm.js Docs](https://xtermjs.org) | Documentation | Terminal emulation, WebGL addon, fit addon |
| [tauri-plugin-pty](https://crates.io/crates/tauri-plugin-pty) | Crate | PTY integration for Tauri apps |
| [BridgeMCP GitHub](https://github.com/bridgemind-ai/bridgemcp) | Open Source | MCP protocol implementation (MIT license) |

---

## Key Discoveries

### From Nexora Research
- **Agent-Native UI** is a paradigm shift — the entire IDE is designed around AI agents, not just bolted on
- **BridgeSwarm** uses 16 specialized agents orchestrated together for complex tasks
- **BridgeMemory** uses a markdown-based knowledge graph — simple, portable, version-controllable
- **BridgeMCP** is MIT-licensed and provides the MCP protocol layer we can study

### From Warp Architecture Analysis
- **Block architecture** is the killer feature — each command+output is an interactive unit
- **Three-tier rendering** (WarpUI Framework → GPU pipeline → Grid Renderer) enables smooth performance
- **5 input modes** (agent, classic, terminal, universal, cli_agent) show how to handle diverse interactions
- **SumTree data structure** provides O(log n) height lookups for virtual scrolling
- **Cell struct at 24 bytes** (char + fg + bg + flags + extra) is the atomic rendering unit
- **OSC 133 markers** enable semantic shell integration for block boundary detection

### From Design Session
- **Nexora** is the chosen project name
- **Dark glassmorphism** with deep blue/purple palette is the visual identity
- **Detect, don't bundle** — leverage existing CLI AI agents rather than shipping our own
- **Local-first knowledge** — BridgeMemory stored as markdown, no cloud dependency

---

*Last updated: June 2025*
