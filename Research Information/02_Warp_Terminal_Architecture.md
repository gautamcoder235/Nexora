# 02 — Warp Terminal Architecture

> Deep codebase analysis of Warp's Rust terminal — architecture, rendering pipeline, block system, input modes, and patterns worth adopting.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack](#2-tech-stack)
3. [Core Pipeline](#3-core-pipeline)
4. [Block Architecture](#4-block-architecture)
5. [Three-Tier Rendering](#5-three-tier-rendering)
6. [Input System](#6-input-system)
7. [State Management](#7-state-management)
8. [AI Integration](#8-ai-integration)
9. [Theming](#9-theming)
10. [Component Hierarchy](#10-component-hierarchy)

---

## 1. Project Structure

Warp's repository is organized into a top-level `app/` directory and a `crates/` directory containing **71+ modular Rust crates**.

### Top-Level Layout

```
warp/
├── app/
│   └── terminal/
│       ├── model/          # Terminal state and logic
│       ├── view/           # Rendering and UI
│       └── input/          # Input handling and keybindings
├── crates/
│   ├── warpui/             # UI framework (Entity-Handle pattern)
│   ├── warpui_core/        # Core UI primitives
│   ├── warp_terminal/      # Terminal emulation core
│   ├── ai/                 # AI agent integration
│   ├── sum_tree/           # O(log n) data structure for heights
│   ├── vterm/              # ANSI/VT parser (adapted from Alacritty)
│   ├── warp_core/          # Shared core utilities
│   └── ... (71+ crates)
```

### Key Crate Purposes

| Crate | Purpose | Approx Size |
|-------|---------|-------------|
| `warpui` | Custom UI framework with Entity-Handle-Context pattern | Large |
| `warpui_core` | Core primitives: View trait, Element trees, layout engine | Large |
| `warp_terminal` | Terminal model, block management, PTY communication | Large |
| `ai` | AI agent, skills, project context, indexing | Medium |
| `sum_tree` | Balanced tree for O(log n) cumulative height queries | Small |
| `vterm` | VT100/ANSI escape code parser (forked from Alacritty) | Medium |
| `warp_core` | Shared types, config, utilities | Medium |

---

## 2. Tech Stack

| Technology | Usage |
|-----------|-------|
| **Rust** | 100% of the codebase — no C/C++ dependencies for core logic |
| **wgpu** | GPU-accelerated rendering (WebGPU API) |
| **tokio** | Async runtime for I/O, PTY communication, network |
| **Alacritty (adapted)** | VT parser and grid model, heavily modified |
| **WarpUI** | Custom UI framework (not off-the-shelf) |
| **DirectComposition** | Windows compositor integration |
| **Metal** | macOS GPU backend (via wgpu) |

### Why 100% Rust?
- Memory safety without garbage collection
- Predictable performance for real-time rendering
- Single language for entire stack (UI, terminal, AI, networking)
- Fearless concurrency for multi-threaded terminal emulation

---

## 3. Core Pipeline

The data flows through Warp in a clear pipeline from PTY output to pixels on screen:

```
PTY (shell output)
  │
  ▼
vterm ANSI Parser
  │  Parses escape codes, control sequences
  ▼
BlockGrid
  │  2D grid of Cells for each block
  ▼
Block
  │  Individual command + output unit
  ▼
BlockList
  │  Ordered list with SumTree for heights
  ▼
TerminalModel
  │  Complete terminal state
  ▼
TerminalView
  │  View layer translating model → render commands
  ▼
wgpu GPU Pipeline
  │  Vertex buffers, shaders, composition
  ▼
Screen (pixels)
```

### Pipeline Details

1. **PTY → vterm**: Raw bytes from the shell are fed into the vterm ANSI parser, which interprets VT100/xterm escape sequences and updates the grid state
2. **vterm → BlockGrid**: Parsed characters and attributes are stored in a 2D grid (`BlockGrid`) of `Cell` structs
3. **BlockGrid → Block**: Each block owns its grids (header, output, rprompt) and tracks execution state
4. **Block → BlockList**: Blocks are stored in an ordered `Vec<Block>` with a parallel `SumTree` for O(log n) height queries
5. **BlockList → TerminalModel**: The terminal model holds the block list plus cursor, selection, viewport, and scroll state
6. **TerminalModel → TerminalView**: The view reads the model (via `FairMutex`) and converts it to render primitives
7. **TerminalView → wgpu → Screen**: GPU pipeline renders cells, cursors, selections, decorations to the final framebuffer

---

## 4. Block Architecture

The **block** is Warp's fundamental innovation — every command and its output is an interactive, selectable unit.

### Block Struct

```rust
struct Block {
    // Identity
    id: BlockId,                    // UUID for each block
    
    // Grids (2D cell arrays)
    header_grid: BlockGrid,         // The command/prompt line
    rprompt_grid: Option<BlockGrid>,// Right-side prompt (e.g., git branch)
    output_grid: BlockGrid,         // Command output
    
    // State
    state: BlockState,              // Execution lifecycle state
    
    // Metadata
    command: Option<String>,        // The command text
    working_directory: PathBuf,     // CWD when command was executed
    exit_code: Option<i32>,         // Exit code after execution
    timestamp: DateTime,            // When the block was created
}
```

### Block States

| State | Description |
|-------|-------------|
| `BeforeExecution` | Block is being composed — user is typing the command |
| `Executing` | Command is running — output is streaming in |
| `DoneWithExecution` | Command has finished — exit code is available |
| `DoneWithNoExecution` | Block was created but no command was run (e.g., empty enter) |
| `Background` | Command is running in the background |
| `Static` | Block is a static display block (e.g., welcome message) |

### BlockId

```rust
struct BlockId(Uuid);
```

Each block gets a unique UUID, enabling:
- Stable references across re-renders
- Jump-to-block navigation
- Block-level operations (copy, share, bookmark)

### Block Lifecycle with OSC 133 Markers

Warp uses **OSC 133** shell integration markers to detect block boundaries:

```
OSC 133;A ST  →  Start of prompt (new block begins)
OSC 133;B ST  →  End of prompt (command line ready)
OSC 133;C ST  →  Command execution starts
OSC 133;D;{exit_code} ST  →  Command execution ends
```

```
┌─ OSC 133;A ── Prompt Start ──────────────────┐
│  $ git status                                 │  ← header_grid
├─ OSC 133;C ── Execution Start ────────────────┤
│  On branch main                               │
│  Changes not staged for commit:               │  ← output_grid
│    modified: src/main.rs                      │
├─ OSC 133;D;0 ── Execution End (exit 0) ──────┤
└───────────────────────────────────────────────┘
```

### BlockList

The `BlockList` is the container for all blocks in a terminal session. It's approximately **3,949 lines** of Rust code.

```rust
struct BlockList {
    blocks: Vec<Block>,                     // Ordered list of blocks
    height_tree: SumTree<BlockHeightItem>,  // O(log n) height lookups
    active_block_id: Option<BlockId>,       // Currently focused block
    // ...
}
```

**SumTree for Heights**: Instead of iterating through all blocks to compute scroll positions (O(n)), Warp uses a balanced `SumTree` where each leaf stores a block's height. This gives:
- **O(log n) scroll position lookups** — "what block is at pixel Y?"
- **O(log n) height updates** — when a block's output grows
- **O(log n) total height computation** — for scrollbar positioning

### Cell Struct — 24 Bytes

The `Cell` is the atomic rendering unit — one character cell in the terminal grid:

```rust
struct Cell {
    character: char,        // 4 bytes — the displayed character
    fg: Color,              // 4 bytes — foreground color
    bg: Color,              // 4 bytes — background color
    flags: CellFlags,       // 4 bytes — bold, italic, underline, etc.
    extra: CellExtra,       // 8 bytes — hyperlinks, images, etc.
}
// Total: 24 bytes per cell
```

At 24 bytes per cell, a typical 200×50 terminal has:
- `200 × 50 × 24 = 240,000 bytes = ~234 KB` per visible screen
- This compact size enables efficient GPU upload and cache-friendly iteration

---

## 5. Three-Tier Rendering

Warp's rendering is split into three tiers, each handling a different level of abstraction.

### Tier 1: WarpUI Framework

WarpUI is Warp's **custom UI framework** (not Electron, not GTK, not SwiftUI).

**Entity-Handle Pattern:**

```rust
// An Entity is a piece of state stored in a global arena
let entity: Entity<TerminalModel> = cx.create_entity(model);

// A Handle is a lightweight reference to an Entity
let handle: Handle<TerminalModel> = entity.handle();

// The Context provides access to entities and the render tree
fn render(&self, cx: &mut Context) -> Element {
    let model = cx.read(self.terminal_handle);
    // ... build element tree from model state
}
```

**View Trait:**

```rust
trait View {
    fn render(&self, cx: &mut ViewContext) -> Element;
    fn on_event(&mut self, event: &Event, cx: &mut ViewContext) -> bool;
}
```

**Element Trees:**
- Views produce `Element` trees (similar to React's virtual DOM)
- Elements are diffed and only changed portions trigger re-renders
- Layout is computed top-down with constraint-based sizing

### Tier 2: GPU Pipeline via wgpu

```
Element Tree
    │
    ▼
Layout Pass (constraints → sizes → positions)
    │
    ▼
Paint Pass (elements → GPU primitives)
    │
    ▼
Vertex Buffers + Texture Atlases
    │
    ▼
wgpu Render Pipeline
    │
    ▼
Platform Compositor
    ├── DirectComposition (Windows)
    └── Metal (macOS)
```

**Platform Integration:**
- **Windows**: DirectComposition for smooth window compositing
- **macOS**: Metal backend via wgpu for GPU-accelerated rendering

### Tier 3: Grid Renderer

The Grid Renderer is the specialized component for rendering terminal cell grids. It's approximately **2,815 lines** of code.

**Cell-by-Cell Rendering Process:**
1. Iterate through visible cells in the grid
2. For each cell, look up the glyph in the font atlas
3. Compute the cell's screen position (column × cell_width, row × cell_height)
4. Generate a textured quad (two triangles) for the glyph
5. Apply foreground color, background color, and decorations (underline, strikethrough)
6. Batch all quads into a single draw call per grid

**Optimizations:**
- Glyph atlas caching — each unique (char, font, size, style) is rasterized once
- Dirty region tracking — only re-render cells that changed
- Batch rendering — hundreds of cells in a single GPU draw call
- Background color runs — adjacent cells with the same bg color are merged into one rect

---

## 6. Input System

Warp has **5 distinct input modes**, each optimized for a different interaction pattern:

| Mode | File Size | Purpose |
|------|-----------|---------|
| **Agent** | ~30 KB | AI agent interaction — multi-line, rich formatting |
| **Classic** | ~18 KB | Traditional terminal input with Warp enhancements |
| **Terminal** | ~13 KB | Raw terminal passthrough (vim, tmux compatibility) |
| **Universal** | ~8 KB | Search, command palette, and universal shortcuts |
| **CLI Agent** | ~8 KB | CLI-based AI agent input mode |

### TerminalAction Enum

The `TerminalAction` enum defines every possible action in the terminal. It spans **751 lines** with **100+ distinct actions**:

```rust
enum TerminalAction {
    // Navigation
    ScrollUp,
    ScrollDown,
    ScrollToTop,
    ScrollToBottom,
    JumpToBlock(BlockId),
    
    // Editing
    InsertText(String),
    DeleteBackward,
    DeleteForward,
    DeleteWord,
    DeleteLine,
    
    // Block operations
    CopyBlock(BlockId),
    SelectBlock(BlockId),
    RerunBlock(BlockId),
    ShareBlock(BlockId),
    
    // AI
    OpenAgentPanel,
    SendToAgent(String),
    AcceptAgentSuggestion,
    RejectAgentSuggestion,
    
    // Terminal control
    SendInterrupt,       // Ctrl+C
    SendEOF,             // Ctrl+D
    SendSuspend,         // Ctrl+Z
    ClearScreen,
    
    // Pane management
    SplitHorizontal,
    SplitVertical,
    FocusNextPane,
    FocusPreviousPane,
    ClosePane,
    
    // ... 70+ more actions
}
```

### Context-Aware Keybindings

Keybindings are resolved based on the current input mode and context:

```
Key Event → Input Mode Router → Mode-specific handler → TerminalAction → Execute
```

The same key can map to different actions depending on the mode:
- `Ctrl+A` in **Classic mode** → Select All (in current block)
- `Ctrl+A` in **Terminal mode** → Passthrough to tmux (prefix key)
- `Ctrl+A` in **Agent mode** → Select all text in agent input

---

## 7. State Management

### Entity-Handle-Context Pattern

Warp uses an **Entity-Handle-Context** pattern (similar to ECS but for UI state):

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│   Entity    │◄────│   Handle   │     │  Context   │
│ (owns data) │     │ (ref to    │────►│ (provides  │
│             │     │  entity)   │     │  access)   │
└────────────┘     └────────────┘     └────────────┘
```

- **Entity**: Owns the actual data (e.g., `TerminalModel`, `BlockList`)
- **Handle**: A lightweight, cloneable reference to an entity (like `Arc<Mutex<T>>` but with framework integration)
- **Context**: Provides methods to read/write entities, subscribe to changes, and trigger re-renders

### FairMutex on TerminalModel

The `TerminalModel` (the core state) is protected by a **FairMutex** — a mutex that prevents writer starvation:

```rust
struct Terminal {
    model: FairMutex<TerminalModel>,
}
```

This is critical because:
- The **PTY reader thread** writes constantly (streaming output)
- The **render thread** reads frequently (60fps)
- A standard mutex could starve the writer or reader
- FairMutex alternates priority between readers and writers

### Effect System

State changes produce **Effects** that describe side effects to execute:

```rust
enum Effect {
    Render,                          // Trigger a re-render
    ScrollTo(ScrollPosition),        // Scroll the viewport
    Focus(Handle<dyn View>),         // Move focus
    PlaySound(SoundEffect),          // Audio feedback
    WriteToClipboard(String),        // System clipboard
    SpawnTask(Future<Output = ()>),  // Async work
    // ...
}
```

### Subscriptions

Views can subscribe to entity changes to trigger re-renders:

```rust
fn init(&mut self, cx: &mut ViewContext) {
    cx.subscribe(self.terminal_handle, |this, _event, cx| {
        cx.notify(); // trigger re-render
    });
}
```

### SumTree for Block Heights

```rust
// SumTree provides O(log n) operations on cumulative values
struct SumTree<T: Item> {
    root: Node<T>,
}

// Each item stores its height
struct BlockHeightItem {
    block_id: BlockId,
    height: f32,
}

// Operations
tree.push(item);                    // O(log n)
tree.summary::<Height>();           // O(log n) — total height
tree.seek_forward(target_y);        // O(log n) — find block at Y
tree.update(block_id, new_height);  // O(log n) — resize block
```

---

## 8. AI Integration

AI is integrated through the `crates/ai/` crate with these sub-modules:

```
crates/ai/
├── agent/              # AI agent logic, conversation management
├── skills/             # Specific capabilities (explain, fix, generate)
├── project_context/    # Project-aware context gathering
└── index/              # Code indexing for AI context
```

### AgentViewVisibility

```rust
enum AgentViewVisibility {
    Hidden,          // Agent panel is not visible
    Collapsed,       // Agent panel is minimized
    Expanded,        // Agent panel is fully visible
    Fullscreen,      // Agent panel takes over the entire view
}
```

### AI Skills
- **Explain**: Explain selected code or command output
- **Fix**: Suggest fixes for errors in command output
- **Generate**: Generate code from natural language description
- **Review**: Code review with inline suggestions

---

## 9. Theming

### Built-in Themes
Warp ships with **20+ built-in themes** including popular options like Dracula, One Dark, Solarized, Catppuccin, and more.

### WarpTheme Struct

```rust
struct WarpTheme {
    // Core colors
    background: Color,              // Terminal background
    foreground: Color,              // Default text color
    accent: Color,                  // UI accent (selections, buttons)
    
    // ANSI 16 colors
    black: Color,
    red: Color,
    green: Color,
    yellow: Color,
    blue: Color,
    magenta: Color,
    cyan: Color,
    white: Color,
    bright_black: Color,
    bright_red: Color,
    bright_green: Color,
    bright_yellow: Color,
    bright_blue: Color,
    bright_magenta: Color,
    bright_cyan: Color,
    bright_white: Color,
    
    // Prompt colors
    prompt_text: Color,             // Prompt text color
    prompt_background: Color,       // Prompt background
    
    // UI chrome
    tab_bar_background: Color,
    sidebar_background: Color,
    border_color: Color,
}
```

### Custom Themes
- Users can create custom themes via YAML files
- **Base16** color scheme support (standardized 16-color palettes)
- **System theme following** — automatic dark/light mode switching based on OS setting
- Theme hot-reloading during development

### Theme File Format

```yaml
# ~/.warp/themes/my_theme.yaml
name: "My Custom Theme"
background: "#1a1b26"
foreground: "#c0caf5"
accent: "#7aa2f7"
black: "#15161e"
red: "#f7768e"
green: "#9ece6a"
yellow: "#e0af68"
blue: "#7aa2f7"
magenta: "#bb9af7"
cyan: "#7dcfff"
white: "#a9b1d6"
# ... bright variants and UI colors
```

---

## 10. Component Hierarchy

```
WarpApplication
├── WindowManager
│   └── Window
│       ├── TitleBar
│       │   ├── TrafficLights (macOS)
│       │   ├── TabBar
│       │   │   ├── Tab (× N)
│       │   │   └── NewTabButton
│       │   └── WindowControls
│       ├── Sidebar
│       │   ├── FileExplorer
│       │   ├── SearchPanel
│       │   └── SettingsPanel
│       └── MainContent
│           ├── TerminalView
│           │   ├── BlockListView
│           │   │   ├── BlockView (× N)
│           │   │   │   ├── HeaderGridView (prompt/command)
│           │   │   │   ├── OutputGridView (command output)
│           │   │   │   └── BlockActions (copy/share/rerun)
│           │   │   └── ScrollBar
│           │   ├── InputArea
│           │   │   ├── PromptRenderer
│           │   │   ├── CommandEditor
│           │   │   └── AutocompletePopup
│           │   └── StatusBar
│           │       ├── WorkingDirectory
│           │       ├── GitBranch
│           │       └── ShellIndicator
│           ├── AgentPanel
│           │   ├── AgentConversation
│           │   ├── AgentSuggestions
│           │   └── AgentStatus
│           └── SplitPane
│               ├── PaneDivider
│               └── TerminalView (recursive)
├── CommandPalette (overlay)
├── NotificationCenter (overlay)
└── SettingsWindow (separate window)
```

---

## Summary of Key Numbers

| Metric | Value |
|--------|-------|
| Total crates | 71+ |
| BlockList code | ~3,949 lines |
| Grid Renderer code | ~2,815 lines |
| TerminalAction variants | 100+ actions (751 lines) |
| Input modes | 5 |
| Cell struct size | 24 bytes |
| Built-in themes | 20+ |
| Block states | 6 |
| Agent input mode | ~30 KB (largest) |

---

*Analysis conducted: June 2025*
