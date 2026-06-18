# 04 — Design Decisions

> 11 design decisions from the grill-me planning session for Nexora.

---

## Decision Summary

| # | Decision | Choice |
|---|----------|--------|
| 1 | Core Vision | Full ADE + Warp-inspired block terminal |
| 2 | Platform | Tauri v2 |
| 3 | Frontend | React + TypeScript |
| 4 | Terminal | xterm.js + WebGL hybrid rendering |
| 5 | State Management | Zustand |
| 6 | V1 Features | Multi-pane, AI Agent Mode, Swarm, BridgeMemory |
| 7 | AI Strategy | Detect existing CLI agents (don't bundle) |
| 8 | Knowledge Graph | Local Markdown with YAML frontmatter |
| 9 | Design Language | Dark glassmorphism |
| 10 | Layout | Nexora-inspired workroom |
| 11 | Name | Nexora |

---

## Decision 1: Core Vision

**Decision:** Build a full **Application Development Environment (ADE)** with a Warp-inspired block terminal at its core.

**Rationale:**
- The ADE paradigm (pioneered by Nexora) is the next evolution beyond IDEs
- Warp proved that block-based terminal interaction is superior to raw scrollback
- Combining both gives us: agent-first workspace + developer-friendly terminal
- We're not building "just another terminal" or "just another IDE" — it's a new category

**What this means:**
- Terminal is the foundation, not an afterthought
- AI agents are first-class citizens, not plugins
- The workspace is designed for context retention, not context switching

---

## Decision 2: Platform — Tauri v2

**Decision:** Use **Tauri v2** as the desktop application framework.

**Rationale:**
- Nexora validates Tauri for ADE-class applications
- ~10MB binary vs Electron's ~150MB+
- Rust backend for system-level operations (PTY, file watching, process management)
- Native WebView (no bundled Chromium) = lower memory usage
- Fine-grained security permissions
- Active development with strong ecosystem

**Trade-offs:**
- WebView rendering differences across platforms (unlike Electron's consistent Chromium)
- Smaller plugin ecosystem than Electron
- Tauri v2 is newer, some APIs still maturing

---

## Decision 3: Frontend — React + TypeScript

**Decision:** Use **React with TypeScript** for the frontend UI.

**Rationale:**
- Largest ecosystem of UI components and libraries
- TypeScript provides type safety for complex state management
- Tauri's official template supports React + TS out of the box
- Team familiarity and hiring pool
- JSX is expressive for building complex, nested UI layouts

**Alternatives Considered:**
- **Svelte** — Smaller bundle, but smaller ecosystem
- **Solid** — Better performance, but less mature
- **Vue** — Good option, but React has stronger TypeScript integration

---

## Decision 4: Terminal — xterm.js + WebGL Hybrid

**Decision:** Use **xterm.js 6.0** with the **WebGL addon** for terminal rendering.

**Rationale:**
- xterm.js is the de facto standard for web-based terminal emulation
- WebGL addon provides GPU-accelerated rendering (critical for performance)
- Falls back to canvas rendering if WebGL is unavailable
- Mature project with VS Code heritage (same terminal engine)
- Rich addon ecosystem (fit, search, unicode, serialize)

**Hybrid approach:**
- **WebGL** for cell rendering (characters, colors, cursors)
- **DOM overlays** for block boundaries, action buttons, and rich UI elements
- This gives us Warp-style interactive blocks on top of xterm.js performance

---

## Decision 5: State Management — Zustand

**Decision:** Use **Zustand** for client-side state management.

**Rationale:**
- Lightweight (~1KB) — minimal overhead
- No boilerplate (unlike Redux)
- Supports middleware (persist, devtools, immer)
- Works outside React components (useful for PTY event handlers)
- Compatible with React's concurrent features
- Simple mental model: stores are just objects with methods

**Store Structure (planned):**

```typescript
// Terminal store
interface TerminalStore {
  panes: Map<string, PaneState>;
  activePane: string;
  addPane: (config: PaneConfig) => void;
  removePane: (id: string) => void;
  focusPane: (id: string) => void;
}

// Agent store
interface AgentStore {
  detectedAgents: DetectedAgent[];
  activeAgent: string | null;
  conversations: Map<string, Conversation>;
  detectAgents: () => Promise<void>;
  startConversation: (agentId: string) => void;
}

// Memory store
interface MemoryStore {
  entries: Map<string, MemoryEntry>;
  loadMemory: (projectPath: string) => Promise<void>;
  queryMemory: (query: string) => MemoryEntry[];
  writeMemory: (entry: MemoryEntry) => Promise<void>;
}

// Layout store
interface LayoutStore {
  sidebarVisible: boolean;
  sidebarWidth: number;
  panels: PanelConfig[];
  toggleSidebar: () => void;
  resizeSidebar: (width: number) => void;
}
```

---

## Decision 6: V1 Features

**Decision:** V1 will ship with 4 core features:

### 1. Multi-Pane Terminal
- Split terminal into multiple panes (horizontal and vertical)
- Each pane has its own PTY session
- Keyboard shortcuts for navigation (Ctrl+Shift+Arrow)
- Warp-style block rendering within each pane

### 2. AI Agent Mode
- Detect and integrate existing CLI AI agents
- Agent panel for conversation history
- Inline suggestions in the terminal
- Agent output rendered as rich blocks

### 3. Swarm Orchestration
- Coordinate multiple agents for complex tasks
- Task decomposition and delegation
- Progress tracking across agents
- Results aggregation and presentation

### 4. BridgeMemory
- Local markdown knowledge graph
- Auto-populated from project structure and git history
- Queryable by agents for project context
- Editable by users for explicit knowledge capture

---

## Decision 7: AI Strategy — Detect, Don't Bundle

**Decision:** Detect and integrate existing CLI AI agents rather than shipping our own.

**Rationale:**
- Users already have preferred AI tools installed
- Avoids API key management and billing complexity in V1
- Leverages the full capabilities of each agent (which evolve independently)
- No vendor lock-in — works with any CLI agent
- Reduces our maintenance burden

**Detection targets:**
- `claude` — Claude Code by Anthropic
- `codex` — OpenAI Codex CLI
- `gemini` — Google Gemini CLI

**Future consideration:** Native AI integration with direct API calls (V2+)

---

## Decision 8: Knowledge Graph — Local Markdown

**Decision:** Implement BridgeMemory as **local Markdown files with YAML frontmatter**.

**Rationale:**
- Human-readable and editable
- Version-controllable with git
- No database dependency
- Portable across machines
- Agents can read/write natively

**File format:**

```markdown
---
type: decision
created: 2025-06-04
tags: [architecture, frontend]
relations:
  - type: depends-on
    target: tech-stack-research
  - type: informs
    target: component-structure
---

# React Component Architecture

We will use a modular component structure with...
```

---

## Decision 9: Design Language — Dark Glassmorphism

**Decision:** The visual identity is **dark glassmorphism** with a deep blue/purple palette.

**Characteristics:**
- Frosted glass panels with blur and transparency
- Deep space blue backgrounds
- Purple/violet accent colors
- Subtle gradients and glow effects
- High contrast text for readability

---

### CSS Design Tokens

```css
:root {
  /* ═══════════════════════════════════════ */
  /*              COLOR PALETTE              */
  /* ═══════════════════════════════════════ */
  
  /* Backgrounds */
  --bg-primary: #0a0e1a;             /* Deep space blue — main background */
  --bg-secondary: #0f1424;           /* Slightly lighter — panels, cards */
  --bg-tertiary: #151a2e;            /* Lighter still — hover states */
  --bg-surface: rgba(15, 20, 36, 0.85); /* Glass surface with transparency */
  --bg-overlay: rgba(10, 14, 26, 0.95); /* Modal/overlay background */
  
  /* Glass Effects */
  --glass-bg: rgba(15, 20, 36, 0.65);
  --glass-border: rgba(124, 92, 191, 0.2);
  --glass-blur: 12px;
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  
  /* Text */
  --text-primary: #e0e6f0;           /* Primary text — high contrast */
  --text-secondary: #8b95a8;         /* Secondary text — muted */
  --text-tertiary: #5a6478;          /* Tertiary text — very muted */
  --text-accent: #c77dff;            /* Accent text — purple highlights */
  --text-link: #7c5cbf;              /* Links */
  
  /* Accent Colors */
  --accent-primary: #7c5cbf;         /* Primary purple */
  --accent-secondary: #c77dff;       /* Light purple */
  --accent-tertiary: #5b3d8f;        /* Dark purple */
  --accent-glow: rgba(124, 92, 191, 0.3); /* Glow effect */
  
  /* Semantic Colors */
  --color-success: #4ecdc4;          /* Teal green */
  --color-warning: #ffe66d;          /* Warm yellow */
  --color-error: #ff6b6b;            /* Soft red */
  --color-info: #4a9eff;             /* Sky blue */
  
  /* Terminal ANSI Colors */
  --ansi-black: #1a1e2e;
  --ansi-red: #ff6b6b;
  --ansi-green: #4ecdc4;
  --ansi-yellow: #ffe66d;
  --ansi-blue: #4a9eff;
  --ansi-magenta: #c77dff;
  --ansi-cyan: #72efdd;
  --ansi-white: #e0e6f0;
  --ansi-bright-black: #3a3e4e;
  --ansi-bright-red: #ff8a8a;
  --ansi-bright-green: #6ee7de;
  --ansi-bright-yellow: #fff09a;
  --ansi-bright-blue: #79b8ff;
  --ansi-bright-magenta: #d9a6ff;
  --ansi-bright-cyan: #9af5e8;
  --ansi-bright-white: #ffffff;
  
  /* Borders */
  --border-default: rgba(124, 92, 191, 0.15);
  --border-hover: rgba(124, 92, 191, 0.3);
  --border-active: rgba(124, 92, 191, 0.5);
  
  /* ═══════════════════════════════════════ */
  /*              TYPOGRAPHY                 */
  /* ═══════════════════════════════════════ */
  
  /* Font Families */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace;
  --font-sans: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Inter', 'SF Pro Display', sans-serif;
  
  /* Font Sizes */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 14px;
  --font-md: 16px;
  --font-lg: 18px;
  --font-xl: 24px;
  --font-2xl: 32px;
  
  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* Line Heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
  --leading-terminal: 1.3;
  
  /* ═══════════════════════════════════════ */
  /*               SPACING                   */
  /* ═══════════════════════════════════════ */
  
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  
  /* ═══════════════════════════════════════ */
  /*              BORDER RADIUS              */
  /* ═══════════════════════════════════════ */
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* ═══════════════════════════════════════ */
  /*              TRANSITIONS                */
  /* ═══════════════════════════════════════ */
  
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms ease;
}
```

---

## Decision 10: Layout — Nexora Workroom

**Decision:** Use a **Nexora-inspired workroom layout** with a command center feel.

### Layout Dimensions

```
┌──────────────────────────────────────────────────────────┐
│  Title Bar (32px)                              ─ □ ✕    │
├────────┬─────────────────────────────────────────────────┤
│        │  Tab Bar (40px)                                 │
│        ├───────────────────────────────────┬─────────────┤
│  Side  │                                   │             │
│  bar   │         Terminal Pane(s)           │   Agent     │
│        │                                   │   Panel     │
│ (240px)│    (flex — fills remaining)       │  (320px)    │
│        │                                   │             │
│        │                                   │             │
│        │                                   │             │
│        ├───────────────────────────────────┴─────────────┤
│        │  Status Bar (28px)                              │
└────────┴─────────────────────────────────────────────────┘
```

### Dimension Specifications

| Component | Size | Notes |
|-----------|------|-------|
| **Title Bar** | 32px height | Custom (decorations: false), draggable |
| **Tab Bar** | 40px height | Terminal session tabs |
| **Sidebar** | 240px width | Collapsible, resizable (180px–400px) |
| **Agent Panel** | 320px width | Collapsible, resizable (240px–600px) |
| **Status Bar** | 28px height | Shell info, git branch, agent status |
| **Terminal Pane** | flex (remaining) | Fills available space, splits supported |
| **Min Window** | 800×600 | Minimum window dimensions |
| **Default Window** | 1400×900 | Default window dimensions |

### Sidebar Sections

```
┌────────────────┐
│ 🏠 Workspace   │  ← Project name + switcher
├────────────────┤
│ 📁 Files       │  ← File tree explorer
├────────────────┤
│ 🧠 Memory      │  ← BridgeMemory entries
├────────────────┤
│ 🤖 Agents      │  ← Detected CLI agents
├────────────────┤
│ 📋 Tasks       │  ← Kanban-style task board
├────────────────┤
│ ⚙️ Settings    │  ← App configuration
└────────────────┘
```

---

## Decision 11: Name — Nexora

**Decision:** The project is named **Nexora**.

**Why "Nexora":**
- **Nex** — Next generation, next evolution of development environments
- **Ora** — Aura, clean vibe of AI collaboration and environment orchestration
- Memorable, unique, and professional.
- Works as both a product name and a philosophy
- Domain-friendly and searchable

---

*Decisions recorded: June 2025*
