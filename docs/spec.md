# Spec: External Harness Loop v1.1

## 1. 문서 목적

이 문서는 `specgate`를 **독립 저장소**로 유지하면서, 외부 대상 프로젝트를 검증/반복수정(DONE/FAILED)까지 자동화하는 요구사항을 정의한다.

적용 범위:
- 하네스 루프 기능 (runner loop + failure 기록)
- 외부 프로젝트 연동 계약
- Pi 연동을 고려한 오케스트레이션 인터페이스

---

## 2. 배경 및 현재 상태

- `specgate`는 하네스 전용 repo이다.
- 대상 프로젝트는 외부 경로(`projectRoot`)로 연결한다.
- H0~H4, A0~A7은 완료 상태이며, 현재는 **loop 기능 추가**가 주 작업이다.

---

## 3. 목표

1. `harness:run` 단발 동작을 유지하면서, `--loop` 모드로 terminal(DONE/FAILED)까지 자동 반복
2. 실패 원인 기록(`last-failure.json`) 표준화
3. 무한루프 방지(`maxCycles`, `maxWallTimeMs`, fingerprint 반복 제한)
4. 외부 프로젝트 경로/명령을 `harness/config.json`으로 완전 설정 가능

---

## 4. 비목표 (v1.1)

- 분산 멀티에이전트
- DSL 기반 정책 엔진
- 자동 패치 생성 엔진
- CI 파이프라인 완성

---

## 5. 기능 요구사항

### FR-1. Runner loop
- `node harness/runner/run.js --loop` 지원
- 옵션:
  - `--sleep-ms <n>`
  - `--max-cycles <n>`
  - `--with-browser`
- 각 사이클에서 gate 실행 후 상태 전이

### FR-2. 종료 조건
- DONE: 필수 gate 모두 PASS
- FAILED: 아래 중 하나
  - maxCycles 초과
  - maxWallTimeMs 초과
  - 동일 fingerprint N회 반복
  - (오케스트레이터 단계) maxAttempts 초과

### FR-3. 실패 기록
- 실패 시 `harness/state/last-failure.json` 갱신
- 포함 필드:
  - `cycle`
  - `reason` (`GATE_FAILED|PREPARE_FAILED|LOOP_LIMIT_REACHED`)
  - `failedGates[]`
  - `fingerprint`
  - `topErrors[]`
  - `timestamp`

### FR-4. 상태 기록
- `state.json`에 `loopSummary` 기록
  - `startedAt`, `endedAt`, `cycles`, `terminationReason`
- `checkpoint.md`에 최신 cycle 요약 반영

### FR-5. 외부 프로젝트 연동
- `projectRoot`는 상대/절대 경로 지원
- gate 명령은 config 기반 실행
- 하네스와 대상 프로젝트는 import 결합 금지

### FR-6. 회귀 보장
- 기존 단발 실행(`harness:run`) 동작 회귀 없어야 함

---

## 6. 비기능 요구사항

- Node 환경에서 동작 (현재 스크립트 체계 유지)
- 로그/아티팩트는 `harness/*` 하위에 저장
- 실패 시 원인 추적 가능해야 함(대표 stderr 포함)
- 브라우저 게이트 precondition 미충족 시 명확한 실패 메시지

---

## 7. 설정 스키마 (요약)

`harness/config.json` 확장:

```json
{
  "loop": {
    "enabled": false,
    "sleepMs": 2000,
    "maxCycles": 30,
    "maxWallTimeMs": 1800000,
    "maxSameFingerprint": 3
  },
  "orchestrator": {
    "enabled": false,
    "agentCommand": ""
  }
}
```

---

## 8. CLI 요구사항

- `npm run harness:run`
- `npm run harness:reverify`
- `npm run harness:loop`
- `npm run harness:loop:browser`
- (후속) `npm run harness:orchestrate`

---

## 9. 완료 기준 (DoD)

1. loop 모드가 terminal까지 자동 종료
2. 실패 시 `last-failure.json` 생성/갱신
3. checkpoint/state에 loop 요약 기록
4. browser 포함 loop 실행 가능
5. 단발 모드 회귀 없음
