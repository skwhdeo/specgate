# specgate (formerly my-harness)

Spec-driven + gate-driven 자동 구현 하네스입니다.

## Pi Agent 설치 (GitHub)

### 글로벌 설치 (모든 프로젝트)
```bash
pi install git:github.com/skwhdeo/specgate
```

### 프로젝트 로컬 설치 (현재 프로젝트에만)
```bash
pi install -l git:github.com/skwhdeo/specgate
```

설치 후 Pi에서 `/reload`를 실행하면 명령이 로드됩니다.
사용 가능 명령 예시:
- `/specgate-init`
- `/specgate-run`
- `/specgate-autopilot`
- `/specgate-status`

## 연결 대상 프로젝트
기본 설정은 `<target-project-path>`를 대상으로 동작합니다.
- 설정 파일: `harness/config.json`
- `gates.*.command`를 원하는 프로젝트 경로로 수정하면 다른 프로젝트에도 적용 가능

## 실행
```bash
# 권장(specgate alias)
npm run specgate:run
npm run specgate:reverify
npm run specgate:loop
npm run specgate:orchestrate
npm run specgate:autopilot
npm run specgate:review:test
npm run specgate:metrics

# 레거시(harness prefix)도 계속 지원
npm run harness:run
```

## 참고
- browser gate는 대상 프로젝트의 `dev:api`, `dev:ui`가 미리 떠 있어야 합니다.
- 기본 런타임 경로는 프로젝트 로컬 `.pi/specgate/state`, `.pi/specgate/artifacts` 입니다.
- Pi extension에서 `/specgate-init`을 실행하면 프로젝트 로컬 설정/런타임 경로(`.pi/specgate/*`)를 초기화할 수 있습니다.
- 레거시 `harness/config.json`도 계속 지원합니다.
- Pi extension 명령(프로젝트에서 pi 실행 시 자동 로드):
  - `/specgate-init` (프로젝트 로컬 `.pi/specgate/config.json` 생성)
  - `/specgate-run`, `/specgate-loop`, `/specgate-status`
  - `/specgate-orchestrate`, `/specgate-autopilot`, `/specgate-review`
  - 기존 `/harness-*` 명령도 계속 지원 (specgate alias)
  - `/speckit-init-generic` (예: `--ai-commands-dir .pi/prompts/speckit`)
  - `/speckit-check`
  - `/speckit-autopilot` (예: `--feature 003-my-feature --worktree --result-mode patch`)
- spec-kit 연동 스크립트:
  - `npm run speckit:check`
  - `npm run speckit:init:generic`

## SpecGate로 SpecGate 개발하기 (self-hosted loop)

1. spec-kit 명령 초기화
```bash
specify init --here --ai generic --ai-commands-dir .pi/prompts/speckit --force --ignore-agent-tools
```

2. feature 스펙 작성 (예: `specs/001-self-improve-orchestrator/*`)
3. Pi에서 실행:
- `/speckit-autopilot --feature 001-self-improve-orchestrator --worktree --result-mode patch`

4. 결과 검증:
```bash
npm run specgate:run
npm run specgate:metrics
```

- 관계 설계 문서: `docs/harness-project-relationship.md`
- 계약 문서: `docs/harness-contract.md`
