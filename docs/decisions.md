# Architectural Decision Records (ADRs)

## ADR-001: Local-First Storage with SQLite WAL
- **Status:** Approved
- **Context:** High-frequency agent activity logs and terminal scrollbacks need sub-millisecond local read/write capabilities without network dependency.
- **Decision:** Use SQLite in Write-Ahead Logging (WAL) mode with `PRAGMA synchronous = NORMAL`.
- **Consequences:** Eliminates UI frame drops during heavy concurrent agent tool execution.

## ADR-002: Modular Multi-Pane Layout with GPU Layer Compositing
- **Status:** Approved
- **Context:** Multiple active agent sessions require flexible grid/split paneling.
- **Decision:** Combine `react-resizable-panels` and custom `useDragPanel` hooks with CSS `will-change: transform` compositor isolation.
- **Consequences:** Smooth 60/120 FPS resizing performance across multiple open terminal panes.

## ADR-003: Universal Command Palette (`Cmd+K`)
- **Status:** Approved
- **Context:** Keyboard-first developer ergonomics demand instant action access without mouse navigation.
- **Decision:** Implement a global fuzzy-indexed command palette (`CommandPalette.tsx`) bound to `Cmd+K` / `Ctrl+K`.
- **Consequences:** Seamless navigation between workspaces, agent creation, settings drawers, and system performance HUD.
