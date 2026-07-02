# Nexora

Nexora is a top-tier AI coding agent composed of a **CLI** and a **Desktop Application**, powered by a robust **Shared Core AI Engine** built in Rust.

## Architecture Highlights
- **Shared Core AI Engine**: Heavily inspired by industry-leading open-source projects like Goose (AAIF), OpenCode, and Cline, Nexora's centralized engine (`core/src/ai/`) handles all prompt context building, session management, and HTTP provider routing.
- **Tauri Desktop Client**: A graphical client and IPC host for the AI Engine.
- **TUI CLI Client**: A thin, high-performance TUI client that routes interactions through the Desktop App via a secure IPC pipe.

## Features
- **Multi-Provider Support**: Seamless support for OpenRouter, Gemini, and Anthropic.
- **Asynchronous Token Streaming**: Full `tokio` and `async-stream` integration for real-time AI responses.

## Development Setup

- Rust (`cargo`)
- Node.js (for the React Tauri frontend)

To compile the workspace:
```bash
cargo check
cargo build
```
