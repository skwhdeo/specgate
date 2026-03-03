# Implementation Plan: Subagent Observability & Traceability

**Branch**: `002-subagent-observability` | **Date**: 2026-03-03 | **Spec**: `specs/002-subagent-observability/spec.md`

## Technical Context

- Runtime: Node.js (existing specgate orchestrator runtime)
- Scope Modules:
  - `harness/orchestrator/autopilot.mjs`
  - `harness/review/delegate-to-subagent.mjs`
  - `harness/orchestrator/sdk-loop.mjs` (if shared trace hooks required)
- Storage: project-local runtime artifacts under `.pi/specgate/artifacts`
- Security: redaction before persistence is mandatory

## Constitution Check

- Harness-first truth: PASS (no decision authority moved to subagent)
- Safe automation default: PASS (no limit removal)
- Boundary integrity: PASS (no cross-boundary runtime coupling)
- Evidence-backed completion: PASS (adds observability evidence)
- Maintainability: PASS (modular helper + artifact schema)

## Phase 0: Research Decisions

See `research.md`.

Decisions to lock:
1. Artifact naming convention
2. Redaction rule baseline
3. Payload size cap strategy
4. Failure behavior when trace write fails

## Phase 1: Design Artifacts

- Data model: `data-model.md`
- Contracts: `contracts/subagent-observability.schema.json`
- Quickstart: `quickstart.md`

## Phase 2: Task Planning Strategy

Implementation sequence:
1. Introduce shared trace schema and helper functions
2. Wire trace capture in delegate runner
3. Wire trace capture in autopilot blocked/debate path
4. Add redaction + truncation controls
5. Add attempt log linkage and blockedReason
6. Validate and update docs

## Risk & Mitigation

- Risk: large payload artifacts
  - Mitigation: strict byte caps + truncation metadata
- Risk: accidental secret persistence
  - Mitigation: regex-based redaction + explicit redaction report
- Risk: run interruption on trace write failure
  - Mitigation: fail-safe path records controlled error artifact and exits with explicit reason

## Validation Plan

- Dry-run replay for representative lint/test/arch blocked cases
- Verify paired input/output artifacts per invocation
- Verify redaction against seeded secret-like test values
- Regression:
  - `npm run specgate:run`
  - `npm run specgate:metrics`

## Generated Artifacts

- `research.md`
- `data-model.md`
- `contracts/subagent-observability.schema.json`
- `quickstart.md`
- `tasks.md`
