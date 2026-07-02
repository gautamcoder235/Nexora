---
name: nexora-context-engine
description: Designs, implements, reviews, and optimizes Nexora's Context Engine including workspace indexing, RAG, semantic search, embeddings, memory retrieval, token budgeting, context assembly, summarization, and intelligent codebase understanding. Use whenever implementing AI context generation, retrieval, indexing, embeddings, search, or workspace awareness.
priority: critical
---

# Nexora Context Engine

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security
5. nexora-tool-system

before modifying context-related systems.

Context is the intelligence multiplier.

Better context is more valuable than a larger model.

Never send an entire project to an LLM.

---

# Mission

Provide the smallest possible context that produces the best possible answer.

Every token has value.

Every unnecessary token reduces intelligence.

Context engineering is optimization.

---

# Core Philosophy

Context is assembled.

Not collected.

Never dump.

Always retrieve.

Always rank.

Always compress.

Always optimize.

---

# Context Pipeline

User

↓

Intent Analyzer

↓

Workspace Analyzer

↓

Context Planner

↓

Retriever

↓

Ranker

↓

Token Budget Manager

↓

Prompt Builder

↓

LLM

Never bypass retrieval.

---

# Core Components

Workspace Index

File Index

Symbol Index

Dependency Graph

Embedding Store

Semantic Search

Keyword Search

Git Context

Conversation Context

Memory Context

Context Planner

Token Budget

Prompt Context Builder

Summarizer

Context Cache

Ranking Engine

Never combine unrelated systems.

---

# Workspace Index

Maintain an indexed representation.

Store

Files

Symbols

Classes

Functions

Imports

Dependencies

Documentation

Diagnostics

Generated Files

Ignore

node_modules

target

build

dist

.cache

.git

Temporary files

---

# Symbol Index

Index

Functions

Classes

Methods

Traits

Interfaces

Enums

Structs

Variables

Exports

Imports

Never retrieve whole files when symbols are enough.

---

# Dependency Graph

Track

Imports

Calls

Inheritance

Traits

Interfaces

Modules

Packages

Relationships

Allow graph traversal.

Never search linearly when graph traversal is available.

---

# Semantic Search

Support

Embeddings

Similarity

Intent matching

Concept search

Natural language search

Use semantic retrieval before keyword search when appropriate.

---

# Keyword Search

Support

Ripgrep

Regex

Filename

Extension

Path

Keyword search complements semantic retrieval.

Never replace it.

---

# Context Sources

Workspace

Open Files

Pinned Files

Git Diff

Conversation

Memory

Errors

Diagnostics

Terminal Output

Build Logs

Documentation

Settings

Plugins

Future MCP

Everything becomes context.

---

# Ranking

Rank by

Task relevance

Open files

Recent edits

Git changes

Conversation

Semantic similarity

User selection

Workspace importance

Recency

Never use filesystem order.

---

# Context Compression

Compress

Long conversations

Large files

Documentation

Logs

Previous outputs

Use summaries.

Not truncation.

---

# Token Budget

Every request has a budget.

Priority

Current Task

↓

Selected Files

↓

Open Files

↓

Git Diff

↓

Symbols

↓

Conversation

↓

Memory

↓

Workspace

↓

Documentation

↓

Everything Else

Discard lowest priority first.

---

# Prompt Context

PromptBuilder receives

System Prompt

Task

Workspace

Relevant Files

Symbols

Memory

Conversation

Tool Results

User Prompt

Output Instructions

PromptBuilder owns prompt composition.

No other component builds prompts.

---

# Conversation Context

Track

Messages

Summaries

Tool Calls

Approvals

Plans

Responses

Compress older conversations automatically.

---

# Git Context

Include

Modified files

Diffs

Branches

Recent commits

Current branch

Merge conflicts

Never include full repository history.

---

# Memory Retrieval

Memory layers

Conversation

Workspace

Personal

Knowledge

Project

Retrieve only relevant memories.

---

# Embeddings

Generate embeddings for

Files

Documentation

Symbols

Notes

Workspace

Cache embeddings.

Incrementally update.

Never rebuild everything.

---

# Incremental Indexing

Detect changes.

Update only

Modified files

Deleted files

New files

Avoid full rescans.

---

# Caching

Cache

Embeddings

Indexes

Summaries

Dependency Graph

Context Plans

Reuse whenever possible.

Invalidate intelligently.

---

# Summarization

Summarize

Large files

Long chats

Documentation

Logs

Generated code

Summaries should preserve intent.

Never remove important information.

---

# Workspace Awareness

Automatically detect

Language

Framework

Libraries

Package Manager

Build System

Test Framework

Git

Configuration

Project Type

Adapt retrieval strategy accordingly.

---

# Multi-language Support

Support

Rust

Python

JavaScript

TypeScript

Go

Java

C#

C++

C

PHP

Ruby

Swift

Kotlin

More languages should plug into the same indexing architecture.

---

# Context Events

Publish

WorkspaceIndexed

IndexUpdated

EmbeddingCreated

EmbeddingUpdated

ContextBuilt

ContextCached

RetrievalStarted

RetrievalCompleted

TokenBudgetExceeded

SummaryCreated

Everything observable.

---

# Performance

Lazy indexing.

Incremental indexing.

Parallel indexing.

Cache aggressively.

Never block UI.

Avoid duplicate embeddings.

---

# Anti-Patterns

Never

Load every file

Embed entire repositories repeatedly

Use filesystem order

Ignore token budgets

Duplicate indexes

Store mutable context in UI

Build prompts everywhere

Recompute everything

Ignore Git context

Ignore user selection

---

# Testing

Verify

Index generation

Incremental updates

Retrieval accuracy

Ranking

Compression

Summaries

Embedding cache

Context cache

Prompt generation

Token budgeting

Large repositories

---

# Architecture Review

✓ Workspace indexed

✓ Symbols indexed

✓ Dependency graph maintained

✓ Semantic retrieval

✓ Keyword retrieval

✓ Context ranked

✓ Token budget enforced

✓ Prompt centralized

✓ Incremental indexing

✓ Embeddings cached

✓ Summaries generated

✓ Events published

✓ Performance optimized

---

# Decision Tree

Need relevant code?

↓

Retriever

Need relationships?

↓

Dependency Graph

Need concept search?

↓

Semantic Search

Need exact match?

↓

Keyword Search

Need context size reduction?

↓

Summarizer

Need prompt?

↓

Prompt Builder

Need token optimization?

↓

Token Budget Manager

---

# Expected Behavior

Act as Nexora's Context Engineering Architect.

Maximize answer quality while minimizing token usage.

Favor retrieval over brute force.

Favor indexing over repeated scanning.

Favor summaries over truncation.

Design every context system to scale from small projects to million-line enterprise repositories.

Every context decision should improve AI reasoning, reduce latency, lower API cost, and increase accuracy.
