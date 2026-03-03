# Feature Spec: Self-improve SpecGate Orchestrator

## Why
SpecGate should improve its own orchestration quality using measurable outcomes instead of manual tuning.

## Goals
1. Reduce repeated failure loops.
2. Improve task completion reliability.
3. Keep autonomous runs safe and reproducible.

## User Stories
- As a maintainer, I want blocked-loop detection to consider progress, so retries stop earlier when no real improvement is happening.
- As a maintainer, I want failure-type routing, so the agent applies different fix strategies for lint/test/arch failure classes.
- As a maintainer, I want concise context packing, so prompts stay focused and lower token waste.

## Functional Requirements
- FR1: Orchestrator computes a progress score per attempt (failed gates count, error signature change, modified files relevance).
- FR2: Orchestrator selects strategy profile by failure class.
- FR3: Prompt context includes only top relevant files/snippets and last failure summary.
- FR4: Attempt logs include strategy, progress score, and stop reason.

## Non-Functional Requirements
- Deterministic stop conditions remain mandatory.
- Existing command contracts remain backward compatible.
- Added overhead per attempt should be small (<10% target).

## Acceptance Criteria
- A1: On repeated identical failures, orchestrator stops earlier than current baseline in controlled test.
- A2: Logs contain progress score and selected strategy for each attempt.
- A3: Existing commands still run without new required flags.
