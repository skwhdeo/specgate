# Quickstart: 002-subagent-observability

## 1) Preconditions

- Clean git working tree
- Dependencies installed (`npm install`)
- Feature branch: `002-subagent-observability`

## 2) Run feature autopilot in isolated mode

```bash
node harness/orchestrator/autopilot.mjs \
  --feature 002-subagent-observability \
  --worktree \
  --result-mode patch
```

## 3) Verify trace artifacts

Expected paths (project-local runtime):
- `.pi/specgate/artifacts/subagent-input-*.json`
- `.pi/specgate/artifacts/subagent-output-*.json`
- `.pi/specgate/artifacts/autopilot-log.jsonl`

## 4) Verify redaction behavior

- Seed secret-like strings in context path used by delegation
- Re-run
- Confirm artifacts contain redacted values and redaction report metadata

## 5) Regression checks

```bash
npm run specgate:run
npm run specgate:metrics
```
