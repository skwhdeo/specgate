# Tasks: 001-self-improve-orchestrator

## O0 Baseline
- [x] Capture current autopilot baseline metrics (attempt count, stop reasons, avg loop duration)

## O1 Progress scoring
- [x] Add attempt scoring helper module
- [x] Integrate score computation into autopilot attempt loop
- [x] Persist score in `autopilot-log.jsonl`

## O2 Failure-class routing
- [x] Classify failure type from gate/fingerprint
- [x] Map class -> strategy profile
- [x] Inject strategy instructions into prompts

## O3 Context packing
- [x] Add top-k file/snippet selection with byte limits
- [x] Replace broad prompt context with packed context block

## O4 Stop logic hardening
- [x] Combine fingerprint repetition + low progress threshold for blocked detection
- [x] Add explicit blockedReason to failure artifact

## O5 Validation
- [x] Dry-run validation for lint/test/arch representative cases
- [x] Re-run `specgate:run` and `specgate:metrics`
- [x] Update docs (`docs/loop-strategy.md`, `docs/repro.md`)
