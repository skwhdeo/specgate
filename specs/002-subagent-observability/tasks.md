# Tasks: 002-subagent-observability

## Phase 1: Setup

- [ ] T001 Establish invocation/run ID conventions in orchestrator flow docs (`specs/002-subagent-observability/plan.md`)
- [ ] T002 Define artifact file naming constants in `harness/orchestrator/autopilot.mjs`

## Phase 2: Foundational

- [ ] T003 Create shared redaction + truncation helper in `harness/review/delegate-to-subagent.mjs`
- [ ] T004 Add schema-aware artifact writer utility for subagent traces in `harness/review/delegate-to-subagent.mjs`

## Phase 3: User Story 1 (P1) - Trace Subagent I/O

- [ ] T005 [US1] Capture subagent input payload metadata in `harness/orchestrator/autopilot.mjs`
- [ ] T006 [US1] Persist `subagent-input-<invocationId>.json` in `.pi/specgate/artifacts`
- [ ] T007 [US1] Persist `subagent-output-<invocationId>.json` in `.pi/specgate/artifacts`
- [ ] T008 [P] [US1] Link invocation IDs from subagent artifacts into `autopilot-log.jsonl`

## Phase 4: User Story 2 (P1) - Safe Redaction

- [ ] T009 [US2] Apply secret redaction before artifact writes in `harness/review/delegate-to-subagent.mjs`
- [ ] T010 [US2] Include `redactionReport` metadata in input/output artifacts
- [ ] T011 [P] [US2] Add truncation metadata (`maxBytes`, `originalBytes`, `keptBytes`) in artifacts

## Phase 5: User Story 3 (P2) - Decision Explainability

- [ ] T012 [US3] Add invocation reason + strategyBefore/After fields in attempt trace logs
- [ ] T013 [US3] Record blockedReason and chosen follow-up action in failure/log artifacts

## Phase 6: Validation & Docs

- [ ] T014 Validate artifact pairing and correlation IDs with a dry-run scenario (`specs/002-subagent-observability/quickstart.md`)
- [ ] T015 Validate redaction against seeded secret-like values and document outcome
- [ ] T016 Re-run regression commands (`npm run specgate:run`, `npm run specgate:metrics`)
- [ ] T017 Update runtime docs (`docs/loop-strategy.md`, `docs/repro.md`) for observability artifacts
