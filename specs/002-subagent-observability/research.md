# Research: Subagent Observability & Traceability

## Decision 1: Artifact Pairing Strategy

- Decision: persist paired files per invocation (`subagent-input-<id>.json`, `subagent-output-<id>.json`)
- Rationale: simplifies human debugging and machine replay
- Alternatives considered:
  - single aggregated file (harder per-invocation diff)
  - log-only text output (low structure)

## Decision 2: Redaction Policy

- Decision: redact secrets before write using deterministic regex rules + count report
- Rationale: protects sensitive data while preserving debugging shape
- Alternatives considered:
  - hash-only replacement (harder operator readability)
  - no persistence of inputs (insufficient observability)

## Decision 3: Size Control

- Decision: cap persisted payload bytes, store truncation metadata
- Rationale: avoids artifact bloat and keeps run cost predictable
- Alternatives considered:
  - unbounded write (operationally unsafe)
  - drop oversized payload entirely (loss of debugging value)

## Decision 4: Failure Semantics

- Decision: trace write failure should produce explicit reason artifact and terminate safely when required path is critical
- Rationale: silent trace failure undermines trust in orchestration telemetry
- Alternatives considered:
  - best-effort ignore failures (hidden observability gaps)
