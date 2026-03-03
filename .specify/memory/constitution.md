# SpecGate Constitution

## Core Principles

### I. Harness-First Truth
All completion and regression decisions MUST be made by executable gates and persisted state, never by agent self-report. Any automation outcome must be reproducible from artifacts.

### II. Safe Automation by Default
Autonomous execution MUST run with explicit limits (time, attempts, cycles) and failure-safe termination. Worktree isolation is the default for write operations that can affect project code.

### III. Contract & Boundary Integrity
Runtime boundaries between orchestrator, target project, and integration surfaces MUST remain explicit and testable. Cross-boundary coupling via hidden imports is prohibited.

### IV. Evidence-Backed Task Completion
A task may be marked complete only when implementation evidence and validation evidence exist (code diff + gate outcome + artifact trace).

### V. Incremental Maintainability
Prefer small composable modules, observable logs, and configuration-driven behavior. New capability should degrade gracefully and preserve backward compatibility where possible.

## Security & Privacy Requirements

- Never commit secrets, private keys, or internal credentials.
- Public repository content must avoid environment-identifying data by default.
- Runtime artifacts should be project-local (`.pi/specgate/*`) and excluded from commits unless explicitly needed.

## Delivery Workflow & Quality Gates

1. Define/update spec (`spec.md`) and plan (`plan.md`).
2. Generate/curate task list (`tasks.md`) with clear acceptance checks.
3. Implement in isolated flow (prefer worktree for autonomous runs).
4. Validate with required gates (`lint`, `typecheck`, `test`, `arch`; optional `browser`).
5. Persist artifacts (`state`, `checkpoint`, failure report, run logs).
6. Merge only after gate-backed verification.

## Governance

This constitution overrides ad-hoc implementation choices.
Amendments require:
1) rationale,
2) migration impact,
3) version/date update,
4) verification plan.

**Version**: 1.0.0 | **Ratified**: 2026-03-03 | **Last Amended**: 2026-03-03
