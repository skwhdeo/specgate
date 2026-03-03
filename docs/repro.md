# Repro Guide (specgate)

specgate는 Pi extension/CLI로 실행되며, 런타임 상태는 프로젝트 로컬 `.pi/specgate/*`에 기록하는 것을 기본으로 한다.
레거시 `harness/config.json` 경로도 계속 지원한다.

## 1) Install specgate tool package

```bash
# package source(예: npm/git/local path) 설치 후 프로젝트 디렉토리에서 실행
npm install
```

## 2) 대상 프로젝트 경로 확인

`harness/config.json`의 `projectRoot`와 gate 명령이 실제 경로를 가리키는지 확인한다.

예시:
- `projectRoot: <target-project-path>`
- gate command: `npm --prefix <target-project-path> run lint` 등

## 3) 기본 실행

```bash
# 권장 alias
npm run specgate:run
npm run specgate:reverify

# 레거시 alias
npm run harness:run
npm run harness:reverify
```

## 4) browser gate 포함 실행 (선택)

대상 프로젝트의 API/UI 서버가 먼저 떠 있어야 한다.

```bash
npm run harness:run:browser
npm run harness:reverify:browser
```

## 5) loop 실행

```bash
npm run harness:loop

# browser gate 포함
npm run harness:loop:browser
```

옵션 예시:

```bash
node harness/runner/run.js --loop --max-cycles 10 --sleep-ms 1000
```

## 6) SDK 오케스트레이터 실행 (Pi 연동)

사전 조건:
- Pi 모델/API 키 설정 완료
- `@mariozechner/pi-coding-agent` 설치됨 (`npm install`)

```bash
npm run harness:orchestrate

# browser gate 포함
npm run harness:orchestrate:browser

# 옵션 예시
node harness/orchestrator/sdk-loop.mjs --max-attempts 3 --sleep-ms 2000

# dry-run (에이전트 수정 단계 생략, 프롬프트/검증 루프만 확인)
node harness/orchestrator/sdk-loop.mjs --dry-run --max-attempts 1
```

## 7) task 기반 autopilot 실행

```bash
npm run harness:autopilot

# browser gate 포함
npm run harness:autopilot:browser

# 드라이런(프롬프트/흐름 점검)
node harness/orchestrator/autopilot.mjs --dry-run --max-work-time-ms 60000

# worktree 모드 예시
node harness/orchestrator/autopilot.mjs \
  --worktree .worktrees/ap-20240303-101500 \
  --result-mode patch \
  --cleanup-on-success
```

핵심 옵션:
- `--max-work-time-ms <n>`: 총 작업 시간 제한
- `--max-attempts-per-task <n>`: task별 최대 시도
- `--blocked-fingerprint-threshold <n>`: 동일 실패 반복 시 blocked 판정
- `--feature <spec-folder>`: `specs/<feature>/tasks.md`를 task 파일로 사용
- `--no-debate`: 막힘 시 서브에이전트 토론 비활성화
- `--worktree <path>`: worktree 경로 지정
- `--result-mode <branch|patch|merge>`: 결과 반영 모드
- `--cleanup-on-success`: 성공 시 worktree 정리
- `--cleanup-on-fail`: 실패 시 worktree 정리

spec-kit feature 기반 예시:

```bash
node harness/orchestrator/autopilot.mjs --feature 003-my-feature --worktree --result-mode patch
```

## 8) spec-kit generic 연동

```bash
npm run speckit:check
npm run speckit:init:generic
```

Pi 명령:
- `/speckit-init-generic --ai-commands-dir .pi/prompts/speckit`
- `/speckit-check`
- `/speckit-autopilot --feature 003-my-feature --worktree --result-mode patch`

## 9) delegate_to_subagent 리뷰 실행

```bash
# 테스트 품질 리뷰
npm run harness:review:test

# 코드 품질 리뷰
npm run harness:review:code

# 커스텀
node harness/review/delegate-to-subagent.mjs \
  --review-type security \
  --focus "Find risky patterns" \
  --files "apps/fare-api/src/index.ts,apps/fare-ui/src/App.vue"
```

산출물 예시:
- `harness/artifacts/review-test-quality.json`
- `harness/artifacts/review-code-quality.json`

## 10) 메트릭 스냅샷

```bash
npm run specgate:metrics
```

## 11) 상태/아티팩트 파일

기본(프로젝트 로컬) 경로:
- `.pi/specgate/state/state.json`
- `.pi/specgate/state/checkpoint.md`
- `.pi/specgate/state/last-failure.json`
- `.pi/specgate/artifacts/arch-rule-report.json`
- `.pi/specgate/artifacts/efficacy-summary.json`

레거시 설정(`harness/config.json`)을 쓰는 경우 `harness/*` 경로를 사용할 수 있다.

## 12) Docker access precondition

```bash
id
docker ps
```

현재 사용자에 docker 실행 권한이 있어야 한다.

## 13) Worktree autopilot 트러블슈팅

### 충돌/병합 이슈
- `resultMode=merge`에서 fast-forward merge 실패 시 `MERGE_FAILED`로 종료된다.
- 해결: worktree 브랜치에서 변경사항 확인 후 수동 merge 또는 `resultMode=patch`로 재실행.

### 정리(cleanup) 관련
- 실패 후 worktree 경로가 로그에 남지 않으면 `harness/artifacts/job-manifest.json`을 확인한다.
- 수동 정리: `git worktree remove <path>` 및 필요 시 `git branch -D <branch>` 실행.

### 복구/재시도
- base repo가 dirty로 차단되면 변경을 커밋/스태시 후 재실행.
- 같은 job id 충돌 시 다른 job id 또는 새 worktree 경로로 재시도.
