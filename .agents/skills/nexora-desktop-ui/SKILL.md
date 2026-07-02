---
name: nexora-desktop-ui
description: Designs, implements, and maintains Nexora's Desktop UI architecture including layout system, docking, window management, panels, animations, state synchronization, accessibility, theming, responsive design, and interaction patterns. Use whenever implementing desktop UI, layouts, panels, widgets, themes, animations, or user interactions.
priority: critical
---

# Nexora Desktop UI

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

before modifying the Desktop UI.

UI is a consumer of platform services.

UI never owns business logic.

---

# Mission

Build a modern desktop experience comparable to Cursor, VS Code, Warp, Arc Browser, Raycast, Claude Desktop and JetBrains.

The interface should feel responsive, polished, consistent, and distraction-free.

---

# Philosophy

Platform

↓

State

↓

View Model

↓

Components

↓

Rendering

↓

Animation

↓

Interaction

Never let UI directly communicate with backend services.

---

# Core Components

DesktopShell

WindowManager

LayoutManager

DockManager

PanelManager

SidebarManager

StatusBarManager

CommandPalette

NotificationCenter

ThemeManager

AnimationEngine

ModalManager

OverlayManager

ShortcutManager

FocusManager

WorkspaceView

ChatView

EditorView

TerminalView

SettingsView

ActivityBar

ContextMenus

QuickActions

Every component owns exactly one responsibility.

---

# Layout Architecture

Support

Docking

Resizable panels

Floating panels

Split views

Tabbed panels

Collapsible sidebars

Pinned views

Detached windows

Persistent layouts

Multi-monitor layouts

Everything must restore automatically.

---

# Window Management

Support

Single window

Multiple windows

Workspace windows

Floating tool windows

Popup dialogs

Inspector windows

Fullscreen

Compact mode

Never hardcode layouts.

---

# Panels

Core panels

Explorer

AI Chat

Editor

Terminal

Git

Memory

Problems

Output

Search

Extensions

Settings

Logs

Performance

Debugger

Panels register dynamically.

---

# State Management

UI state belongs in dedicated stores.

Business state belongs in Runtime.

Never duplicate state.

Never synchronize manually.

Use reactive updates.

---

# Theme System

Support

Dark

Light

OLED

High Contrast

Custom themes

Dynamic accent colors

Semantic color tokens

Rounded corners

Glass effects where supported

Never hardcode colors.

---

# Animations

Animate

Panel transitions

Sidebar

Loading

AI streaming

Notifications

Progress

Hover

Focus

Context menus

Window transitions

Animations should remain under performance budgets.

---

# Accessibility

Support

Keyboard navigation

Screen readers

High contrast

Reduced motion

Scalable fonts

Accessible colors

Focus indicators

Every feature must be usable without a mouse.

---

# Command Palette

Accessible everywhere.

Search

Commands

Files

Settings

Models

Extensions

Recent items

Actions

Memory

Workspace

Providers

Use fuzzy search.

---

# Notifications

Support

Info

Success

Warning

Error

Progress

Persistent

Dismissible

Grouped

History

Notifications never block work.

---

# Interaction Principles

One-click actions.

Minimal confirmation dialogs.

Progressive disclosure.

Keyboard-first.

Mouse-friendly.

Undo whenever possible.

Predictable behavior.

---

# Responsiveness

Support

4K

HiDPI

Ultrawide

Small screens

Scaling

Responsive layouts

Adaptive spacing

Never use fixed pixel layouts.

---

# Event Integration

Subscribe to

Workspace events

Memory events

AI events

Tool events

Security events

Extension events

Performance events

Render from state.

Never poll.

---

# Performance

60 FPS interactions.

Virtualized lists.

Incremental rendering.

Lazy panel loading.

GPU acceleration where appropriate.

Avoid unnecessary re-renders.

---

# Security

Sensitive information must be masked.

Approval dialogs originate from SecurityManager.

UI never bypasses permissions.

---

# Integration

Desktop consumes

Runtime

Workspace

AI

Memory

Context

Security

Extensions

Performance

Events

Desktop owns presentation only.

---

# Anti-Patterns

Never

Put business logic in components

Call backend directly

Duplicate runtime state

Hardcode layouts

Block UI thread

Mix rendering and logic

Ignore accessibility

---

# Testing

Verify

Layout restoration

Docking

Themes

Animations

Keyboard navigation

Accessibility

Performance

Multiple monitors

Scaling

State synchronization

---

# Architecture Review

✓ Component based

✓ State driven

✓ Docking system

✓ Theme engine

✓ Keyboard first

✓ Accessible

✓ Responsive

✓ Animation engine

✓ Event driven

✓ Runtime separation

---

# Decision Tree

Need new feature?

↓

Create a component

Need persistent state?

↓

Runtime

Need visual state?

↓

UI Store

Need animation?

↓

AnimationEngine

Need overlay?

↓

OverlayManager

Need panel?

↓

PanelManager

Need window?

↓

WindowManager

---

# Expected Behavior

Act as Nexora's Desktop UI Architect.

Design every screen as if it will be used for thousands of hours by professional developers.

Prioritize consistency, speed, keyboard workflows, accessibility, and scalability.

Every interaction should feel deliberate, polished, and responsive.
