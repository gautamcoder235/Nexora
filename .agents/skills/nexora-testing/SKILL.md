---
name: nexora-testing
description: Designs, implements, and maintains Nexora's testing architecture including unit tests, integration tests, UI tests, performance benchmarks, regression suites, snapshot testing, end-to-end validation, CI quality gates, and testing infrastructure. Use whenever implementing features, fixing bugs, refactoring, reviewing code, or modifying public APIs to ensure long-term correctness and stability.
priority: critical
---

# Nexora Testing Architecture

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
12. nexora-cli-tui

before modifying tests.

Testing is part of development.

A feature is incomplete until it is verified.

---

# Mission

Maintain a highly reliable platform by verifying correctness, preventing regressions, measuring performance, and ensuring every subsystem behaves predictably.

Tests should provide confidence, not merely increase coverage percentages.

---

# Philosophy

Design

↓

Implement

↓

Verify

↓

Benchmark

↓

Review

↓

Release

Never merge code that has not been validated.

---

# Core Components

TestManager

TestRunner

UnitSuite

IntegrationSuite

EndToEndSuite

SnapshotSuite

PerformanceSuite

RegressionSuite

StressSuite

FixtureManager

MockFactory

WorkspaceFixtures

GoldenFiles

CoverageReporter

QualityGate

TestUtilities

FailureAnalyzer

Each component owns one responsibility.

---

# Test Pyramid

Large base

Unit Tests

↓

Integration Tests

↓

End-to-End Tests

↓

Manual Verification

Avoid excessive end-to-end tests when unit tests provide sufficient confidence.

---

# Unit Testing

Test

Pure functions

Utilities

Configuration

Parsers

Validation

Security policies

Memory algorithms

Ranking

Events

Schedulers

Never require filesystem or network unless necessary.

---

# Integration Testing

Verify interaction between

Runtime

Workspace

AI

Memory

Context

Security

Extensions

Desktop IPC

CLI

Ensure services cooperate correctly.

---

# End-to-End Testing

Verify

Application startup

Workspace loading

Chat flow

AI streaming

Command execution

Extension loading

Memory retrieval

Security approvals

Desktop ↔ CLI interoperability

Treat E2E as user workflows.

---

# Snapshot Testing

Use snapshots for

Terminal output

Markdown rendering

Tables

Panels

Layouts

JSON responses

Configuration

Error formatting

Snapshots must be deterministic.

---

# Regression Testing

Every fixed bug

↓

Add regression test

Never allow the same bug twice.

---

# Performance Testing

Measure

Startup

Rendering

Workspace indexing

Context assembly

Memory retrieval

AI latency

Extension loading

IPC

Scheduler

Performance regressions fail CI.

---

# Stress Testing

Verify

Large repositories

100k+ files

Large chat histories

Thousands of memories

Many extensions

Heavy filesystem activity

Long-running sessions

Never assume small workloads.

---

# Mocking

Mock only

External APIs

Network

Filesystem (when appropriate)

Time

Random generators

Cloud providers

Never mock business logic.

---

# Fixtures

Provide reusable fixtures

Workspace

Git repository

Large repository

Monorepo

AI responses

Configuration

Extensions

Logs

Diagnostics

Reuse fixtures across suites.

---

# Test Data

Test

Unicode

Large files

Binary files

Symlinks

Permissions

Hidden files

Invalid UTF-8

Long paths

Cross-platform behavior.

---

# CI Quality Gates

Require

cargo fmt

cargo clippy

cargo test

Integration suite

Snapshot validation

Benchmarks

Security checks

Coverage thresholds

No warnings.

---

# Failure Analysis

On failure provide

Cause

Affected module

Expected result

Actual result

Suggested fix

Related tests

Failures should be actionable.

---

# Coverage

Measure

Statements

Branches

Critical paths

Security paths

Do not chase 100%.

Focus on important behavior.

---

# Security Testing

Verify

Sandbox

Permissions

Workspace boundaries

Path traversal

Injection

Credential access

Extension isolation

Memory isolation

Security tests are mandatory.

---

# Cross Platform

Test

Windows

Linux

macOS

Different terminals

Different filesystems

Different path separators

Never assume one platform.

---

# Event Testing

Verify

Ordering

Concurrency

Subscriptions

Cancellation

Backpressure

EventBus correctness.

---

# Anti-Patterns

Never

Test implementation details

Duplicate tests

Depend on execution order

Ignore flaky tests

Merge failing tests

Skip regression tests

Write non-deterministic tests

---

# Performance Budgets

Unit tests

<100 ms

Integration

<5 s

E2E

<60 s

Benchmarks reproducible.

---

# Architecture Review

✓ Layered testing

✓ Regression protection

✓ Performance validation

✓ Snapshot testing

✓ Security verification

✓ Cross-platform

✓ CI ready

✓ Deterministic

✓ Maintainable

✓ Scalable

---

# Decision Tree

Need to verify one function?

↓

Unit Test

Need to verify multiple services?

↓

Integration Test

Need to verify user workflow?

↓

End-to-End Test

Need rendering validation?

↓

Snapshot Test

Need speed validation?

↓

Benchmark

Need previous bug prevention?

↓

Regression Test

---

# Expected Behavior

Act as Nexora's Test Architect.

Every architectural change, feature, optimization, and bug fix must be accompanied by appropriate tests.

Favor deterministic, maintainable, and fast tests over excessive coverage.

Continuously improve reliability while keeping the test suite fast enough to run during everyday development.
