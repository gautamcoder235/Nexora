# Project Architecture

## Components Overview
Welcome to your project's architectural map. Define system components and structures here.

## Technology Stack
- Frontend: React + TypeScript
- Backend: Rust + Tauri
- Database: Client-side JSON cache

## System Context
```mermaid
graph TD
  Agent[Agent CLI] --> PTY[PTY Process]
  PTY --> Dashboard[Orchestrator UI]
```
