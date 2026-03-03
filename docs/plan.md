# Plan: External Harness Loop v1.1

## 1. 계획 개요

현재 하네스는 단발 실행이 안정화되어 있다. 다음 단계는 loop 자동화와 실패 기록 표준화를 우선 구현하고, 이후 Pi 오케스트레이션을 연결한다.

---

## 2. 단계별 마일스톤

## M0. 베이스라인 고정
- 현재 `harness:run`, `harness:reverify`, `harness:metrics` 동작 스냅샷 확보
- 상태 파일 포맷 확인

산출물:
- baseline 실행 로그
- 기존 state/checkpoint 백업

## M1. Runner loop 구현 (핵심)
- `runOnce()` 분리
- `--loop`, `--sleep-ms`, `--max-cycles` 구현
- wall-time 제한 추가

산출물:
- loop 동작 가능한 runner
- loop 종료 사유 기록

## M2. 실패 기록 표준화
- `last-failure.json` 생성
- fingerprint 계산 및 반복 실패 감지
- checkpoint에 cycle별 실패 요약 반영

산출물:
- 재현 가능한 실패 아티팩트

## M3. 스크립트/문서 정합화
- `package.json`에 `harness:loop`, `harness:loop:browser` 추가
- `docs/repro.md` 업데이트
- `docs/harness-contract.md`와 동기화

산출물:
- 사용자 실행 경로 단순화

## M4. Pi 연동 (선택, 권장)
- 방식 A: extension command (`/harness-run`, `/harness-loop`) 제공
- 방식 B: SDK orchestrator 준비

산출물:
- Pi 내부에서 하네스 실행 가능한 최소 UX

---

## 3. 리스크 및 대응

1. 무한루프
- 대응: maxCycles, maxWallTimeMs, sameFingerprint 제한

2. 동일 오류 반복
- 대응: fingerprint N회 초과 시 FAILED

3. browser gate hang
- 대응: precondition + timeout 엄수

4. 상태 오염
- 대응: loop 시작 시 snapshot(`state.before-loop.json`) 저장

---

## 4. 검증 전략

- 단위 검증: runOnce, termination 조건, fingerprint 함수
- 통합 검증:
  - 성공 시나리오: 즉시 DONE
  - 실패 시나리오: 반복 후 FAILED + failure artifact 생성
  - browser precondition 미충족 시 명확 실패
- 회귀 검증: 기존 `harness:run` 결과 동일성

---

## 5. 일정 순서 (권장)

1. M1
2. M2
3. M3
4. M4

(문서/스크립트 정리는 M1~M2와 병행 가능)
