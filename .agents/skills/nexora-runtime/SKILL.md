---
name: nexora-runtime
description: Designs, implements, reviews, and maintains the Nexora Runtime architecture. Use whenever modifying services, application state, dependency injection, events, scheduling, jobs, resources, or application lifecycle management.
priority: high
---

# Nexora Runtime Engineering

This skill governs every component responsible for application execution.

Always follow the nexora-architecture skill first.

The Runtime is the foundation of Nexora.

Every service, subsystem and long-running process must integrate through Runtime.

Never allow Runtime to become a God Object.

Runtime is a composition root, not business logic.

---

# Primary Goal

Runtime exists to provide

• Dependency Injection

• State Management

• Event Distribution

• Scheduling

• Background Jobs

• Notifications

• Resource Management

• Session Management

without creating tight coupling.

Runtime should know where services live.

Services should never know where other services live.

---

# Runtime Philosophy

Runtime is the application's operating system.

Think of Runtime as a lightweight kernel.

It coordinates.

It does not implement business logic.

Business logic belongs elsewhere.

---

# Runtime Responsibilities

Runtime owns

• ServiceContainer

• EventBus

• StateStore

• JobManager

• Scheduler

• NotificationCenter

• SessionManager

• ResourceManager

• SecurityManager

• CredentialManager

• PluginHost

• ToolRegistry

Runtime should not contain

Business logic

AI logic

Rendering

Filesystem logic

Provider implementations

Network implementations

---

# Dependency Injection

Every shared service must be resolved through Runtime.

Correct

Runtime

↓

ServiceContainer

↓

Shared Service

Incorrect

Widget

↓

new Service()

Never manually construct shared services.

Never duplicate service instances.

---

# ServiceContainer

ServiceContainer owns application-wide services.

Examples

Configuration

Security

Credentials

Jobs

Notifications

Sessions

Workspace

Events

Resources

Services should be initialized once.

They should expose interfaces.

Consumers depend on interfaces.

Never concrete implementations.

---

# Service Lifetime

Every service belongs to one lifetime.

Singleton

One instance.

Scoped

One instance per workspace or session.

Transient

New instance every request.

Choose the smallest lifetime possible.

Avoid unnecessary global state.

---

# Runtime Initialization

Initialization order matters.

Configuration

↓

Logging

↓

Security

↓

Credential Manager

↓

Workspace

↓

Resource Manager

↓

EventBus

↓

StateStore

↓

JobManager

↓

ToolRegistry

↓

PluginHost

↓

UI

↓

AI

Never initialize services randomly.

---

# StateStore

StateStore is the only source of truth.

Everything mutable belongs here.

Examples

Chat

Workspace

Tasks

Jobs

Downloads

Notifications

Models

Providers

Sessions

History

Plugins

Permissions

Never duplicate state.

Never cache mutable state inside UI.

Widgets read state.

Commands modify state.

Events synchronize state.

---

# EventBus

EventBus coordinates communication.

Never directly call unrelated modules.

Publish events.

Subscribe to events.

Examples

WorkspaceOpened

ProviderChanged

ModelChanged

JobStarted

JobFinished

NotificationCreated

ApprovalRequested

ApprovalGranted

ToolExecuted

SessionCreated

Never abuse events.

Events communicate.

They do not replace function calls.

---

# Scheduler

Scheduler executes delayed and recurring work.

Examples

Autosave

Background indexing

Model refresh

Workspace scan

Plugin refresh

Heartbeat

Health checks

Scheduler should never perform work directly.

It schedules work.

---

# JobManager

Every long-running task becomes a Job.

Jobs support

Queued

Running

Paused

Cancelled

Completed

Failed

Streaming

Every Job has

Unique ID

Progress

Status

Cancellation Token

Result

Errors

Creation Time

Owner

Jobs should be observable.

Never block UI waiting for Jobs.

---

# NotificationCenter

Notifications are centralized.

Notification types

Information

Success

Warning

Error

Progress

Background Task

Approval

Never create random popups.

Always route notifications through NotificationCenter.

---

# ResourceManager

ResourceManager owns reusable expensive resources.

Examples

Thread pools

Async runtime

Caches

Workspace indexes

Syntax trees

Open files

Database handles

Network clients

Never create duplicate expensive resources.

Reuse them.

---

# SessionManager

SessionManager owns

AI sessions

Workspace sessions

Desktop sessions

CLI sessions

Plugin sessions

Session state survives between operations.

Sessions should be isolated.

---

# Runtime Boundaries

Runtime coordinates.

Runtime never owns

Business Rules

AI Planning

Rendering

Filesystem Operations

Git Logic

Tool Execution

Provider Logic

Those belong to dedicated systems.

---

# Thread Safety

Runtime services must be thread-safe.

Avoid unnecessary locking.

Prefer immutable data.

Minimize shared mutable state.

Avoid deadlocks.

Avoid nested locks.

---

# Async Rules

Do not make everything async.

Use async only when

Network

Filesystem

Streaming

Background tasks

Long-running operations

Simple computation should remain synchronous.

---

# Error Handling

Runtime services never panic.

Recover when possible.

Return structured errors.

Attach context.

Log failures.

Notify interested systems through EventBus.

---

# Extensibility

Runtime must allow new services without modifying existing ones.

Prefer interfaces.

Prefer registration.

Avoid switch statements.

Avoid giant constructors.

---

# Performance Rules

Runtime startup should be minimal.

Lazy initialize expensive systems.

Avoid unnecessary allocations.

Cache expensive resources.

Reuse buffers.

Never perform workspace scanning during startup unless required.

---

# Architecture Review

Before completing Runtime changes verify

✓ Runtime owns orchestration only

✓ Business logic separated

✓ Service lifetimes correct

✓ State centralized

✓ Events used correctly

✓ No duplicated services

✓ No circular dependencies

✓ Lazy initialization preserved

✓ Startup remains fast

✓ Thread safety maintained

✓ Async only where beneficial

✓ New services registered correctly

---

# Decision Tree

Need shared functionality?

↓

Should it live for entire application?

↓

Yes

↓

Runtime Service

---

Need mutable application data?

↓

StateStore

---

Need communication?

↓

EventBus

---

Need background execution?

↓

JobManager

---

Need scheduled work?

↓

Scheduler

---

Need expensive reusable object?

↓

ResourceManager

---

Need user feedback?

↓

NotificationCenter

---

Need persistent context?

↓

SessionManager

---

# Expected Behavior

Act as the Runtime architect.

Protect Runtime simplicity.

Reject designs that mix orchestration with business logic.

Encourage reusable services.

Keep Runtime lightweight, scalable and future-proof.

Every Runtime decision should make adding future AI features easier, not harder.