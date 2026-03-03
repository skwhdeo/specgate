# Validation: O5 Dry-run cases

## Goal
Exercise autopilot prompt building and routing logic without running gates by using `--dry-run` and representative failure artifacts.

## Representative cases

### Lint failure
1. Ensure `.pi/specgate/state/last-failure.json` contains `failedGates` with `lint` and a lint-like fingerprint.
2. Run:
   ```sh
   node harness/orchestrator/autopilot.mjs --feature 001-self-improve-orchestrator --dry-run --max-attempts-per-task 1
   ```
3. Confirm prompt preview includes `Strategy profile: lint-first` and packed context section.

### Test failure
1. Update `last-failure.json` to include `failedGates` with `test` and a test fingerprint.
2. Run dry-run autopilot as above.
3. Confirm prompt preview includes `Strategy profile: test-fix` and attempt score line.

### Arch failure
1. Update `last-failure.json` to include `failedGates` with `arch` and boundary fingerprint.
2. Run dry-run autopilot as above.
3. Confirm prompt preview includes `Strategy profile: arch-boundary` and packed context block.

## Expected output checks
- Prompt includes attempt score line and strategy tactics.
- `autopilot-log.jsonl` is not modified during dry-run (no gate runs).
- `job-manifest.json` captures progress score threshold configuration.
