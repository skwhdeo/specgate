# Harness Loop 적용 전략 (v1.1)

현재 기준:
- H0~H4, A0~A7 완료
- 하네스는 독립 repo
- loop + Pi 연동(P0/P1) 구현 단계

---

## 0. 저장소 구조

- 하네스 repo: `<harness-root>`
- 대상 앱 repo: `<target-project-root>` (config 경로 기반)

핵심 파일:
- `harness/runner/run.js`
- `harness/gates/run.js`
- `harness/orchestrator/sdk-loop.mjs`
- `harness/config.json`

---

## 1. 목표

에이전트 수정 + 하네스 검증을 DONE/FAILED까지 자동 반복한다.

원칙:
1. 최종 판정은 하네스 state 기준
2. 에이전트 텍스트는 참고만
3. 무한 루프 방지 필수
4. 모든 사이클을 state/artifacts에 기록

---

## 2. 구현 상태

## 단계 A: Runner loop (완료)
- [x] `runOnce()` 분리
- [x] `--loop`, `--sleep-ms`, `--max-cycles`, `--max-wall-time-ms`
- [x] `loopSummary` 기록
- [x] `state.before-loop.json` 스냅샷
- [x] `last-failure.json` 생성/갱신
- [x] fingerprint 반복 실패 차단

## 단계 B: Pi SDK 오케스트레이터 (초기 완료)
- [x] 파일: `harness/orchestrator/sdk-loop.mjs`
- [x] `createAgentSession()` 기반 세션 생성
- [x] attempt 루프: 에이전트 프롬프트 → `harness:reverify` 실행
- [x] `last-failure.json`를 다음 프롬프트에 주입
- [x] 실패 출력에서 파일 후보(`fileCandidates`) 추출/주입
- [x] `--dry-run` 지원 (에이전트 수정 단계 생략)
- [x] DONE/FAILED 판정을 하네스 state 기준으로 수행

---

## 3. config / scripts

`harness/config.json`:
- `loop.*`
- `orchestrator.*` (`mode`, `maxAttempts`, `maxWallTimeMs`, `goal` 등)

`package.json`:
- `harness:loop`
- `harness:loop:browser`
- `harness:orchestrate`
- `harness:orchestrate:browser`

---

## 4. 실행 예시

```bash
npm run harness:loop
npm run harness:loop:browser

npm run harness:orchestrate
npm run harness:orchestrate:browser
```

옵션 예시:

```bash
node harness/orchestrator/sdk-loop.mjs --max-attempts 3 --sleep-ms 2000
```

---

## 5. 리스크/대응

- 무한루프: `maxCycles`, `maxWallTimeMs`, `maxAttempts`
- 동일 실패 반복: fingerprint N회 차단
- browser hang: precondition + gate timeout
- 상태 오염: before-loop 스냅샷 유지

---

## 6. task-driven autopilot (추가)

- 파일: `harness/orchestrator/autopilot.mjs`
- `docs/tasks.md`의 미완료 체크박스를 순차 수행
- timebox(`maxWorkTimeMs`) 안에서 task별 반복 시도
- attempt score 계산(게이트 변화, fingerprint 변화, 변경 파일 관련성)
- 실패 분류(`lint/typecheck/test/arch/browser`)에 따른 strategy profile 주입
- fileCandidates 기반 packed context(상위 N개 파일 스니펫, 바이트 제한)
- blocked 판단: fingerprint 반복 + 낮은 progress score
- blocked 시 `delegate_to_subagent` A/B 토론 결과를 다음 시도 프롬프트에 주입
- Pi 명령: `/harness-autopilot`

## 7. 남은 보강 포인트

- autopilot의 task 완료 판정 규칙 고도화(현재: task 체크 또는 green verify)
- orchestrator/autopilot 결과를 checkpoint에 별도 섹션으로 축적
- delegate_to_subagent 결과를 선택적 quality gate로 승격
- CI에서 orchestrator/autopilot dry-run 검증
