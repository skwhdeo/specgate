# Tasks: 001-self-improve-orchestrator

## O0 Baseline
- [ ] Capture current autopilot baseline metrics (attempt count, stop reasons, avg loop duration)

## O1 Progress scoring
- [ ] Add attempt scoring helper module
- [ ] Integrate score computation into autopilot attempt loop
- [ ] Persist score in `autopilot-log.jsonl`

## O2 Failure-class routing
- [ ] Classify failure type from gate/fingerprint
- [ ] Map class -> strategy profile
- [ ] Inject strategy instructions into prompts

## O3 Context packing
- [ ] Add top-k file/snippet selection with byte limits
- [ ] Replace broad prompt context with packed context block

## O4 Stop logic hardening
- [ ] Combine fingerprint repetition + low progress threshold for blocked detection
- [ ] Add explicit blockedReason to failure artifact

## O5 Validation
- [ ] Dry-run validation for lint/test/arch representative cases
- [ ] Re-run `specgate:run` and `specgate:metrics`
- [ ] Update docs (`docs/loop-strategy.md`, `docs/repro.md`)
