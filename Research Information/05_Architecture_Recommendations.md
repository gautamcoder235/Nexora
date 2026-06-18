# 05 — Architecture Recommendations

> How to build Nexora using patterns learned from Warp's architecture, adapted for our Tauri + React + TypeScript stack.

---

## Recommended Tech Stack

| Layer | Warp Uses | Nexora Uses | Rationale |
|-------|-----------|-----------------|-----------|
| Desktop Framework | Custom Rust app | **Tauri v2** | Cross-platform with Rust backend + WebView frontend |
| UI Framework | Custom WarpUI (Rust) | **React + TypeScript** | Faster iteration, larger ecosystem, Tauri-native |
| Terminal Rendering | Custom wgpu grid renderer | **xterm.js 6.0 + WebGL** | Battle-tested, GPU-accelerated, rich addon ecosystem |
| PTY Management | Custom Rust PTY | **tauri-plugin-pty + portable-pty** | Same underlying tech, Tauri-integrated |
| State Management | Entity-Handle-Context (Rust) | **Zustand** | Lightweight, works outside React, similar patterns |
| AI Integration | Custom `crates/ai/` | **CLI Agent Detection** | Detect claude/codex/gemini, no custom AI engine needed |
| ANSI Parser | Custom vterm (Alacritty fork) | **xterm.js built-in parser** | xterm.js handles ANSI parsing internally |
| Styling | Custom theme engine | **CSS Variables + Tailwind** | Design tokens in CSS, utility classes for layout |
| Build System | Cargo workspaces | **Cargo (backend) + Vite (frontend)** | Tauri v2 standard toolchain |

---

## 5 Key Patterns to Adopt from Warp

### Pattern 1: Block-Based Terminal

Warp's block architecture is its killer feature. We adapt it for TypeScript:

```typescript
/**
 * Block — the fundamental unit of terminal interaction.
 * Each command and its output is an interactive, selectable block.
 */
interface Block {
  id: string;                        // UUID
  state: BlockState;
  command: string | null;            // The command text
  output: string;                    // Raw terminal output
  exitCode: number | null;          // Exit code (null while executing)
  workingDirectory: string;
  timestamp: number;                 // Unix timestamp
  
  // UI state
  isSelected: boolean;
  isCollapsed: boolean;
  height: number;                    // Computed height in pixels
}

enum BlockState {
  /** User is typing the command */
  BeforeExecution = 'before_execution',
  /** Command is running, output streaming */
  Executing = 'executing',
  /** Command finished successfully or with error */
  DoneWithExecution = 'done',
  /** Empty enter or no command */
  DoneWithNoExecution = 'no_execution',
  /** Background process */
  Background = 'background',
  /** Static display block (welcome, info) */
  Static = 'static',
}

/**
 * BlockList — ordered container with efficient height lookups.
 * Adapts Warp's Vec<Block> + SumTree pattern.
 */
interface BlockList {
  blocks: Block[];
  activeBlockId: string | null;
  totalHeight: number;
  
  // Methods
  addBlock(block: Block): void;
  getBlockAtY(y: number): Block | null;       // O(log n) via binary search
  updateBlockHeight(id: string, height: number): void;
  getScrollOffset(blockId: string): number;    // O(log n)
}
```

**Block boundary detection** using OSC 133 shell integration:

```typescript
/**
 * Parse OSC 133 markers from terminal output to detect block boundaries.
 * These markers are emitted by shell integration scripts.
 */
function parseBlockMarkers(data: string): BlockEvent[] {
  const events: BlockEvent[] = [];
  const OSC_133_REGEX = /\x1b\]133;([A-D])(;(\d+))?\x07/g;
  
  let match;
  while ((match = OSC_133_REGEX.exec(data)) !== null) {
    switch (match[1]) {
      case 'A': events.push({ type: 'prompt_start' }); break;
      case 'B': events.push({ type: 'prompt_end' }); break;
      case 'C': events.push({ type: 'command_start' }); break;
      case 'D': events.push({ type: 'command_end', exitCode: parseInt(match[3] || '0') }); break;
    }
  }
  
  return events;
}
```

---

### Pattern 2: Multi-Mode Input

Warp's 5 input modes show that different contexts need different input handling. We adapt this:

```typescript
/**
 * Input modes for Nexora.
 * Each mode defines its own keybinding set and behavior.
 */
enum InputMode {
  /** Standard terminal input with block enhancements */
  Terminal = 'terminal',
  /** AI agent conversation mode */
  Agent = 'agent',
  /** Raw passthrough for vim/tmux (no interception) */
  Passthrough = 'passthrough',
  /** Command palette and search */
  Command = 'command',
}

interface InputModeConfig {
  mode: InputMode;
  keybindings: Map<string, TerminalAction>;
  interceptKeys: boolean;        // Whether to intercept before PTY
  multilineInput: boolean;       // Whether Enter creates newline or executes
  showAutocomplete: boolean;     // Whether to show completions
}

/**
 * TerminalAction — every possible user action.
 * Inspired by Warp's 100+ action enum.
 */
type TerminalAction =
  // Navigation
  | { type: 'scroll_up'; lines?: number }
  | { type: 'scroll_down'; lines?: number }
  | { type: 'scroll_to_top' }
  | { type: 'scroll_to_bottom' }
  | { type: 'jump_to_block'; blockId: string }
  
  // Block operations
  | { type: 'copy_block'; blockId: string }
  | { type: 'select_block'; blockId: string }
  | { type: 'rerun_block'; blockId: string }
  | { type: 'collapse_block'; blockId: string }
  | { type: 'expand_block'; blockId: string }
  
  // Pane management
  | { type: 'split_horizontal' }
  | { type: 'split_vertical' }
  | { type: 'focus_next_pane' }
  | { type: 'focus_prev_pane' }
  | { type: 'close_pane' }
  
  // AI
  | { type: 'toggle_agent_panel' }
  | { type: 'send_to_agent'; text: string }
  | { type: 'accept_suggestion' }
  | { type: 'reject_suggestion' }
  
  // Terminal
  | { type: 'send_interrupt' }
  | { type: 'send_eof' }
  | { type: 'clear_screen' }
  | { type: 'toggle_input_mode'; mode: InputMode };
```

---

### Pattern 3: Modular Package Architecture

Warp's 71+ crate structure shows the value of modular packages. We adapt for our monorepo:

```
nexora/
├── src/                          # React frontend
│   ├── components/
│   │   ├── terminal/             # Terminal components
│   │   │   ├── TerminalPane.tsx
│   │   │   ├── BlockView.tsx
│   │   │   ├── BlockList.tsx
│   │   │   └── InputArea.tsx
│   │   ├── agent/                # AI agent panel
│   │   │   ├── AgentPanel.tsx
│   │   │   ├── AgentConversation.tsx
│   │   │   └── AgentSelector.tsx
│   │   ├── layout/               # Layout shell
│   │   │   ├── Workroom.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TitleBar.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── memory/               # BridgeMemory UI
│   │   │   ├── MemoryPanel.tsx
│   │   │   ├── MemoryEntry.tsx
│   │   │   └── MemoryGraph.tsx
│   │   └── shared/               # Shared components
│   │       ├── GlassPanel.tsx
│   │       ├── Icon.tsx
│   │       └── Tooltip.tsx
│   ├── stores/                   # Zustand stores
│   │   ├── terminalStore.ts
│   │   ├── agentStore.ts
│   │   ├── memoryStore.ts
│   │   └── layoutStore.ts
│   ├── hooks/                    # Custom React hooks
│   │   ├── useTerminal.ts
│   │   ├── useBlockDetection.ts
│   │   ├── usePTY.ts
│   │   └── useAgentDetection.ts
│   ├── lib/                      # Core logic (non-React)
│   │   ├── blockParser.ts
│   │   ├── inputRouter.ts
│   │   ├── sumTree.ts
│   │   └── themeEngine.ts
│   └── types/                    # TypeScript types
│       ├── terminal.ts
│       ├── agent.ts
│       └── memory.ts
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/             # Tauri commands
│   │   │   ├── mod.rs
│   │   │   ├── agent_detection.rs
│   │   │   ├── file_system.rs
│   │   │   └── memory.rs
│   │   └── pty/                  # PTY management
│   │       ├── mod.rs
│   │       ├── manager.rs
│   │       └── shell_integration.rs
│   └── Cargo.toml
```

---

### Pattern 4: SumTree / Virtual Scrolling

Warp uses a SumTree for O(log n) block height lookups. We implement a simplified version in TypeScript:

```typescript
/**
 * PrefixSumArray — simplified version of Warp's SumTree.
 * Uses a Fenwick Tree (Binary Indexed Tree) for O(log n) operations.
 * 
 * Used for: virtual scrolling, "which block is at pixel Y?",
 * and "what's the scroll offset of block N?"
 */
class PrefixSumArray {
  private tree: number[];
  private values: number[];
  private size: number;

  constructor(initialCapacity: number = 1024) {
    this.size = 0;
    this.tree = new Array(initialCapacity + 1).fill(0);
    this.values = [];
  }

  /** Add a new height value. O(log n) */
  push(height: number): void {
    this.values.push(height);
    this.size++;
    this._update(this.size, height);
  }

  /** Update height at index. O(log n) */
  update(index: number, newHeight: number): void {
    const diff = newHeight - this.values[index];
    this.values[index] = newHeight;
    this._update(index + 1, diff);
  }

  /** Get cumulative height up to index (exclusive). O(log n) */
  prefixSum(index: number): number {
    let sum = 0;
    let i = index;
    while (i > 0) {
      sum += this.tree[i];
      i -= i & (-i);
    }
    return sum;
  }

  /** Total height of all blocks. O(log n) */
  totalHeight(): number {
    return this.prefixSum(this.size);
  }

  /** Find which block index contains pixel Y. O(log² n) */
  findBlockAtY(targetY: number): number {
    let lo = 0, hi = this.size - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const midTop = this.prefixSum(mid + 1);
      const midBottom = this.prefixSum(mid);
      if (targetY >= midBottom && targetY < midTop) return mid;
      if (targetY < midBottom) hi = mid - 1;
      else lo = mid + 1;
    }
    return Math.max(0, this.size - 1);
  }

  private _update(i: number, delta: number): void {
    while (i <= this.size) {
      this.tree[i] += delta;
      i += i & (-i);
    }
  }
}
```

**Virtual scrolling with blocks:**

```typescript
/**
 * Calculate which blocks are visible in the current viewport.
 * Only visible blocks need to be rendered (performance critical).
 */
function getVisibleBlocks(
  blocks: Block[],
  heights: PrefixSumArray,
  scrollTop: number,
  viewportHeight: number,
): { startIndex: number; endIndex: number; offsetY: number } {
  const startIndex = heights.findBlockAtY(scrollTop);
  const endIndex = heights.findBlockAtY(scrollTop + viewportHeight);
  const offsetY = heights.prefixSum(startIndex);
  
  return {
    startIndex,
    endIndex: Math.min(endIndex + 1, blocks.length),
    offsetY,
  };
}
```

---

### Pattern 5: Entity-Handle Adapted to Zustand

Warp's Entity-Handle-Context pattern maps well to Zustand stores:

| Warp Concept | Zustand Equivalent | Description |
|-------------|-------------------|-------------|
| Entity | Store state | The actual data |
| Handle | Store selector/hook | Lightweight reference to data |
| Context | Store actions | Methods to read/write state |
| Effect | Middleware/subscriptions | Side effects from state changes |
| FairMutex | Immer middleware | Safe concurrent state updates |

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Terminal store — the "Entity" in Entity-Handle pattern.
 * Immer middleware acts as our "FairMutex" for safe updates.
 * subscribeWithSelector enables "Effect"-style subscriptions.
 */
const useTerminalStore = create(
  subscribeWithSelector(
    immer<TerminalStore>((set, get) => ({
      // State (Entity)
      panes: new Map(),
      activePane: null,
      blocks: new Map(),
      
      // Actions (Context)
      addBlock: (paneId: string, block: Block) => set(state => {
        const pane = state.panes.get(paneId);
        if (pane) {
          pane.blocks.push(block);
        }
      }),
      
      updateBlockState: (blockId: string, newState: BlockState) => set(state => {
        const block = state.blocks.get(blockId);
        if (block) {
          block.state = newState;
        }
      }),
      
      // ... more actions
    }))
  )
);

// "Handle" — selective subscription (only re-renders when selected data changes)
function useActiveBlock(): Block | null {
  return useTerminalStore(state => {
    const pane = state.panes.get(state.activePane ?? '');
    if (!pane) return null;
    return pane.blocks[pane.blocks.length - 1] ?? null;
  });
}

// "Effect" — subscribe to state changes outside React
useTerminalStore.subscribe(
  state => state.activePane,
  (activePane, previousPane) => {
    console.log(`Pane focus changed: ${previousPane} → ${activePane}`);
    // Trigger side effects: focus terminal, update status bar, etc.
  }
);
```

---

## Swarm Architecture

Nexora's swarm orchestration coordinates multiple CLI agents for complex tasks:

```
┌──────────────────────────────────────────────────────┐
│                   Swarm Coordinator                   │
│              (TypeScript orchestration)               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Agent 1    │  │   Agent 2    │  │   Agent 3    │  │
│  │ (Claude CLI) │  │ (Codex CLI)  │  │ (Gemini CLI) │  │
│  │              │  │              │  │              │  │
│  │  Task: Code  │  │ Task: Review │  │ Task: Docs   │  │
│  │  Generation  │  │  & Testing   │  │ Generation   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │         │
│         └────────────┬────┘────────────────┘         │
│                      │                               │
│              ┌───────┴───────┐                       │
│              │  Result       │                       │
│              │  Aggregator   │                       │
│              └───────┬───────┘                       │
│                      │                               │
│              ┌───────┴───────┐                       │
│              │  BridgeMemory │ ← Results persisted   │
│              │  (Knowledge   │   to knowledge graph  │
│              │   Graph)      │                       │
│              └───────────────┘                       │
└──────────────────────────────────────────────────────┘
```

### Swarm Coordinator

```typescript
interface SwarmTask {
  id: string;
  description: string;
  subtasks: SubTask[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: Map<string, SubTaskResult>;
}

interface SubTask {
  id: string;
  parentTaskId: string;
  assignedAgent: string;         // Agent binary name
  prompt: string;                // Task description for the agent
  dependencies: string[];        // Other subtask IDs this depends on
  status: 'pending' | 'running' | 'completed' | 'failed';
}

class SwarmCoordinator {
  private agents: DetectedAgent[];
  private activeTasks: Map<string, SwarmTask>;
  
  /**
   * Decompose a complex task into subtasks and assign to agents.
   */
  async executeSwarmTask(description: string): Promise<SwarmTask> {
    // 1. Decompose the task
    const subtasks = await this.decomposeTask(description);
    
    // 2. Assign agents based on availability and capability
    const assignments = this.assignAgents(subtasks);
    
    // 3. Execute in dependency order
    const results = await this.executeInOrder(assignments);
    
    // 4. Aggregate results
    const aggregated = this.aggregateResults(results);
    
    // 5. Persist to BridgeMemory
    await this.persistToMemory(aggregated);
    
    return aggregated;
  }
}
```

---

## BridgeMemory File Format

### Directory Structure

```
.multivibe/
└── memory/
    ├── _index.md                  # Graph index / table of contents
    ├── decisions/
    │   ├── use-tauri-v2.md
    │   ├── react-over-svelte.md
    │   └── zustand-state.md
    ├── architecture/
    │   ├── block-system.md
    │   ├── input-modes.md
    │   └── swarm-design.md
    ├── context/
    │   ├── project-overview.md
    │   ├── codebase-map.md
    │   └── dependencies.md
    └── sessions/
        ├── 2025-06-04-initial-design.md
        └── 2025-06-05-terminal-impl.md
```

### File Format with YAML Frontmatter

```markdown
---
id: use-tauri-v2
type: decision                    # decision | architecture | context | session
created: 2025-06-04T16:30:00Z
updated: 2025-06-04T16:30:00Z
tags:
  - platform
  - desktop
  - framework
status: accepted                  # draft | proposed | accepted | deprecated
confidence: high                  # low | medium | high
relations:
  - type: depends-on
    target: react-over-svelte
    reason: "Tauri v2 has first-class React template support"
  - type: informs
    target: block-system
    reason: "Block system uses Tauri IPC for PTY communication"
  - type: supersedes
    target: electron-evaluation
    reason: "Tauri chosen over Electron for performance"
---

# Decision: Use Tauri v2 as Desktop Framework

## Context
We need a cross-platform desktop framework that supports...

## Decision
We will use Tauri v2 because...

## Consequences
- **Positive:** Smaller binary, lower memory usage, Rust backend
- **Negative:** WebView inconsistencies across platforms
- **Neutral:** Need to learn Tauri's permission system
```

### Memory Query API

```typescript
interface MemoryEntry {
  id: string;
  type: 'decision' | 'architecture' | 'context' | 'session';
  title: string;
  content: string;
  tags: string[];
  status: string;
  confidence: string;
  relations: Relation[];
  created: Date;
  updated: Date;
}

interface Relation {
  type: 'depends-on' | 'informs' | 'supersedes' | 'related-to';
  target: string;      // ID of related entry
  reason: string;
}

interface MemoryQuery {
  type?: string;
  tags?: string[];
  status?: string;
  fullText?: string;   // Search in title and content
}
```

---

## Implementation Phases

| Phase | Duration | Deliverables | Key Milestones |
|-------|----------|-------------|----------------|
| **Phase 1: Foundation** | 2–3 weeks | Tauri scaffold, PTY integration, basic xterm.js terminal, single pane | Working terminal in Tauri window |
| **Phase 2: Blocks** | 2–3 weeks | Block detection (OSC 133), block rendering, block selection/copy, virtual scrolling | Interactive block-based terminal |
| **Phase 3: Multi-Pane** | 1–2 weeks | Horizontal/vertical splits, pane focus management, pane resize | Multi-pane terminal workroom |
| **Phase 4: Layout** | 1–2 weeks | Sidebar, title bar, status bar, tab management, glassmorphism styling | Full workroom UI shell |
| **Phase 5: AI Agents** | 2–3 weeks | Agent detection, agent panel, agent conversation, inline suggestions | Working AI agent integration |
| **Phase 6: BridgeMemory** | 1–2 weeks | Memory file format, memory panel, memory read/write, agent context | Knowledge graph foundation |
| **Phase 7: Swarm** | 2–3 weeks | Swarm coordinator, task decomposition, multi-agent execution, result aggregation | Swarm MVP |
| **Phase 8: Polish** | 2–3 weeks | Theming, keybinding customization, settings, performance optimization | V1 release candidate |

**Total estimated: 13–21 weeks** (3–5 months)

---

## Warp vs Nexora Comparison

| Aspect | Warp | Nexora |
|--------|------|-----------|
| **Language** | 100% Rust | TypeScript (frontend) + Rust (backend) |
| **UI Framework** | Custom WarpUI | React + Zustand |
| **Rendering** | Custom wgpu GPU renderer | xterm.js + WebGL addon |
| **Desktop Shell** | Custom Rust window | Tauri v2 WebView |
| **Terminal Parsing** | Custom vterm (Alacritty fork) | xterm.js built-in parser |
| **Block System** | Native Rust structs + SumTree | TypeScript interfaces + Fenwick Tree |
| **Input Modes** | 5 modes (30KB agent mode) | 4 modes (terminal, agent, passthrough, command) |
| **AI** | Custom `crates/ai/` engine | CLI agent detection (claude, codex, gemini) |
| **State** | Entity-Handle-Context + FairMutex | Zustand + Immer + subscribeWithSelector |
| **Theming** | Custom theme engine + YAML | CSS variables + design tokens |
| **Knowledge Graph** | N/A | NexoraMemory (markdown + YAML frontmatter) |
| **Multi-Agent** | N/A | Swarm coordinator with task decomposition |
| **Open Source** | Source-available (not OSS) | TBD |
| **Performance** | Native (fastest possible) | WebView (fast enough with WebGL) |
| **Development Speed** | Slower (Rust compile times) | Faster (hot reload, JS ecosystem) |
| **Binary Size** | ~100MB+ | ~10–15MB (Tauri) |
| **Memory Usage** | Low (Rust) | Medium (WebView + JS runtime) |

### Key Differences in Philosophy

| Philosophy | Warp | Nexora |
|-----------|------|-----------|
| AI Approach | Built-in AI engine | Detect existing agents |
| Agent Model | Single AI assistant | Multi-agent swarm |
| Knowledge | No persistent knowledge | NexoraMemory knowledge graph |
| Target Users | Individual developers | Developers who "vibe code" with AI |
| Extensibility | Workflows (limited) | Swarm tasks + memory plugins |
| Terminal Model | Full replacement terminal | ADE with terminal core |

---

## Summary

Nexora combines the best of three worlds:
1. **Warp's block terminal** — the best terminal UX pattern ever created
2. **Nexora's ADE concept** — agent-first development environment
3. **Our innovations** — CLI agent detection, swarm orchestration, NexoraMemory knowledge graph

By building on Tauri + React + xterm.js, we trade some raw performance for **dramatically faster development speed** and a **richer ecosystem**. The WebGL addon for xterm.js ensures terminal rendering is still GPU-accelerated and smooth.

---

*Recommendations compiled: June 2025*
