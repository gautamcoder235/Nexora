---
name: nexora-ai-system
description: Designs, implements, reviews, and refactors Nexora's complete AI architecture including agent reasoning, planning, memory, sessions, tool calling, streaming, providers, context management, execution pipelines, and autonomous workflows. Use whenever modifying any AI-related component.
priority: critical
---

# Nexora AI System

This skill governs every AI-related component inside Nexora.

Always follow

1. nexora-architecture
2. nexora-runtime

before modifying AI systems.

AI is not a single module.

It is an ecosystem of specialized components.

Never place everything inside one Agent struct.

---

# Mission

Build an AI platform.

Not a chatbot.

Every AI feature should be reusable.

Composable.

Replaceable.

Observable.

Scalable.

---

# Core Philosophy

Separate Thinking from Acting.

LLM should think.

System should act.

Never allow the LLM direct control over the operating system.

The AI proposes.

The system validates.

The system executes.

---

# AI Layers

Always separate the AI into independent layers.

User

↓

Conversation

↓

Intent Analyzer

↓

Planner

↓

Task Graph

↓

Context Builder

↓

Memory Manager

↓

Model Router

↓

LLM Provider

↓

Tool Resolver

↓

Security Manager

↓

Executor

↓

Streaming Engine

↓

UI

Never skip layers.

---

# AI Components

Every feature belongs to exactly one component.

Intent Analyzer

Planner

Context Builder

Conversation Manager

Session Manager

Memory Manager

Provider Manager

Prompt Builder

Prompt Optimizer

Streaming Engine

Tool Registry

Tool Resolver

Approval Manager

Execution Engine

Response Formatter

Reasoning Engine

Workspace Context

Model Router

Agent Manager

Token Budget Manager

Telemetry

Never merge unrelated responsibilities.

---

# Intent Analyzer

The first AI stage.

Determine

User goal

Task type

Difficulty

Workspace requirement

Tool requirement

Memory requirement

Safety requirement

Do not immediately send prompts to an LLM.

Understand first.

---

# Planner

Planner converts intent into executable steps.

Never allow the LLM to directly execute tools.

Example

User

↓

"Refactor authentication"

↓

Planner

↓

Read files

↓

Analyze architecture

↓

Generate plan

↓

Modify code

↓

Run tests

↓

Review changes

↓

Return summary

Everything becomes a plan.

---

# Task Graph

Every complex task becomes a graph.

Nodes

Read

Write

Analyze

Search

Generate

Execute

Review

Edges

Dependencies

Ordering

Parallelism

Retry

Never execute large tasks linearly if parallel execution is possible.

---

# Agent Manager

AgentManager owns all active agents.

Examples

Coding Agent

Review Agent

Planning Agent

Debug Agent

Search Agent

Git Agent

Documentation Agent

Future agents should register automatically.

Never hardcode agents.

---

# Conversation Manager

Conversation stores

Messages

Tool Calls

Reasoning

Approvals

Attachments

Errors

Summaries

Conversation is state.

Never store conversation inside widgets.

---

# Session Manager

Sessions own

Workspace

Conversation

Selected model

Provider

Permissions

Open tools

Memory references

Sessions survive until explicitly closed.

---

# Context Builder

Context should never be

Entire repository.

Instead build context dynamically.

Sources

Open files

Recent edits

Workspace tree

Git diff

Symbols

Memory

Conversation

Diagnostics

User selection

Relevant documentation

Only include relevant context.

---

# Token Budget

Tokens are limited.

Every request must optimize context.

Priority

Current task

Open files

Git diff

Symbols

Recent messages

Memory

Workspace

Documentation

Discard low-value context.

---

# Prompt Builder

Never hardcode prompts everywhere.

All prompts pass through PromptBuilder.

PromptBuilder combines

System Prompt

Workspace Context

Memory

Task Plan

Tool Results

Conversation

User Prompt

Output Instructions

Prompt generation should be deterministic.

---

# Model Router

Different tasks require different models.

Examples

Reasoning

Claude

Code Generation

GPT

Fast Search

Gemini Flash

Long Analysis

Gemini Pro

Never force one model for everything.

---

# Provider Layer

Providers are engines.

Nothing more.

Provider responsibilities

Authentication

Streaming

Retries

Rate limits

API formatting

Never

Read files

Manage memory

Build prompts

Access workspace

Know UI

---

# Streaming Engine

Streaming is first-class.

Never wait for complete responses.

Support

Token streaming

Tool streaming

Reasoning streaming

Progress updates

Cancellation

Reconnect

Streaming should survive provider changes.

---

# Tool Registry

Every capability is a Tool.

Filesystem

Git

Shell

Workspace

Clipboard

Diagnostics

Browser

Memory

Search

Plugins

Tools register automatically.

---

# Tool Resolution

LLM never executes tools.

Flow

LLM

↓

Planner

↓

Tool Resolver

↓

Security Manager

↓

Approval

↓

Executor

↓

Result

↓

LLM

---

# Memory

Memory is layered.

Short Term

Conversation

Medium

Workspace

Long

Personal Memory

Global

Knowledge

Do not mix memory types.

---

# Workspace Awareness

Every AI operation should understand

Project type

Languages

Frameworks

Dependencies

Structure

Git state

Configuration

Never operate blindly.

---

# Approval System

AI proposes.

User approves.

System executes.

Approval categories

Automatic

Ask Once

Always Ask

Blocked

Never bypass approval.

---

# Response Formatting

AI should return

Answer

Reasoning Summary

Executed Tools

Files Changed

Warnings

Next Actions

Avoid walls of text.

Prefer structured responses.

---

# Autonomous Tasks

Agents may perform multiple steps.

Every step should emit progress.

Every step should be cancellable.

Failures should recover gracefully.

---

# Event Integration

Publish

TaskStarted

ToolRequested

ToolExecuted

PlanGenerated

MemoryUpdated

ResponseStreamStarted

ResponseFinished

SessionClosed

Everything observable.

---

# Error Handling

Never expose raw provider errors.

Convert into actionable messages.

Retry transient failures.

Preserve context.

---

# Performance

Minimize prompt size.

Cache embeddings.

Reuse sessions.

Reuse providers.

Reuse connections.

Lazy initialize expensive components.

Never rebuild context unnecessarily.

---

# Security

Every tool passes SecurityManager.

Never trust AI output.

Never trust generated shell commands.

Validate everything.

---

# Extensibility

Adding

New Provider

New Tool

New Agent

New Memory

New Planner

should require registration only.

Never edit dozens of files.

---

# Testing

Verify

Intent classification

Planning

Streaming

Cancellation

Retries

Tool execution

Approval flow

Memory retrieval

Context building

Provider switching

Session recovery

---

# Architecture Review Checklist

✓ Intent analyzed first

✓ Planner generates execution graph

✓ Context minimized

✓ Prompt centralized

✓ Providers stateless

✓ Tools isolated

✓ Memory layered

✓ Sessions reusable

✓ Streaming first

✓ Security enforced

✓ Approvals respected

✓ EventBus integrated

✓ Performance optimized

✓ Components loosely coupled

---

# Decision Tree

Need reasoning?

↓

Planner

Need execution?

↓

Tool Resolver

Need context?

↓

Context Builder

Need history?

↓

Memory

Need provider?

↓

Model Router

Need execution?

↓

Security Manager

↓

Executor

Need streaming?

↓

Streaming Engine

---

# Anti-Patterns

Never

LLM directly executes commands

Provider accesses filesystem

Widgets manage AI state

Prompt building inside UI

Memory inside providers

Security inside UI

Business logic inside prompts

Monolithic Agent structs

Blocking streams

Massive God Objects

---

# Expected Behavior

Act as the chief AI architect for Nexora.

Prioritize modularity over shortcuts.

Reject tightly coupled AI implementations.

Prefer reusable pipelines.

Every AI decision should make future autonomous agents, MCP integration, plugins, and distributed execution easier.

Always optimize for long-term scalability rather than short-term convenience.
