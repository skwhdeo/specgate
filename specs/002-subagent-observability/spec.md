# Feature Specification: Subagent Observability & Traceability

**Feature Branch**: `002-subagent-observability`  
**Created**: 2026-03-03  
**Status**: Draft  
**Input**: User description: "Improve SpecGate subagent observability with explicit input/output trace artifacts and redaction"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trace Subagent I/O per Attempt (Priority: P1)

As a maintainer, I can inspect exactly what context was sent to each subagent and what it returned for a given attempt.

**Why this priority**: Without traceability, blocked-loop debugging is guesswork and orchestration quality cannot be improved reliably.

**Independent Test**: Run a workflow that triggers subagent delegation once; verify attempt-scoped input/output artifacts are created and linked in logs.

**Acceptance Scenarios**:

1. **Given** an orchestrator attempt that invokes a subagent, **When** the attempt completes, **Then** `subagent-input-<attempt>.json` and `subagent-output-<attempt>.json` are stored in artifacts.
2. **Given** multiple subagent calls in one run, **When** reviewing artifacts, **Then** each call has unique correlation IDs and timestamps.

---

### User Story 2 - Safe Redaction of Sensitive Data (Priority: P1)

As a maintainer, I can share trace artifacts without leaking secrets or sensitive values.

**Why this priority**: Observability is only usable in real environments if privacy and security controls are built in.

**Independent Test**: Inject known secret-like values into context; verify persisted artifacts redact those values and preserve useful structure.

**Acceptance Scenarios**:

1. **Given** subagent input containing token-like strings, **When** artifacts are written, **Then** sensitive substrings are redacted.
2. **Given** redacted artifacts, **When** reviewed, **Then** non-sensitive fields remain readable for debugging.

---

### User Story 3 - Decision Explainability in Runtime Logs (Priority: P2)

As a maintainer, I can see why a subagent was invoked and how its output affected the next orchestrator action.

**Why this priority**: Improves confidence in autonomous behavior and supports faster tuning of routing logic.

**Independent Test**: Trigger blocked handling; verify attempt logs include invocation reason, summary decision, and next-step rationale.

**Acceptance Scenarios**:

1. **Given** blocked detection triggers subagent debate, **When** logs are written, **Then** reason and selected follow-up strategy are recorded.
2. **Given** a successful recovery, **When** reviewing the run log, **Then** the causal chain from subagent advice to action is visible.

### Edge Cases

- Subagent returns malformed/non-JSON output.
- Subagent invocation fails due to timeout or missing dependency.
- Artifact directory unavailable or write fails mid-run.
- Excessively large context payloads exceed size cap.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist attempt-scoped subagent input artifacts with correlation metadata (`runId`, `attempt`, `invocationId`, `reviewType`, timestamp).
- **FR-002**: System MUST persist corresponding subagent output artifacts with parse/validation status and raw/normalized result.
- **FR-003**: System MUST redact sensitive patterns before writing any subagent input/output artifact.
- **FR-004**: System MUST record invocation reason and post-subagent decision summary in the orchestrator attempt log.
- **FR-005**: System MUST enforce configurable size limits for persisted context payloads and record truncation metadata.
- **FR-006**: System MUST continue run safety behavior when subagent logging fails (fail-safe with explicit error reason in failure artifact).

### Key Entities *(include if feature involves data)*

- **SubagentInvocationRecord**: One invocation unit containing IDs, reason, redacted input snapshot, output summary, and decision linkage.
- **RedactionReport**: Metadata describing which redaction rules were applied and how many replacements occurred.
- **AttemptDecisionTrace**: Attempt-level chain linking failure signal, delegation action, and next orchestrator strategy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of subagent invocations in a run generate paired input/output artifacts.
- **SC-002**: 100% of known secret test patterns are redacted in persisted artifacts.
- **SC-003**: Maintainer can identify invocation reason and follow-up action for any attempt in under 60 seconds from artifacts/logs alone.
- **SC-004**: Added observability overhead does not increase average attempt duration by more than 10% in baseline replay tests.

## Clarifications

### Session 2026-03-03

- Q: Which artifact location should be authoritative for runtime traces? → A: `.pi/specgate/artifacts` is authoritative; legacy `harness/artifacts` remains fallback-only for compatibility.
- Q: Should subagent trace write failures be ignored or surfaced? → A: Surface explicitly with failure reason; no silent ignore.
- Q: What maximum question scope should this feature include? → A: Runtime subagent observability only; no provider/model routing redesign.
