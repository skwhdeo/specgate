# Harness ↔ Project 관계 설계 (v1)

## 1. 목표

- 하네스를 독립 repo로 운영
- 대상 프로젝트를 외부에서 연결/다운로드
- Pi 에이전트가 반복 수정/검증 루프를 실행해 DONE/FAILED를 판정

---

## 2. 구성요소

1) **Harness Repo (`specgate`)**
- runner/gates/metrics/state/artifacts 담당
- 판정권 보유 (DONE/FAILED)

2) **Target Project Repo (`target-project` 등)**
- 실제 앱 코드와 테스트를 보유
- 하네스 gate 명령의 실행 대상

3) **Pi Agent Runtime**
- 실패 요약을 받아 코드 수정 수행
- 수정 결과는 하네스가 검증

---

## 3. 데이터/제어 흐름

### 준비 단계
1. 하네스가 대상 프로젝트 경로 확보(`projectRoot`)
2. 필요 시 clone/pull + install
3. preflight(경로/명령/권한) 확인

### 1사이클
1. (옵션) Pi 에이전트가 수정
2. `harness:run` 실행
3. gate 결과 집계
4. PASS면 DONE, FAIL이면 `last-failure.json` 기록 후 다음 사이클

### 종료
- DONE
- maxCycles/maxWallTime/동일실패 반복 초과로 FAILED

---

## 4. 책임 분리

### Harness 책임
- 상태머신/루프/게이트 실행
- 실패 분류 및 아티팩트 기록
- 최종 판정

### Target Project 책임
- lint/typecheck/test/arch/browser 명령 제공
- API 계약 준수
- golden test 유지

### Pi Agent 책임
- 실패 원인 기반 코드 수정
- 경계 계약 준수
- 하네스 결과에 따라 재시도

---

## 5. Pi에 하네스를 "일부"로 넣는 방법

가능하다. 권장 방식은 아래 2가지.

### 방식 A) Pi Extension으로 하네스 명령 내장 (권장)
- `/harness-run`, `/harness-loop`, `/harness-status` 같은 명령 제공
- extension이 `pi.exec()`로 `node harness/runner/run.js ...` 실행
- 결과를 상태 위젯/알림으로 표시

장점:
- 현재 하네스 코드를 거의 그대로 활용
- 사용자 UX 개선 (Pi 안에서 실행/관찰)

### 방식 B) Pi SDK 기반 오케스트레이터로 임베드
- Node 앱에서 `createAgentSession()` + 하네스 루프 결합
- 한 프로세스에서 에이전트 호출과 gate 실행을 관리

장점:
- 완전 자동화/맞춤 UI/RPC 연동 유리
- 장기적으로 CI/서비스화에 적합

---

## 6. 권장 로드맵

1. 현재 하네스 CLI loop 완성 (`--loop`, `last-failure.json`, loopSummary)
2. Pi Extension으로 최소 명령 3개 추가
   - `/harness-run`
   - `/harness-loop`
   - `/harness-open-failure`
3. 이후 필요 시 SDK 오케스트레이터로 승격

---

## 7. 최소 성공 조건

- Pi 내부 명령으로 하네스 실행 가능
- 실행 결과가 `harness/state/*`에 일관 기록
- 최종 완료 판정은 항상 하네스 state 기준
- 에이전트 텍스트 응답은 참고용으로만 사용
