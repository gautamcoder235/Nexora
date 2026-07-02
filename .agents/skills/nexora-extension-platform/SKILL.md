---
name: nexora-extension-platform
description: Designs, implements, and maintains Nexora's Extension Platform including plugins, extensions, MCP integration, SDK, lifecycle management, permissions, extension registry, marketplace preparation, hot reloading, and sandboxing. Use whenever implementing plugins, extensions, MCP servers, SDKs, custom providers, integrations, or third-party capabilities.
priority: critical
---

# Nexora Extension Platform

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security
5. nexora-tool-system
6. nexora-context-engine
7. nexora-workspace-system
8. nexora-memory-system

before modifying extensions.

Extensions are platform components.

They never become part of the core.

---

# Mission

Create a secure, scalable extension platform that allows developers to extend Nexora without modifying the core application.

Extensions should integrate naturally with every major subsystem while remaining isolated, permission-based, and independently updatable.

---

# Philosophy

Core remains small.

Features become extensions.

Extensions are isolated.

Communication happens through stable APIs.

Nothing accesses internal modules directly.

---

# Core Components

ExtensionManager

ExtensionLoader

ExtensionRegistry

ExtensionSandbox

ExtensionRuntime

ExtensionManifest

ExtensionHost

ExtensionContext

ExtensionPermissions

ExtensionLifecycle

ExtensionEvents

ExtensionStore

ExtensionCache

ExtensionSDK

Each owns exactly one responsibility.

---

# Extension Types

Tool Extensions

AI Provider Extensions

Model Extensions

UI Extensions

Theme Extensions

Language Extensions

Formatter Extensions

Linter Extensions

Search Extensions

Git Extensions

Terminal Extensions

Memory Extensions

Workspace Extensions

Context Extensions

Cloud Extensions

MCP Extensions

Automation Extensions

Future extension categories must register dynamically.

---

# Manifest

Every extension provides

id

name

version

author

description

entrypoint

permissions

minimum_version

supported_platforms

dependencies

capabilities

activation_events

commands

settings

Never load extensions without a valid manifest.

---

# Lifecycle

Discover

↓

Validate

↓

Resolve Dependencies

↓

Load

↓

Initialize

↓

Activate

↓

Execute

↓

Suspend

↓

Unload

↓

Update

↓

Remove

No extension skips lifecycle stages.

---

# Activation

Support

On Startup

On Command

On Workspace Open

On Language

On File Type

On Event

On AI Request

On Demand

Lazy activation is preferred.

---

# SDK

Expose stable APIs only.

Examples

Workspace API

Memory API

Tool API

AI API

Context API

Events API

Git API

UI API

Logging API

Configuration API

Never expose internal implementation details.

---

# Permission System

Permissions include

Read Workspace

Write Workspace

Run Commands

Access Network

Access AI

Read Memory

Write Memory

Access Git

Read Config

Write Config

Clipboard

Notifications

Terminal

Dangerous permissions require approval.

---

# Extension Isolation

Extensions never

Access internal structs

Modify runtime state directly

Share memory

Call private APIs

Isolation must be enforced by ExtensionRuntime.

---

# MCP Integration

Support

MCP Clients

MCP Servers

Remote MCP

Local MCP

Tool Discovery

Dynamic Registration

Capability Negotiation

Streaming Responses

Version Negotiation

MCP becomes another extension category.

---

# Event Integration

Extensions subscribe to

WorkspaceOpened

WorkspaceChanged

MemoryUpdated

ToolExecuted

AICompleted

ChatStarted

GitChanged

DiagnosticsUpdated

CommandExecuted

Extensions communicate through EventBus only.

---

# Commands

Extensions may register

Commands

Slash Commands

Command Palette Items

Toolbar Actions

Context Menu Items

Quick Actions

Commands unregister automatically when unloaded.

---

# Configuration

Each extension owns

Default Settings

User Settings

Workspace Settings

Schema Validation

Migration

Configuration remains isolated.

---

# Updates

Support

Manual Updates

Automatic Updates

Rollback

Compatibility Checks

Signature Verification

Broken extensions should never crash Nexora.

---

# Marketplace Preparation

Architecture must support

Extension Registry

Publishing

Ratings

Downloads

Version History

Verified Extensions

Organizations

Private Extensions

Enterprise Distribution

Marketplace implementation remains separate.

---

# Performance

Lazy loading

Background initialization

Cached manifests

Parallel discovery

Incremental activation

Never block startup.

---

# Security

Every extension runs under SecurityManager.

Permission checks occur before execution.

No extension bypasses approval.

Unsigned extensions produce warnings.

Future support for signature verification.

---

# Integration

Extensions consume

Workspace

Memory

Context

AI

Runtime

Security

Tool Registry

Desktop

CLI

Extensions never own platform state.

---

# Anti-Patterns

Never

Hardcode extension paths

Load everything at startup

Expose private APIs

Allow unrestricted filesystem access

Share runtime memory

Duplicate core functionality

Allow extensions to bypass SecurityManager

---

# Testing

Verify

Loading

Activation

Permissions

Dependency resolution

Hot reload

Sandboxing

Crash recovery

Updates

SDK compatibility

Large extension counts

---

# Architecture Review

✓ ExtensionManager centralized

✓ SDK stable

✓ Lifecycle defined

✓ Event-driven

✓ Permission-based

✓ Marketplace ready

✓ MCP integrated

✓ Security enforced

✓ Lazy activation

✓ Hot reload supported

---

# Decision Tree

Need new feature?

↓

Extension

Need new AI provider?

↓

Provider Extension

Need new tool?

↓

Tool Extension

Need new language?

↓

Language Extension

Need MCP?

↓

MCP Extension

Need UI?

↓

UI Extension

Need runtime capability?

↓

SDK API

---

# Expected Behavior

Act as Nexora's Extension Platform Architect.

Every new capability should first be evaluated as an extension rather than a core feature.

The extension platform should be capable of supporting thousands of independently developed extensions while keeping the core stable, secure, and lightweight.

Design for long-term ecosystem growth, enterprise deployments, and a future public marketplace without requiring architectural changes.
