---
name: nexora-memory-system
description: Designs, implements, and maintains Nexora's Memory System including long-term memory, project memory, semantic retrieval, memory ranking, embeddings, summaries, lifecycle management, and context injection. Use whenever implementing memory, recall, embeddings, semantic search, personalization, conversation history, or knowledge persistence.
priority: critical
---

# Nexora Memory System

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system
4. nexora-security
5. nexora-tool-system
6. nexora-context-engine
7. nexora-workspace-system

before modifying memory.

Memory is a platform service.

It is never owned by Chat.

---

# Mission

Create a scalable memory architecture that allows Nexora to remember useful information across conversations, workspaces, and sessions while remaining privacy-first, searchable, and explainable.

Memory should improve AI quality without overwhelming context windows.

---

# Philosophy

Conversation is temporary.

Memory is persistent.

Context is assembled from Memory.

Memory is not chat history.

Memory is structured knowledge.

---

# Core Components

MemoryManager

MemoryStore

MemoryIndexer

EmbeddingEngine

MemoryRetriever

MemoryRanker

MemorySummarizer

MemoryLifecycle

MemoryCompressor

MemoryEvents

MemorySync

MemoryCache

Every component owns one responsibility.

---

# Memory Types

Conversation Memory

Workspace Memory

Global Memory

Preference Memory

Project Memory

Code Memory

Tool Memory

Git Memory

Planning Memory

Decision Memory

Knowledge Memory

Execution Memory

Temporary Memory

Archived Memory

Each memory type has independent policies.

---

# Memory Lifecycle

Create

↓

Embed

↓

Index

↓

Rank

↓

Retrieve

↓

Inject

↓

Compress

↓

Archive

↓

Delete

Memory continuously evolves.

---

# Storage

Memory stores

Title

Summary

Embedding

Source

Timestamp

Workspace

Tags

Importance

Confidence

Author

References

Related memories

Never store raw conversations forever.

---

# Semantic Search

Memory retrieval must support

Keyword search

Embedding similarity

Hybrid search

Recency boosting

Importance boosting

Workspace filtering

Tag filtering

Author filtering

Search should return ranked memories.

---

# Ranking

Score memories using

Semantic similarity

Workspace relevance

Recency

Importance

Frequency

Pinned state

Confidence

User preferences

Ranking should always be deterministic.

---

# Embeddings

Generate embeddings only when necessary.

Avoid duplicate embeddings.

Support

Local models

Cloud providers

Future embedding providers

Embedding generation belongs to EmbeddingEngine.

---

# Context Injection

The Context Engine requests memories.

Memory decides

What

Why

How much

Never inject every memory.

Only inject relevant knowledge.

---

# Compression

Large memories should become summaries.

Old conversations become knowledge.

Duplicate memories merge.

Compression should preserve meaning.

---

# Workspace Memory

Each workspace has isolated memories.

Store

Architecture

Patterns

Commands

Coding conventions

Important files

Known issues

Design decisions

Workspace memory never leaks into unrelated projects.

---

# Global Memory

Stores

User preferences

Favorite models

Coding style

Tool preferences

Common workflows

Assistant behavior

Global memory is available across workspaces.

---

# Privacy

Memory is opt-in.

User can

Search

Export

Delete

Disable

Clear

Audit

Nothing hidden.

---

# Memory Importance

Levels

Critical

High

Normal

Low

Temporary

Expiration policies depend on importance.

---

# Expiration

Temporary memories expire.

Conversation summaries remain.

Project knowledge persists.

Critical memories never expire automatically.

---

# Deduplication

Never store duplicates.

Merge similar memories.

Update confidence.

Maintain references.

---

# Memory Relationships

Support links

Parent

Child

Related

Derived

Superseded

Referenced

Build a knowledge graph.

---

# Events

Publish

MemoryCreated

MemoryUpdated

MemoryDeleted

MemoryMerged

MemoryRetrieved

MemoryCompressed

MemoryArchived

MemoryInjected

Everything observable.

---

# Performance

Lazy embeddings.

Incremental indexing.

Memory caching.

Batch writes.

Background compression.

Avoid blocking AI requests.

---

# Security

Memory obeys SecurityManager.

Workspace isolation enforced.

Sensitive memories encrypted.

Permission checks required.

Memory never bypasses access policies.

---

# Integration

Memory serves

AI

Context Engine

Workspace

Planner

Search

Desktop

CLI

Plugins

Memory owns persistence.

Other systems consume it.

---

# Anti-Patterns

Never

Treat chat history as memory

Store everything

Inject every memory

Duplicate embeddings

Ignore workspace boundaries

Mix global and workspace memory

Perform embedding generation inside providers

Bypass ranking

---

# Testing

Verify

Retrieval quality

Ranking consistency

Workspace isolation

Embedding generation

Compression

Deduplication

Context injection

Performance

Deletion

Export

Import

---

# Architecture Review

✓ Memory independent

✓ AI consumes memory

✓ Workspace-aware

✓ Semantic retrieval

✓ Ranking engine

✓ Embeddings centralized

✓ Privacy-first

✓ Explainable retrieval

✓ Event-driven

✓ Extensible

---

# Decision Tree

Need persistence?

↓

MemoryStore

Need semantic search?

↓

MemoryRetriever

Need embeddings?

↓

EmbeddingEngine

Need ranking?

↓

MemoryRanker

Need summaries?

↓

MemorySummarizer

Need lifecycle?

↓

MemoryLifecycle

Need injection?

↓

Context Engine

---

# Expected Behavior

Act as Nexora's Memory Architect.

Design memory as a reusable platform service, not a chat feature.

Optimize for long-running projects, enterprise repositories, and AI-assisted development over months or years.

Memory should become Nexora's long-term knowledge layer, enabling intelligent recall, personalization, and context-aware assistance across every part of the platform.
