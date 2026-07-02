---
name: nexora-architecture
description: Enforces Nexora's software architecture, engineering principles, dependency boundaries, implementation workflow, scalability standards, and code review process. Automatically use this skill whenever modifying, designing, reviewing, or extending any part of the Nexora codebase.
priority: highest
---

# Nexora Architecture Guardian

This skill is the highest-priority engineering authority for the Nexora project.

Whenever working inside the Nexora repository, follow this document before making architectural or implementation decisions.

Never optimize for the shortest implementation.

Always optimize for correctness, maintainability, scalability, extensibility, security, and performance.

If a requested implementation conflicts with this architecture, preserve the architecture and implement the feature correctly.

If necessary, explain why a different architecture is better before making changes.

---

# Primary Objective

Your responsibility is to maintain Nexora as a professional AI development platform.

Every implementation should improve one or more of these:

• Maintainability

• Scalability

• Performance

• Security

• Readability

• Testability

• Extensibility

Avoid temporary fixes.

Avoid technical debt.

Avoid architectural shortcuts.

---

# Core Engineering Philosophy

Nexora follows these engineering principles.

1. Modular Architecture

Every module has one responsibility.

2. Separation of Concerns

UI

Business Logic

Infrastructure

AI

Runtime

Storage

must remain separated.

3. Dependency Inversion

High-level modules never depend directly on implementation details.

4. Event Driven Communication

Modules communicate through events whenever possible.

5. Composition over Inheritance.

6. Explicit Interfaces.

7. Stateless Services whenever possible.

8. State lives in one location.

9. Security by default.

10. Performance is a feature.

---

# Implementation Workflow

Before writing code, always execute this workflow mentally.

Step 1

Understand the request completely.

↓

Step 2

Inspect existing implementation.

↓

Step 3

Locate affected modules.

↓

Step 4

Identify existing reusable services.

↓

Step 5

Determine architectural impact.

↓

Step 6

Design the solution.

↓

Step 7

Explain architectural decisions if needed.

↓

Step 8

Implement.

↓

Step 9

Review.

↓

Step 10

Refactor if duplication exists.

Never skip these steps.

---

# Architectural Rules

Always extend existing systems before creating new ones.

Never duplicate functionality.

Never create competing implementations.

Never create parallel managers solving the same problem.

Prefer extension.

Avoid replacement.

---

# Dependency Direction

Always preserve dependency direction.

Application

↓

Runtime

↓

Core Services

↓

AI

↓

Tools

↓

Providers

↓

Utilities

Dependencies never point upward.

Never create circular dependencies.

Never bypass Runtime.

---

# Runtime Ownership

Runtime owns application services.

Runtime is the only source of service resolution.

Examples include

• EventBus

• StateStore

• Scheduler

• JobManager

• NotificationCenter

• SecurityManager

• CredentialManager

• ResourceManager

• SessionManager

Never instantiate these manually throughout the application.

---

# Reuse Before Create

Before creating

a service

a utility

a helper

a module

a component

a manager

first search whether one already exists.

If existing code solves at least 80% of the problem,

extend it.

Do not create duplicates.

---

# Design Standards

Every new feature should answer

Why does this belong here?

Can another module own it?

Will this scale?

Can it be tested?

Can it be reused?

Does it violate boundaries?

Will future AI features benefit?

---

# Code Quality Standards

Code should be

Simple

Explicit

Predictable

Consistent

Readable

Avoid

Magic values

Hidden behavior

Deep nesting

God objects

Global mutable state

Excessive abstraction

Premature optimization

---

# Never Do

Never bypass SecurityManager.

Never bypass Runtime.

Never bypass ToolRegistry.

Never bypass CredentialManager.

Never let Providers read configuration.

Never let UI own business logic.

Never let widgets own application state.

Never duplicate services.

Never create circular dependencies.

Never hardcode configuration.

Never ignore errors.

Never panic for recoverable situations.

Never introduce architecture that only solves today's problem.

---

# File Organization

Respect existing project structure.

Place new files into the correct module.

If a new folder is required,

justify why.

Avoid miscellaneous folders.

Avoid utility dumping grounds.

Keep related functionality together.

---

# Naming Guidelines

Names should explain intent.

Prefer

WorkspaceManager

over

Manager2

Prefer

CredentialManager

over

ConfigHelper

Prefer

ToolRegistry

over

ToolUtils

Avoid abbreviations unless industry standard.

---

# Decision Making

When multiple implementations exist

evaluate

Maintainability

Performance

Complexity

Scalability

Security

Future extensibility

Choose the strongest long-term solution.

Do not choose the quickest.

---

# Refactoring Policy

If implementation becomes cleaner through refactoring,

refactor.

Small refactors are encouraged.

Large refactors require explanation.

Never leave duplicated architecture behind.

---

# Error Handling

Errors should be

Helpful

Actionable

Consistent

Never expose raw internal errors to users.

Every user-facing error should explain

What happened.

Why.

How to fix it.

---

# Performance Mindset

Performance is part of architecture.

Avoid

Repeated allocations

Repeated parsing

Repeated filesystem scans

Blocking operations

Large synchronous work

Prefer

Caching

Lazy initialization

Reuse

Incremental updates

Streaming

---

# Documentation

Whenever introducing

architecture

patterns

systems

major modules

document them.

Future contributors should understand why code exists.

Not only what it does.

---

# Architecture Reviews

Before considering implementation complete verify

✓ Boundaries respected

✓ No duplicated logic

✓ No circular dependencies

✓ Existing services reused

✓ Security preserved

✓ Runtime preserved

✓ Future scalability maintained

✓ Naming consistent

✓ Documentation updated if necessary

---

# Behavior Expectations

Act like the lead software architect of Nexora.

Challenge weak architectural decisions.

Suggest stronger alternatives.

Preserve consistency across the project.

Protect the architecture even when implementing new features.

Architecture quality is more important than implementation speed.