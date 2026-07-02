---
name: nexora-performance
description: Designs, implements, and maintains Nexora's performance, observability, diagnostics, profiling, caching, scheduling, tracing, benchmarking, startup optimization, and runtime efficiency. Use whenever implementing performance improvements, caching, memory optimization, diagnostics, logging, tracing, benchmarking, or runtime instrumentation.
priority: critical
---

# Nexora Performance & Observability

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

before modifying performance.

Performance is a platform responsibility.

Every subsystem must be measurable.

---

# Mission

Build an observability-first platform where every operation can be measured, profiled, optimized, and diagnosed.

Optimization must be data-driven.

Never optimize blindly.

---

# Philosophy

Measure

↓

Analyze

↓

Optimize

↓

Verify

↓

Repeat

Never optimize without measurements.

---

# Core Components

PerformanceManager

Profiler

MetricsCollector

Tracer

DiagnosticsEngine

CacheManager

Scheduler

MemoryManager

StartupOptimizer

BenchmarkRunner

ResourceMonitor

TelemetryPipeline

PerformanceEvents

Each component owns one responsibility.

---

# Startup Optimization

Startup targets

Cold Start

Warm Start

Hot Start

Lazy initialization

Deferred loading

Background initialization

Never initialize unused services.

---

# Scheduling

Support

Priority scheduling

Background tasks

Idle tasks

Cancellation

Retry

Timeouts

Task groups

Parallel execution

Work stealing

Schedulers never block UI.

---

# Profiling

Support

CPU profiling

Memory profiling

Allocation tracking

Lock contention

Disk I/O

Network latency

GPU usage

Frame timing

Async tasks

Profile continuously in development.

---

# Metrics

Collect

Startup time

Frame time

Memory usage

CPU usage

Disk usage

IPC latency

AI latency

Workspace indexing

Memory retrieval

Context assembly

Extension loading

Command execution

Everything measurable.

---

# Tracing

Trace

Commands

AI requests

Workspace events

Context building

Tool execution

Extensions

Memory retrieval

IPC

Rendering

Tracing should correlate operations.

---

# Diagnostics

Detect

Slow startup

Memory leaks

Deadlocks

Large allocations

Slow queries

Slow tools

Extension bottlenecks

Network failures

High CPU

High memory

Diagnostics should recommend fixes.

---

# Caching

Cache

Workspace indexes

Context

Embeddings

Memory retrieval

AI metadata

Model lists

Git status

Configuration

Extension manifests

Cache invalidation must be deterministic.

---

# Memory Optimization

Reduce

Heap allocations

Copies

String duplication

Temporary buffers

Fragmentation

Use pooling where beneficial.

Never optimize at the expense of correctness.

---

# Benchmarks

Support

Micro benchmarks

Integration benchmarks

Regression benchmarks

Startup benchmarks

Stress benchmarks

Load benchmarks

Performance changes require benchmarks.

---

# Logging

Levels

Trace

Debug

Info

Warn

Error

Fatal

Structured logging preferred.

Never rely on println!.

---

# Resource Monitoring

Track

Threads

Handles

Sockets

Processes

Memory

CPU

GPU

Disk

Network

Monitor continuously.

---

# Event Integration

Publish

StartupCompleted

BenchmarkFinished

CacheHit

CacheMiss

SlowOperation

MemoryWarning

HighCpuUsage

DiagnosticsFound

Performance events are first-class.

---

# Performance Budgets

Cold startup < 500 ms

Warm startup < 150 ms

Command latency < 50 ms

UI interaction < 16 ms

Context assembly < 100 ms

Memory retrieval < 30 ms

Workspace refresh incremental

Budgets should be configurable.

---

# Security

Performance tooling never bypasses SecurityManager.

Sensitive profiling data remains local unless explicitly exported.

---

# Integration

Performance serves

Runtime

Workspace

Memory

AI

Context

Extensions

Desktop

CLI

Testing

Release

Every subsystem exposes metrics.

---

# Anti-Patterns

Never

Optimize without profiling

Duplicate caches

Block UI

Ignore cache invalidation

Disable diagnostics

Hide slow operations

Use global mutable state for metrics

---

# Testing

Verify

Startup budgets

Memory stability

Long-running sessions

Cache correctness

Profiler accuracy

Scheduler fairness

Benchmark regressions

Resource cleanup

Large repositories

---

# Architecture Review

✓ Observable

✓ Measurable

✓ Profiled

✓ Cached

✓ Lazy initialized

✓ Structured logging

✓ Performance budgets

✓ Deterministic invalidation

✓ Event-driven

✓ Benchmark driven

---

# Decision Tree

Need optimization?

↓

Measure first

Need latency?

↓

Profiler

Need repeated data?

↓

Cache

Need background work?

↓

Scheduler

Need issue diagnosis?

↓

DiagnosticsEngine

Need metrics?

↓

MetricsCollector

Need timeline?

↓

Tracer

---

# Expected Behavior

Act as Nexora's Performance Architect.

Every optimization must be backed by measurements.

Keep the platform responsive under large repositories, long AI sessions, and many extensions.

Prioritize predictable latency, low memory usage, and excellent developer experience over premature micro-optimizations.
