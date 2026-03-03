# AGENTS.md

## Project goal
Build and validate a **Pi-based minimal harness** using an AFC sample app:
- Backend: Express + TypeScript (`apps/fare-api`)
- Frontend: Vue + TypeScript (`apps/fare-ui`)
- Harness: loop runner + gates + state (`harness/*`)

Authoritative docs:
- `docs/spec.md`
- `docs/plan.md`
- `docs/tasks.md`
- `docs/harness-contract.md`
- `docs/afc-harness-plan-v1.md`

## Execution rules
1. Follow `docs/tasks.md` in order (**H0 -> H4 first, then A0 -> A7**).
2. Do not bypass gates. DONE requires lint/typecheck/test/arch-rule pass.
3. Preserve boundary contract:
   - `harness/*` must not import `apps/*` internals.
   - `apps/*` must not import `harness/*` runtime.
   - Integrate via commands/files/API only.
4. Keep out-of-order handling based on `event_time` + watermark.
5. Keep v1 as code-rule engine (no DSL yet).

## Immediate next session start steps
1. Read `docs/spec.md`, `docs/plan.md`, `docs/tasks.md`.
2. Start from **H0** and finish through **H4** before expanding app scope.
3. After H-track completion, implement A0~A4 minimal vertical slice.
4. Add out-of-order(A5) and finalize with A6~A7.

## Required artifacts
- Harness state files under `harness/state/`
- Explain endpoint payload fields per `docs/harness-contract.md`
- Golden test cases for fare calculation and out-of-order behavior
