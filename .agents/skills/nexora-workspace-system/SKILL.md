---
name: nexora-workspace-system
description: Designs, implements, and maintains Nexora's Workspace Intelligence System including project discovery, indexing orchestration, language detection, dependency graphs, file watching, diagnostics, Git awareness, and workspace lifecycle. Use whenever implementing project scanning, workspace management, language services, indexing, diagnostics, or filesystem monitoring.
priority: critical
---

# Nexora Workspace Intelligence

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security
5. nexora-tool-system
6. nexora-context-engine

before modifying workspace systems.

Workspace is the heart of Nexora.

Everything revolves around the active workspace.

Never allow unrelated components to scan the filesystem independently.

---

# Mission

Maintain a live, intelligent representation of the user's project.

Every subsystem should query Workspace.

Nothing should scan the filesystem directly.

---

# Philosophy

Workspace is not a folder.

Workspace is a continuously updated knowledge graph.

It should always know

Project

Languages

Frameworks

Dependencies

Git State

Build System

Tests

Diagnostics

Symbols

Configuration

Open Files

Generated Files

Ignore Rules

Everything else depends on Workspace.

---

# Core Components

WorkspaceManager

ProjectDetector

LanguageDetector

FrameworkDetector

DependencyAnalyzer

FileWatcher

WorkspaceIndex

DiagnosticsManager

BuildManager

GitManager

WorkspaceCache

WorkspaceState

WorkspaceEvents

WorkspaceMetadata

Never merge responsibilities.

---

# Workspace Lifecycle

Create

↓

Open

↓

Scan

↓

Detect

↓

Index

↓

Watch

↓

Update

↓

Cache

↓

Close

Workspace exists independently from UI.

---

# Project Detection

Automatically detect

Rust

Cargo

Node

Python

Go

Java

C#

C++

CMake

Flutter

Unity

Unreal

React

Next.js

Vue

Angular

Laravel

Django

FastAPI

Spring

ASP.NET

Electron

Tauri

More frameworks should register through detectors.

---

# Language Detection

Never assume.

Detect by

Extensions

Build Files

Configuration

Project Metadata

Language Servers

Support multiple languages simultaneously.

---

# Dependency Analysis

Build dependency graphs.

Track

Packages

Modules

Imports

Exports

Workspace references

Monorepos

Never repeatedly parse dependency files.

---

# Workspace Index

Workspace owns

File index

Directory index

Symbol index

Dependency graph

Language metadata

Git metadata

Configuration metadata

Diagnostics

The Context Engine consumes these indexes.

---

# File Watching

Use native filesystem watchers.

Detect

Create

Modify

Delete

Rename

Move

Batch updates.

Avoid full rescans.

---

# Ignore Rules

Respect

.gitignore

.nexoraignore

target

build

dist

node_modules

vendor

.cache

Generated files

User exclusions

Never index ignored paths.

---

# Git Awareness

Track

Current branch

Status

Modified files

Conflicts

Staged files

Recent commits

Remote state

Workspace should publish Git events.

---

# Diagnostics

Collect

Compiler errors

Warnings

LSP diagnostics

Build failures

Runtime issues

Lint messages

Expose diagnostics through Workspace.

---

# Build Systems

Detect

Cargo

npm

pnpm

yarn

bun

pip

poetry

gradle

maven

cmake

msbuild

Make

Build information belongs to Workspace.

---

# Multi-root Workspaces

Support

Single project

Monorepo

Nested projects

Linked workspaces

Never assume one root.

---

# Workspace Cache

Cache

Project metadata

Indexes

Dependency graph

Language metadata

Git metadata

Diagnostics

Invalidate intelligently.

---

# Events

Publish

WorkspaceOpened

WorkspaceClosed

WorkspaceIndexed

WorkspaceUpdated

FileCreated

FileDeleted

FileModified

LanguageDetected

FrameworkDetected

DependencyChanged

GitChanged

DiagnosticsUpdated

Everything observable.

---

# Performance

Incremental scanning.

Parallel scanning.

Lazy indexing.

Memory-efficient caches.

Avoid duplicate parsing.

Never block UI.

---

# Security

Never index outside workspace.

Respect ignore rules.

Never expose excluded files to AI.

Workspace never bypasses SecurityManager.

---

# Integration

Workspace provides data to

Context Engine

AI Planner

Tool Registry

Search

Diagnostics

Git

Plugins

Desktop

CLI

Everything queries Workspace.

Workspace queries nothing except Runtime services.

---

# Anti-Patterns

Never

Recursive rescans

Duplicate indexes

Multiple filesystem watchers

Independent Git scanners

Hardcoded language logic

UI-owned workspace state

Direct filesystem access outside Workspace

---

# Testing

Verify

Project detection

Framework detection

Language detection

Monorepo support

File watching

Incremental indexing

Git tracking

Diagnostics

Workspace caching

Large repositories

---

# Architecture Review

✓ Workspace centralized

✓ File watching incremental

✓ Language detection modular

✓ Framework detection modular

✓ Git integrated

✓ Diagnostics centralized

✓ Multi-root supported

✓ Ignore rules respected

✓ Events published

✓ Cache optimized

✓ AI consumes Workspace

✓ UI independent

---

# Decision Tree

Need project metadata?

↓

WorkspaceManager

Need language?

↓

LanguageDetector

Need framework?

↓

FrameworkDetector

Need dependencies?

↓

DependencyAnalyzer

Need file updates?

↓

FileWatcher

Need Git?

↓

GitManager

Need diagnostics?

↓

DiagnosticsManager

Need indexes?

↓

WorkspaceIndex

---

# Expected Behavior

Act as Nexora's Workspace Architect.

Ensure every subsystem relies on Workspace instead of performing its own filesystem logic.

Optimize for very large repositories, monorepos, enterprise projects, and future cloud workspaces.

Workspace should become the single source of truth for project intelligence.
