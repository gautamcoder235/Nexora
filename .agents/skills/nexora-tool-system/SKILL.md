---
name: nexora-tool-system
description: Designs, implements, reviews, and maintains Nexora's Tool Registry, tool lifecycle, execution engine, capability system, tool metadata, execution pipeline, result handling, and future MCP/plugin integration. Use whenever adding, modifying, reviewing, or refactoring any executable tool.
priority: critical
---

# Nexora Tool System

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security

before implementing tools.

Never build standalone tool implementations.

Everything executable is a Tool.

---

# Mission

Create one unified execution system.

The AI should never know

how

a tool works.

The AI only knows

what

the tool does.

---

# Core Philosophy

Tools are capabilities.

Not business logic.

Every capability must become a Tool.

Never call random services directly.

Always execute through ToolRegistry.

---

# Execution Pipeline

Every execution follows

User

↓

Intent

↓

Planner

↓

Task Graph

↓

Tool Resolver

↓

Tool Registry

↓

Security Manager

↓

Approval Manager

↓

Executor

↓

Result

↓

EventBus

↓

UI

No shortcuts.

---

# Tool Definition

Every tool contains

ID

Name

Description

Category

Capabilities

Input Schema

Output Schema

Permissions

Risk Level

Version

Examples

Never create anonymous tools.

---

# Tool Categories

Filesystem

Workspace

Search

Git

Terminal

Browser

Clipboard

Memory

Diagnostics

Configuration

Provider

Plugin

MCP

Database

Docker

Network

Image

Audio

Document

Future tools belong to categories.

---

# Tool Interface

Every tool implements

Initialize

Validate

Execute

Cancel

Cleanup

Metadata

Health

Never expose internal implementation.

---

# Registration

Every tool registers automatically.

ToolRegistry discovers tools.

Never manually edit giant switch statements.

Prefer registration macros or traits.

---

# Metadata

Every tool exposes metadata.

Example

Tool Name

Description

Permissions

Examples

Arguments

Output

Estimated Duration

Streaming Support

Cancellation Support

Risk

Metadata should be machine-readable.

---

# Input Validation

Never trust AI input.

Validate

Arguments

Paths

URLs

Enums

Limits

Required fields

Reject invalid requests immediately.

---

# Output

Every tool returns

Status

Result

Warnings

Errors

Duration

Metadata

Never return raw strings only.

Use structured results.

---

# Streaming

Support streaming whenever possible.

Examples

File indexing

Terminal

Search

Downloads

Uploads

LLM

Logs

Streaming tools should emit progress events.

---

# Cancellation

Every tool must support cancellation when applicable.

Examples

Search

Shell

Downloads

LLM

Indexing

Cancellation should be graceful.

---

# Tool Context

Every tool receives context.

Workspace

Session

User

Permissions

Configuration

Credentials

Logger

EventBus

Never access globals directly.

---

# Security

Every execution passes SecurityManager.

Tools never bypass permissions.

Never execute before approval.

---

# Error Handling

Every tool returns structured errors.

Examples

PermissionDenied

NotFound

InvalidInput

NetworkFailure

ExecutionFailure

Cancelled

Timeout

Do not panic.

Never hide failures.

---

# Filesystem Tools

Separate tools.

ReadFile

WriteFile

EditFile

CreateFile

DeleteFile

MoveFile

CopyFile

RenameFile

Never combine unrelated actions.

---

# Git Tools

Separate

Status

Commit

Diff

Branch

Checkout

Merge

Log

Blame

Push

Pull

Each operation is independent.

---

# Shell Tools

One command.

One execution.

No chained commands.

No shell injection.

Validate before execution.

---

# Search Tools

Examples

Find Files

Ripgrep

Symbols

Definitions

References

Workspace Index

Use indexes whenever possible.

---

# Browser Tools

Open URL

Fetch Page

Download

Extract Content

Screenshot

DOM Query

Separate tools.

---

# Memory Tools

Store Memory

Search Memory

Delete Memory

List Memory

Update Memory

Never expose storage implementation.

---

# Tool Composition

Complex tasks should compose tools.

Never create giant tools.

Example

Refactor Project

↓

Search Files

↓

Read Files

↓

Analyze

↓

Edit Files

↓

Run Tests

↓

Git Diff

↓

Summary

Many tools.

One workflow.

---

# Executor

Executor owns execution.

ToolRegistry owns discovery.

Security owns validation.

Do not mix responsibilities.

---

# Parallel Execution

Independent tools may run simultaneously.

Examples

Read files

Workspace scan

Index lookup

Git status

Provider lookup

Planner decides.

Executor schedules.

---

# Retry Policy

Retry only

Network

Temporary locks

Timeouts

Never retry

Delete

Write

Shell

Git commit

Automatically.

---

# Tool Events

Publish

ToolRequested

ToolStarted

ToolProgress

ToolCompleted

ToolFailed

ToolCancelled

ToolApproved

ToolBlocked

Everything observable.

---

# Metrics

Collect

Execution Time

Failure Rate

Latency

Memory Usage

Success Rate

Cancellation Rate

Streaming Duration

Metrics belong to Runtime.

---

# Plugin Integration

Plugins register tools.

Plugins never modify ToolRegistry directly.

Capabilities determine visibility.

---

# MCP Integration

Remote MCP servers expose tools.

Local tools

and

Remote tools

must look identical.

Planner should not care.

---

# Future Cloud

Cloud workers should execute tools.

Executor abstracts location.

Local

Remote

Container

VM

WASM

Transparent execution.

---

# Anti-Patterns

Never

Huge switch statements

Global tool instances

Direct filesystem calls

Tool execution inside UI

Security inside Tool

Provider inside Tool

Business logic inside Executor

Duplicated tools

Monolithic Tool structs

---

# Testing

Verify

Registration

Validation

Permissions

Cancellation

Streaming

Errors

Retries

Composition

Parallel execution

Metrics

---

# Architecture Review

✓ Registry centralized

✓ Tools isolated

✓ Structured inputs

✓ Structured outputs

✓ Security enforced

✓ Streaming supported

✓ Cancellation implemented

✓ Metadata complete

✓ Events published

✓ Metrics collected

✓ Plugin-ready

✓ MCP-ready

✓ Cloud-ready

---

# Decision Tree

Need capability?

↓

Create Tool

Need execution?

↓

Executor

Need discovery?

↓

Registry

Need validation?

↓

Security

Need progress?

↓

Streaming

Need cancellation?

↓

Cancellation Token

Need composition?

↓

Planner

Need remote execution?

↓

MCP

---

# Expected Behavior

Act as Nexora's Tool System Architect.

Every executable capability must become a Tool.

Reject tightly coupled implementations.

Encourage reusable, composable tools.

Design for future MCP, plugins, cloud workers, distributed execution, and autonomous AI agents.

The Tool System should be capable of scaling from 20 tools to 500+ tools without architectural changes.
