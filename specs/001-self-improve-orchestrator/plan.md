# Plan: Self-improve SpecGate Orchestrator

## Scope
Implement progress-aware blocked detection, failure-class routing, and focused context packing in `harness/orchestrator/autopilot.mjs` and shared helpers.

## Design
1. Add `attemptScore` model:
   - failed gate count delta
   - fingerprint novelty
   - changed-file relevance
2. Add `strategyProfiles`:
   - lint-first
   - test-fix
   - arch-boundary
   - mixed-default
3. Add context packer:
   - top file candidates
   - capped snippets
   - compact failure digest
4. Extend logs/manifests:
   - strategy
   - attemptScore
   - blockedReason

## Risks
- Overfitting routing heuristics
- Additional complexity in prompt building

## Mitigation
- Keep fallback default strategy.
- Add feature flag in config for gradual rollout.

## Validation
- dry-run scenarios for each failure class
- replay against known failure artifacts
- regression run for existing commands
