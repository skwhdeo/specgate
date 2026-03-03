# Harness Contract (v1.1, external-project mode)

이 문서는 **하네스 저장소(`specgate`)와 대상 프로젝트 저장소(예: `target-project`)**의 경계를 정의한다.

핵심 목표:
- 하네스는 독립 repo로 유지
- 대상 프로젝트는 clone/pull로 준비 후 하네스가 검증
- 연동은 명령/파일/API 계약으로만 수행

---

## 1) 경계 원칙

1. 하네스는 대상 프로젝트 내부 모듈을 직접 import 하지 않는다.
2. 대상 프로젝트도 하네스 런타임 모듈을 import 하지 않는다.
3. 연동은 **CLI 명령 / 상태 파일 / HTTP API**로만 수행한다.
4. 하네스의 쓰기 권한 기본 범위는 `harness/state`, `harness/artifacts`이다.

---

## 2) 저장소 관계

- Harness repo: `specgate`
- Target project repo: 외부 경로(기본 예: `<target-project-path>`)
- 연결 방식: `harness/config.json`의 `projectRoot` + gate command

하네스는 대상 프로젝트를 다음 방식 중 하나로 준비한다.
- 이미 로컬에 존재하는 경로 사용
- 별도 prepare 단계에서 clone/pull 후 사용

---

## 3) 실행 계약 (Command Contract)

하네스는 `harness/config.json`에 정의된 gate 명령을 실행한다.

기본 gate 종류:
- `lint`
- `typecheck`
- `test`
- `arch`
- `browser` (선택)

예시(외부 프로젝트 대상):
- `npm --prefix <target-project-path> run lint`
- `npm --prefix <target-project-path> run typecheck`
- `npm --prefix <target-project-path> test`

원칙:
- gate 명령은 하네스 코드에 하드코딩하지 않고 config로만 관리
- 종료 판정은 gate exit code + runner state로만 결정

---

## 4) 파일 계약 (State/Artifacts)

하네스 내부 산출물:
- `harness/state/state.json`
- `harness/state/checkpoint.md`
- `harness/state/last-failure.json` (loop/orchestrator 단계)
- `harness/artifacts/*.log|*.json`

대상 프로젝트 산출물:
- 대상 프로젝트 자체 테스트 결과 디렉토리(프로젝트 정의를 따름)

원칙:
- 하네스는 대상 프로젝트 내부 파일을 기본적으로 읽기/검증 용도로만 사용
- 코드 수정 단계(에이전트 오케스트레이션)에서는 수정 범위를 명시적으로 제한

---

## 5) API 계약 (검증 대상 Surface)

최소 검증 API(예: AFC 샘플):
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `GET /api/transactions/:id/explain`

응답 규칙:
- JSON
- 에러 포맷: `code`, `message`, `details?`

---

## 6) Explain 계약

`/api/transactions/:id/explain`는 다음 필드를 포함해야 한다.
- `transactionId`
- `input`
- `appliedRules[]`
- `intermediate[]`
- `finalFare`
- `currency`
- `policyVersion`

---

## 7) 게이트 계약 (Completion Gates)

공통 gate 결과 포맷:

```json
{
  "gate": "lint|typecheck|test|arch|browser",
  "passed": true,
  "exitCode": 0,
  "summary": "optional"
}
```

DONE 조건:
1. 필수 gate(lint/typecheck/test/arch) PASS
2. golden 케이스 PASS
3. explain 필수 필드 검증 PASS

browser gate:
- 선택 게이트
- 사전 조건: API/UI 서버 기동 상태

---

## 8) out-of-order / watermark 계약

대상 프로젝트는 이벤트 필드를 보존해야 한다.
- `event_time`
- `ingest_time`
- `device_id`
- `local_seq`
- `event_id`

하네스는 다음을 검증한다.
- 역순 도착 이벤트 처리
- 워터마크 이전 이벤트 확정 처리
- 미매칭 이벤트 `PENDING_RECON` 이관

---

## 9) Loop/Orchestrator 계약

Loop v1 원칙:
1. 판정권은 하네스 runner에 있음
2. 에이전트 출력 텍스트는 참고 정보일 뿐 완료 근거가 아님
3. `maxCycles`, `maxWallTimeMs`, fingerprint 반복 제한으로 무한루프 방지
4. 각 사이클 결과를 state/artifacts에 기록

실패 분류 예시:
- `PREPARE_FAILED`
- `GATE_FAILED`
- `LOOP_LIMIT_REACHED`

---

## 10) Docker/격리

- 하네스/에이전트는 Docker 환경에서도 실행 가능해야 한다.
- 기본 정책: 대상 프로젝트 read-only, 하네스 상태/아티팩트만 write 허용(운영 정책에 따라 예외 가능)
- 민감정보는 allowlist 환경변수만 주입

---

## 11) 버전/호환성

- 계약 버전: `harness-contract v1.1`
- breaking change 시 `v2` 문서 분리
- runner 시작 시 config/version 검사 권장
