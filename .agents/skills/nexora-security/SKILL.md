---
name: nexora-security
description: Designs, implements, audits, and enforces Nexora's security architecture, execution boundaries, approval workflows, permissions, sandboxing, workspace isolation, and credential protection. Use whenever implementing tools, shell execution, filesystem access, plugins, AI actions, or external integrations.
priority: critical
---

# Nexora Security System

Always follow

1. nexora-architecture
2. nexora-runtime
3. nexora-ai-system

before implementing security.

Security is not optional.

Security is never delegated to the LLM.

The AI is untrusted.

The system is trusted.

---

# Mission

Every action must be

Validated

Authorized

Audited

Observable

Recoverable

Nothing executes without passing Security.

---

# Security Philosophy

The AI suggests.

Security verifies.

User approves.

Executor runs.

Never reverse this order.

---

# Security Pipeline

Every executable action follows exactly this flow.

User Request

↓

Intent Analysis

↓

Planner

↓

Tool Resolver

↓

Security Manager

↓

Permission Engine

↓

Approval Manager

↓

Executor

↓

Result

↓

Audit Log

Never allow shortcuts.

---

# Core Components

SecurityManager

PermissionEngine

WorkspaceGuard

PathValidator

CommandValidator

CredentialManager

ApprovalManager

AuditLogger

PolicyManager

RiskClassifier

CapabilityResolver

SandboxController

Every responsibility belongs to one component.

---

# SecurityManager

SecurityManager is the entry point.

Every tool request enters here.

SecurityManager never executes tools.

Its only responsibility is validation.

---

# Workspace Guard

Workspace is the trust boundary.

Default rule

Everything outside workspace is forbidden.

Allowed

Read workspace

Write workspace

Search workspace

Git workspace

Blocked

Windows folder

Program Files

Registry

System32

User secrets

SSH

Browser credentials

Private keys

System configuration

Never bypass WorkspaceGuard.

---

# Path Validator

Normalize every path.

Reject

..

Symbolic traversal

UNC escape

Relative escape

Invalid encoding

Hidden path tricks

Validate before execution.

Never after.

---

# Permission Categories

Every action belongs to exactly one category.

Read

Write

Delete

Execute

Network

Clipboard

Credential

Plugin

Configuration

System

Unknown

Never execute Unknown.

---

# Risk Levels

Low

Workspace reads

File search

Git status

Medium

Workspace writes

File creation

Git commit

High

Delete

Shell

PowerShell

Terminal

Network upload

Very High

Registry

System settings

Package installation

Remote execution

Credential access

Each level has a policy.

---

# Approval Policy

Every action maps to one policy.

Auto

Safe.

Runs immediately.

Ask

Prompt user.

Remember

Prompt once.

Always Ask

Never cache approval.

Blocked

Impossible to execute.

---

# Approval UI

Approval dialogs must display

Tool

Command

Directory

Files

Permissions

Risk Level

Reason

Estimated impact

Buttons

Approve

Reject

Always Allow

Always Ask

Cancel

Never hide information.

---

# Shell Security

Never execute arbitrary shell text.

Parse first.

Validate second.

Approve third.

Execute last.

Reject

Nested shells

Pipes

Redirection

Environment manipulation

Background execution

Unknown binaries

unless explicitly approved.

---

# Filesystem Rules

Never

Delete recursively without approval.

Overwrite hidden files automatically.

Modify outside workspace.

Write system files.

Always verify target paths.

---

# Network Security

Every network request requires

Destination

Protocol

Purpose

Timeout

Allowed domains

Unknown hosts require approval.

Uploads require approval.

Downloads require validation.

---

# Credentials

Credentials never belong inside

Logs

Events

UI

Clipboard

Exceptions

Prompts

CredentialManager owns

API Keys

Tokens

Secrets

Certificates

Future Keychain integrations

Never expose secrets to the LLM.

---

# Environment Variables

Treat environment variables as secrets.

Whitelist only approved variables.

Never expose

PATH

HOME

USERPROFILE

SSH

API Keys

Tokens

unless explicitly required.

---

# Plugin Security

Plugins are untrusted.

Plugins execute inside sandbox.

Plugins receive capabilities.

Capabilities include

Filesystem

Workspace

Network

Clipboard

Notifications

Git

Memory

Default capability

None.

---

# Capability System

Capabilities are explicit.

Examples

workspace.read

workspace.write

git.read

git.write

shell.execute

network.download

network.upload

clipboard.read

clipboard.write

No wildcard permissions.

---

# Audit Logging

Every security decision generates logs.

Timestamp

Session

Tool

Action

Policy

Decision

User

Duration

Result

Audit logs are append-only.

Never modify history.

---

# Policy Engine

Policies should be configurable.

Workspace

Global

Enterprise

Future cloud sync

Policies should support inheritance.

---

# Security Events

Publish

ApprovalRequested

ApprovalGranted

ApprovalDenied

ToolBlocked

CredentialAccessed

SandboxViolation

PolicyChanged

SecurityWarning

Everything observable.

---

# Sandboxing

Tool execution should occur inside restricted boundaries.

Future support

Containers

WASM

VM

Remote workers

Never assume local execution.

---

# Threat Model

Assume

Prompt injection

Malicious plugins

Compromised providers

Hallucinated commands

Invalid file paths

Dangerous shell output

Security validates everything.

---

# Anti-Patterns

Never

Trust AI output

Trust shell text

Trust plugins

Trust user input

Trust file paths

Trust URLs

Trust provider responses

Always validate.

---

# Performance

Security should be fast.

Cache policies.

Reuse validators.

Avoid repeated checks.

Never sacrifice safety for speed.

---

# Testing

Verify

Workspace isolation

Permission mapping

Approval flow

Command parsing

Sandbox rules

Credential masking

Network restrictions

Plugin permissions

Audit logging

Path traversal

Regression tests required.

---

# Architecture Review Checklist

✓ Workspace boundary enforced

✓ Tool validation centralized

✓ Approvals implemented

✓ Credentials isolated

✓ Plugins sandboxed

✓ Policies configurable

✓ Audit logs immutable

✓ Security events published

✓ Risk classification correct

✓ No direct execution path

---

# Decision Tree

Need to run tool?

↓

SecurityManager

Need permission?

↓

PermissionEngine

Need confirmation?

↓

ApprovalManager

Need path validation?

↓

WorkspaceGuard

Need credentials?

↓

CredentialManager

Need audit?

↓

AuditLogger

Need sandbox?

↓

SandboxController

---

# Expected Behavior

Act as Nexora's Chief Security Architect.

Prioritize safety over convenience.

Reject implementations that bypass security.

Enforce layered validation.

Every new feature must integrate with SecurityManager before execution.

Future-proof the system for enterprise deployments, cloud execution, plugins, remote agents, and autonomous AI workflows.
