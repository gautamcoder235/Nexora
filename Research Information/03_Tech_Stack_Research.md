# 03 — Tech Stack Research

> Package versions, integration patterns, and code examples for the Multi Vibe tech stack.

---

## Package Versions Overview

| Package | Version | Source | Purpose |
|---------|---------|--------|---------|
| Tauri | v2 (latest) | `npm create tauri-app` | Desktop framework |
| tauri-plugin-pty | 0.2.1 | Rust crate (crates.io) | PTY management |
| tauri-pty | (npm companion) | npm | Frontend PTY bindings |
| portable-pty | 0.9.0 | Rust crate (from wezterm) | Cross-platform PTY abstraction |
| xterm.js | 6.0.0 | npm | Terminal emulator UI |
| @xterm/addon-webgl | (latest) | npm | GPU-accelerated rendering |
| @xterm/addon-fit | 0.11.0 | npm | Auto-resize terminal to container |
| React | 18+ | npm | UI framework |
| TypeScript | 5+ | npm | Type-safe JavaScript |
| Zustand | 4+ | npm | State management |

---

## 1. Tauri v2 Scaffold

### Scaffold Command

```bash
npm create tauri-app@latest my-app -- --template react-ts --manager npm
```

This creates a project with:

```
my-app/
├── src/                    # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Tauri entry point
│   │   └── lib.rs          # Tauri commands
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   └── capabilities/       # Permission definitions
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Tauri Configuration (`tauri.conf.json`)

```json
{
  "productName": "Multi Vibe",
  "version": "0.1.0",
  "identifier": "com.multivibe.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Multi Vibe",
        "width": 1400,
        "height": 900,
        "decorations": false,
        "transparent": true
      }
    ]
  }
}
```

---

## 2. PTY Integration

### Rust Side — `tauri-plugin-pty` 0.2.1

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-pty = "0.2.1"
```

Register in `src-tauri/src/lib.rs`:

```rust
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_pty::init())
        .run(tauri::generate_context!())
        .expect("error while running Multi Vibe");
}
```

### PTY Spawn Example (Rust)

Using `portable-pty` 0.9.0 directly for more control:

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};

fn spawn_pty_shell() -> Result<(), Box<dyn std::error::Error>> {
    // Create PTY system
    let pty_system = native_pty_system();
    
    // Configure PTY size (columns × rows)
    let pty_size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    // Open a new PTY pair (master + slave)
    let pair = pty_system.openpty(pty_size)?;
    
    // Build the shell command
    let mut cmd = CommandBuilder::new_default_prog();
    
    // Set environment variables
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    
    // Spawn the shell in the PTY
    let mut child = pair.slave.spawn_command(cmd)?;
    
    // Get the master (read/write end)
    let mut reader = pair.master.try_clone_reader()?;
    let mut writer = pair.master.take_writer()?;
    
    // Read output from the PTY (spawn in a thread)
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,  // EOF
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]);
                    // Send output to frontend via Tauri event
                    println!("PTY output: {}", output);
                }
                Err(e) => {
                    eprintln!("PTY read error: {}", e);
                    break;
                }
            }
        }
    });
    
    // Write input to the PTY
    writer.write_all(b"echo 'Hello from Multi Vibe'\n")?;
    
    // Wait for the child process
    let status = child.wait()?;
    println!("Shell exited with: {:?}", status);
    
    Ok(())
}
```

### PTY Resize

```rust
use portable_pty::PtySize;

fn resize_pty(
    master: &dyn portable_pty::MasterPty,
    cols: u16,
    rows: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    Ok(())
}
```

### Frontend Side — `tauri-pty` (npm)

```bash
npm install tauri-pty
```

```typescript
import { spawn, ShellType } from 'tauri-pty';

// Spawn a PTY shell
const pty = await spawn({
  shell: ShellType.Default,  // Uses system default shell
  cols: 80,
  rows: 24,
  cwd: '/home/user/project',
  env: {
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  },
});

// Listen for output
pty.onData((data: string) => {
  // Feed data to xterm.js
  terminal.write(data);
});

// Send input
pty.write('ls -la\n');

// Resize
pty.resize(120, 40);

// Cleanup
pty.kill();
```

---

## 3. xterm.js Setup

### Installation

```bash
npm install @xterm/xterm @xterm/addon-webgl @xterm/addon-fit
```

### Complete xterm.js Setup with WebGL

```typescript
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/**
 * Creates and configures an xterm.js terminal with WebGL rendering.
 */
function createTerminal(container: HTMLElement): Terminal {
  // Create terminal instance
  const terminal = new Terminal({
    // Appearance
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 14,
    lineHeight: 1.3,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    
    // Colors (dark glassmorphism theme)
    theme: {
      background: '#0a0e1a',          // Deep space blue
      foreground: '#e0e6f0',          // Soft white
      cursor: '#7c5cbf',             // Purple accent
      cursorAccent: '#0a0e1a',
      selectionBackground: '#7c5cbf44',
      selectionForeground: '#ffffff',
      
      // ANSI colors
      black: '#1a1e2e',
      red: '#ff6b6b',
      green: '#4ecdc4',
      yellow: '#ffe66d',
      blue: '#4a9eff',
      magenta: '#c77dff',
      cyan: '#72efdd',
      white: '#e0e6f0',
      brightBlack: '#3a3e4e',
      brightRed: '#ff8a8a',
      brightGreen: '#6ee7de',
      brightYellow: '#fff09a',
      brightBlue: '#79b8ff',
      brightMagenta: '#d9a6ff',
      brightCyan: '#9af5e8',
      brightWhite: '#ffffff',
    },
    
    // Performance
    scrollback: 10000,
    fastScrollModifier: 'alt',
    fastScrollSensitivity: 5,
    
    // Behavior
    allowTransparency: true,
    macOptionIsMeta: true,
    rightClickSelectsWord: true,
  });

  // Load addons
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Open terminal in the container
  terminal.open(container);

  // Load WebGL addon AFTER opening (requires canvas context)
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      console.warn('WebGL context lost, falling back to canvas');
      webglAddon.dispose();
    });
    terminal.loadAddon(webglAddon);
    console.log('WebGL renderer loaded successfully');
  } catch (e) {
    console.warn('WebGL not available, using canvas renderer:', e);
  }

  // Fit terminal to container
  fitAddon.fit();

  // Re-fit on window resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(container);

  return terminal;
}
```

### React Component

```tsx
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  id: string;
  cwd?: string;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ id, cwd }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: 'rgba(10, 14, 26, 0.85)',
        foreground: '#e0e6f0',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL not available');
    }

    fitAddon.fit();
    terminalRef.current = terminal;

    // Connect to PTY backend here
    // ...

    return () => {
      terminal.dispose();
    };
  }, [id]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(10, 14, 26, 0.85)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    />
  );
};
```

---

## 4. CLI Agent Detection

Multi Vibe detects existing CLI AI agents installed on the user's system rather than bundling its own.

### Target Agents

| Agent | Binary Name | Description |
|-------|------------|-------------|
| Claude Code | `claude` | Anthropic's CLI coding agent |
| OpenAI Codex | `codex` | OpenAI's CLI coding agent |
| Gemini CLI | `gemini` | Google's CLI coding agent |

### Detection in Rust

```rust
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedAgent {
    pub name: String,
    pub binary: String,
    pub path: Option<String>,
    pub version: Option<String>,
    pub available: bool,
}

/// Detect which CLI AI agents are available on the system.
/// Uses `where.exe` on Windows, `which` on Unix.
pub fn detect_cli_agents() -> Vec<DetectedAgent> {
    let agents_to_check = vec![
        ("Claude Code", "claude"),
        ("OpenAI Codex", "codex"),
        ("Gemini CLI", "gemini"),
    ];

    agents_to_check
        .into_iter()
        .map(|(name, binary)| {
            let (available, path) = find_binary(binary);
            let version = if available {
                get_agent_version(binary)
            } else {
                None
            };

            DetectedAgent {
                name: name.to_string(),
                binary: binary.to_string(),
                path,
                version,
                available,
            }
        })
        .collect()
}

/// Find a binary on the system PATH.
fn find_binary(binary_name: &str) -> (bool, Option<String>) {
    #[cfg(target_os = "windows")]
    let result = Command::new("where.exe")
        .arg(binary_name)
        .output();

    #[cfg(not(target_os = "windows"))]
    let result = Command::new("which")
        .arg(binary_name)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            (true, Some(path))
        }
        _ => (false, None),
    }
}

/// Try to get the version of an agent binary.
fn get_agent_version(binary: &str) -> Option<String> {
    Command::new(binary)
        .arg("--version")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(
                    String::from_utf8_lossy(&output.stdout)
                        .trim()
                        .to_string(),
                )
            } else {
                None
            }
        })
}

/// Tauri command to expose agent detection to frontend.
#[tauri::command]
pub fn detect_agents() -> Vec<DetectedAgent> {
    detect_cli_agents()
}
```

### Frontend Usage

```typescript
import { invoke } from '@tauri-apps/api/core';

interface DetectedAgent {
  name: string;
  binary: string;
  path: string | null;
  version: string | null;
  available: boolean;
}

/**
 * Detect available CLI AI agents on the system.
 */
async function detectAgents(): Promise<DetectedAgent[]> {
  return await invoke<DetectedAgent[]>('detect_agents');
}

// Usage
const agents = await detectAgents();
agents.forEach(agent => {
  if (agent.available) {
    console.log(`✅ ${agent.name} found at ${agent.path} (${agent.version})`);
  } else {
    console.log(`❌ ${agent.name} not found`);
  }
});

// Example output:
// ✅ Claude Code found at C:\Users\user\.claude\bin\claude.exe (1.2.3)
// ❌ OpenAI Codex not found
// ✅ Gemini CLI found at C:\Users\user\AppData\Local\bin\gemini.exe (0.5.0)
```

---

## 5. Integration Pattern — Connecting xterm.js to PTY

The complete data flow from PTY to screen and keyboard to PTY:

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (WebView)                 │
│                                                      │
│  ┌──────────────┐    write()    ┌────────────────┐  │
│  │  xterm.js     │◄────────────│  PTY events     │  │
│  │  (rendering)  │             │  (tauri-pty)    │  │
│  └──────┬───────┘             └────────┬────────┘  │
│         │ onData()                      ▲           │
│         ▼                               │           │
│  ┌──────────────┐    invoke()  ┌────────┴────────┐  │
│  │  Key events   │────────────►│  Tauri IPC      │  │
│  └──────────────┘             └────────┬────────┘  │
└─────────────────────────────────────────┼───────────┘
                                          │
                    ┌─────────────────────┼───────────┐
                    │     Rust Backend    │           │
                    │                     ▼           │
                    │  ┌──────────────────────────┐   │
                    │  │  tauri-plugin-pty         │   │
                    │  │  (portable-pty 0.9.0)    │   │
                    │  └──────────┬───────────────┘   │
                    │             │                    │
                    │             ▼                    │
                    │  ┌──────────────────────────┐   │
                    │  │  System Shell             │   │
                    │  │  (PowerShell / bash / zsh)│   │
                    │  └──────────────────────────┘   │
                    └─────────────────────────────────┘
```

### Full Integration Example

```typescript
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { spawn } from 'tauri-pty';

async function setupTerminalWithPTY(container: HTMLElement) {
  // 1. Create xterm.js terminal
  const terminal = new Terminal({
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 14,
    cursorBlink: true,
    allowTransparency: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);

  try {
    terminal.loadAddon(new WebglAddon());
  } catch (e) {
    console.warn('WebGL not available, using canvas');
  }

  fitAddon.fit();

  // 2. Spawn PTY
  const pty = await spawn({
    cols: terminal.cols,
    rows: terminal.rows,
    cwd: process.cwd(),
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  // 3. Connect PTY output → xterm.js display
  pty.onData((data: string) => {
    terminal.write(data);
  });

  // 4. Connect xterm.js input → PTY input
  terminal.onData((data: string) => {
    pty.write(data);
  });

  // 5. Handle resize
  terminal.onResize(({ cols, rows }) => {
    pty.resize(cols, rows);
  });

  // 6. Handle window resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(container);

  return { terminal, pty, fitAddon };
}
```

---

## Version Compatibility Matrix

| Package | Min Version | Tested Version | Notes |
|---------|------------|---------------|-------|
| Node.js | 18.x | 20.x | Required for Tauri v2 |
| Rust | 1.75+ | 1.82+ | Stable channel |
| Tauri CLI | 2.0 | 2.x (latest) | `cargo install tauri-cli` |
| @xterm/xterm | 5.5+ | 6.0.0 | v6 recommended for WebGL |
| @xterm/addon-webgl | 0.18+ | latest | Must match xterm major version |
| @xterm/addon-fit | 0.10+ | 0.11.0 | Must match xterm major version |
| tauri-plugin-pty | 0.2.0 | 0.2.1 | Check Tauri v2 compatibility |
| portable-pty | 0.8+ | 0.9.0 | From wezterm project |

---

*Research conducted: June 2025*
