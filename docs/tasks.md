# Tasks: SpecGate Loop v1.1

> 원칙: 아래 순서대로 진행. 각 태스크 완료 시 lint/typecheck/test/arch(필요 시 browser) 재검증.

---

## 완료 이력 (참고)

- [x] H0 ~ H4 완료
- [x] A0 ~ A7 완료

현재 작업 트랙: **L(Loop) + P(Pi 통합) 완료 상태**

---

## L 트랙 (Loop)

## L0. 베이스라인 확인
- [x] `npm run harness:metrics`
- [x] `npm run harness:run`
- [x] state/checkpoint 백업(`state.before-loop.json`) 반영

완료 기준:
- [x] 기존 단발 동작 정상 확인

## L1. runOnce 분리
- [x] `harness/runner/run.js` 단발 로직 `runOnce()` 분리
- [x] 기존 CLI 인자(`--reverify`, `--with-browser`) 회귀 보장

완료 기준:
- [x] `npm run harness:run` 동작 동일

## L2. loop 옵션 추가
- [x] `--loop`
- [x] `--sleep-ms`
- [x] `--max-cycles`
- [x] `--max-wall-time-ms`

완료 기준:
- [x] loop가 terminal 조건에서 종료

## L3. 실패 아티팩트 표준화
- [x] `harness/state/last-failure.json` 작성 로직 추가
- [x] failed gates + top error + reason 기록

완료 기준:
- [x] 실패 시 last-failure.json 생성

## L4. fingerprint 반복 실패 차단
- [x] fingerprint 계산 함수 추가
- [x] 동일 fingerprint 반복 시 FAILED 처리

완료 기준:
- [x] 동일 실패 반복 자동 중단

## L5. loopSummary/checkpoint 강화
- [x] state에 `loopSummary` 기록
- [x] checkpoint에 cycle 수/종료사유 반영

완료 기준:
- [x] 종료 후 추적 가능한 요약 존재

## L6. config 확장
- [x] `harness/config.json`에 `loop` 섹션 반영
- [x] 기본값 fallback 구현

완료 기준:
- [x] 설정만으로 loop 파라미터 변경 가능

## L7. npm scripts 추가
- [x] `harness:loop`
- [x] `harness:loop:browser`

완료 기준:
- [x] npm script로 loop 실행 가능

## L8. 문서 동기화
- [x] `docs/repro.md` loop/orchestrate 명령 반영
- [x] `docs/loop-strategy.md` 구현 결과 반영
- [x] failure artifact 포맷 반영

완료 기준:
- [x] 신규 사용자가 문서만으로 실행 가능

---

## P 트랙 (Pi 통합)

> 진행 순서: **P0 (Extension 래핑) → P1 (SDK 오케스트레이터)**

## P0. Pi Extension 최소 명령
- [x] `/harness-run`
- [x] `/harness-loop`
- [x] `/harness-status`

완료 기준:
- [x] Pi 내부에서 하네스 실행/상태 조회 가능

## P1. Orchestrator 연동 (Pi SDK)
- [x] `createAgentSession()` 기반 오케스트레이터 골격 추가
- [x] 에이전트 호출 + `harness:reverify` 실행을 한 사이클로 통합
- [x] 실패 아티팩트(`last-failure.json`)를 다음 프롬프트에 주입
- [x] DONE/FAILED를 하네스 state 기준으로만 판정

완료 기준:
- [x] 자동 수정 + 자동 검증 루프 구동
- [x] `createAgentSession()` 경로로 SDK 기반 통합이 동작

## P2. delegate_to_subagent 범용 리뷰
- [x] 범용 리뷰 실행기 `harness/review/delegate-to-subagent.mjs` 추가
- [x] 리뷰 타입별 실행 스크립트 추가(`harness:review:test`, `harness:review:code`)
- [x] Pi 명령 `/harness-review` 추가
- [x] JSON 스키마 검증 기반 결과 아티팩트 저장

완료 기준:
- [x] test/code/security 등 다용도 리뷰를 동일 인터페이스로 실행 가능

## P3. task-driven autopilot + blocked 토론
- [x] `harness/orchestrator/autopilot.mjs` 추가
- [x] `docs/tasks.md` 미완료 항목 순차 처리 로직 구현
- [x] 설정 시간(`maxWorkTimeMs`) 기반 자동 종료
- [x] blocked 감지 시 delegate_to_subagent 2회 토론(AgentA/B) 후 재시도
- [x] Pi 명령 `/harness-autopilot` 및 npm script(`harness:autopilot`) 추가

완료 기준:
- [x] task 기반 자동 진행 + blocked 토론 흐름이 실행 가능

## P4. spec-kit generic 래핑 연동
- [x] Pi 명령 `/speckit-init-generic`, `/speckit-check` 추가
- [x] Pi 명령 `/speckit-autopilot` 추가( `--feature` 기반 autopilot 실행 )
- [x] autopilot `--feature` 지원 (`specs/<feature>/tasks.md` 자동 해석)
- [x] npm script `speckit:check`, `speckit:init:generic` 추가

완료 기준:
- [x] spec-kit 산출물(feature tasks)을 하네스 autopilot 입력으로 직접 사용 가능
