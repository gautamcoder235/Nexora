---
name: nexora-cli-tui
description: Designs, implements, and maintains Nexora's terminal user interface including cockpit architecture, command mode, chat mode, layouts, widgets, keyboard system, rendering pipeline, streaming UI, overlays, panels, and terminal UX. Use whenever implementing terminal interfaces, ratatui widgets, CLI UX, command palette, streaming chat, or keyboard workflows.
priority: critical
---

# Nexora CLI/TUI

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security
5. nexora-tool-system
6. nexora-context-engine
7. nexora-workspace-system
8. nexora-memory-system
9. nexora-extension-platform
10. nexora-performance
11. nexora-desktop-ui

before modifying the CLI.

The CLI is a first-class client.

Never treat it as a simplified desktop.

---

# Mission

Build the best terminal AI experience available.

The experience should rival or exceed

Claude Code

Gemini CLI

Warp

LazyGit

K9s

Bottom

GitUI

Helix

Zellij

LazyDocker

The terminal should feel like a professional IDE.

---

# Philosophy

Runtime

↓

ViewModel

↓

Layout

↓

Widgets

↓

Renderer

↓

Terminal

Never place business logic inside widgets.

---

# Core Components

Cockpit

LayoutManager

WidgetManager

Renderer

TerminalEngine

KeyboardManager

MouseManager

OverlayManager

PanelManager

CommandPalette

AutocompleteEngine

ThemeManager

AnimationManager

StatusBar

TabManager

SplitManager

NotificationManager

InputManager

ChatRenderer

MarkdownRenderer

StreamingRenderer

ProgressRenderer

ApprovalOverlay

PopupManager

HelpSystem

Every component owns one responsibility.

---

# Layout

Support

Horizontal splits

Vertical splits

Resizable panes

Tabbed views

Fullscreen

Floating overlays

Persistent layouts

Workspace restoration

Never hardcode dimensions.

---

# Panels

Support

AI Chat

Explorer

Terminal

Logs

Git

Memory

Workspace

Models

Extensions

Performance

Diagnostics

Problems

Tasks

Settings

Panels register dynamically.

---

# Rendering

Rendering must be incremental.

Only redraw changed widgets.

Avoid full-screen redraws.

Support

Unicode

ASCII fallback

24-bit color

ANSI fallback

Wide glyphs

Emoji fallback

Terminal capability detection

---

# Keyboard System

Support

Multi-key bindings

Leader keys

Modal editing

Global shortcuts

Context shortcuts

Vim mode

Emacs mode

Custom bindings

Every action must be keyboard accessible.

---

# Mouse Support

Support

Click

Double click

Drag

Resize

Scroll

Selection

Context menus

Hover

Mouse remains optional.

---

# Command Palette

Global shortcut

Ctrl+K

Ctrl+P

Search

Commands

Models

Providers

Extensions

Files

Settings

Memory

History

Workspace

Fuzzy search required.

---

# Chat

Support

Streaming responses

Markdown

Syntax highlighting

Code blocks

Tables

Images (future)

Diff rendering

Tool execution

Approval requests

Token usage

Reasoning indicators

Conversation tree

Chat should feel instantaneous.

---

# Widgets

Provide reusable widgets

Tables

Lists

Trees

Inputs

Markdown

Progress

Charts

Logs

Alerts

Tabs

Panels

Cards

Inspector

Timeline

Every widget reusable.

---

# Status Bar

Display

Workspace

Branch

Model

Provider

Latency

Memory usage

CPU

Notifications

Tasks

Connection

Never clutter.

---

# Overlays

Support

Command Palette

Approvals

Search

Quick Open

Help

Settings

Notifications

Tool Details

Model Picker

Provider Picker

Workspace Switcher

Always modal.

---

# Streaming

Stream

AI tokens

Logs

Progress

Downloads

Commands

Diffs

Never freeze input while streaming.

---

# Themes

Support

Dark

Light

OLED

High Contrast

Minimal

ANSI

Custom themes

Theme tokens shared with Desktop.

---

# Accessibility

Support

Screen readers

Keyboard only

Reduced motion

Color blind themes

Large fonts

ASCII mode

---

# Performance

Startup under 100 ms.

Incremental rendering.

Virtualized lists.

Widget reuse.

Minimal allocations.

Stable 60 FPS equivalent terminal updates.

---

# Event Integration

Subscribe to

Workspace

Memory

AI

Security

Performance

Extensions

Git

Diagnostics

Never poll.

---

# Security

Approval dialogs originate from SecurityManager.

Commands never execute directly.

Clipboard access requires permissions.

Sensitive data masked.

---

# Integration

CLI consumes

Runtime

Workspace

Memory

AI

Context

Security

Extensions

Performance

Events

CLI owns presentation only.

---

# Anti-Patterns

Never

Put logic in widgets

Duplicate runtime state

Block rendering

Perform filesystem operations from UI

Implement custom networking

Ignore terminal capabilities

Bypass SecurityManager

---

# Testing

Verify

Rendering

Keyboard

Mouse

Layouts

Streaming

Approvals

Performance

Themes

Terminal compatibility

Resize handling

---

# Architecture Review

✓ Component driven

✓ Incremental renderer

✓ Shared runtime

✓ Keyboard first

✓ Streaming

✓ Modular widgets

✓ Theme sharing

✓ Event driven

✓ Security integrated

✓ High performance

---

# Decision Tree

Need new feature?

↓

Widget

Need layout?

↓

LayoutManager

Need popup?

↓

OverlayManager

Need keyboard?

↓

KeyboardManager

Need rendering?

↓

Renderer

Need chat?

↓

ChatRenderer

Need streaming?

↓

StreamingRenderer

Need status?

↓

StatusBar

---

# Expected Behavior

Act as Nexora's CLI/TUI Architect.

Every feature must feel native to terminal users.

Design for speed, discoverability, keyboard-first workflows, and long-running AI sessions.

The CLI should be capable of replacing the desktop application for power users while sharing the same Runtime, Workspace, Memory, AI, Security, and Extension platform.
