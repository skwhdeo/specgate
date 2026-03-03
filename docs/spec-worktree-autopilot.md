# Spec: Worktree 분리 기반 Autopilot 독립 작업 (v1)

## 1) 목적

Autopilot 실행 시 메인 작업 트리를 오염시키지 않도록, **Git worktree를 분리**하여 독립적으로 작업/검증/종료 판정을 수행한다.

핵심 목표:
- 메인 브랜치 보호
- 실험/반복 수정의 격리
- 실패 시 즉시 폐기 가능
- 성공 시만 병합/패치 반영

---

## 2) 범위

포함:
- worktree 생성/삭제 수명주기
- worktree별 autopilot 실행
- worktree별 state/artifacts 분리
- 종료 시 결과 반영 전략(merge 또는 patch)

비포함(v1):
- 다중 worktree 병렬 스케줄러
- 자동 PR 생성
- 원격 CI 통합 자동화

---

## 3) 용어

- **base repo**: 사용자가 작업 중인 원본 저장소
- **job worktree**: autopilot 1회 실행 전용 분리 작업 트리
- **job id**: 실행 식별자(예: `ap-20260303-101500`)

---

## 4) 기능 요구사항

### FR-1. Worktree 생성
- autopilot 시작 시 `git worktree add`로 job worktree 생성
- 브랜치명 규칙: `autopilot/<job-id>`
- worktree 루트 기본값: `.worktrees/<job-id>`

### FR-2. Worktree 실행 격리
- autopilot은 worktree 내부에서만 코드 수정 수행
- 하네스 state/artifacts 경로를 worktree별로 분리
  - 예: `.worktrees/<job-id>/harness/state`, `.worktrees/<job-id>/harness/artifacts`

### FR-3. 판정
- DONE/FAILED 판정은 기존과 동일하게 하네스 gate/state 기준
- 에이전트 텍스트는 판정 근거가 아님

### FR-4. 결과 반영
- DONE 시 선택 정책 1개 적용:
  1) fast-forward/merge
  2) patch 파일 생성
  3) 브랜치만 유지(수동 검토)
- FAILED 시 기본 정책: worktree 유지(디버깅용) 또는 자동 정리(옵션)

### FR-5. 정리(cleanup)
- 옵션 기반 자동 정리 지원:
  - `--cleanup-on-success`
  - `--cleanup-on-fail`
- worktree 제거 시 브랜치 제거 여부 옵션 제공

### FR-6. 충돌/안전장치
- base repo dirty 상태면 시작 차단(옵션으로 override 가능)
- 동일 job id 충돌 방지
- 최대 실행시간/시도수 제한 유지

---

## 5) 비기능 요구사항

- 재실행 가능(idempotent)한 job 디렉토리 규칙
- 실패 시 추적 가능한 job manifest 기록
- 메인 repo 무변경 보장(성공 반영 전)

---

## 6) 설정 스키마 (추가)

```json
{
  "autopilot": {
    "worktree": {
      "enabled": true,
      "rootDir": ".worktrees",
      "branchPrefix": "autopilot",
      "resultMode": "branch|merge|patch",
      "cleanupOnSuccess": false,
      "cleanupOnFail": false,
      "requireCleanBaseRepo": true
    }
  }
}
```

---

## 7) 산출물

job별:
- `.worktrees/<job-id>/harness/state/*`
- `.worktrees/<job-id>/harness/artifacts/*`
- `.worktrees/<job-id>/harness/artifacts/job-manifest.json`

base repo:
- (옵션) `harness/artifacts/autopilot-result-<job-id>.patch`

---

## 8) 완료 기준(DoD)

1. autopilot이 worktree에서 독립 실행된다.
2. base repo는 성공 반영 전까지 코드 변경이 없다.
3. DONE/FAILED 판정은 기존 하네스 기준 유지된다.
4. resultMode(branch/merge/patch) 중 최소 1개가 동작한다.
5. cleanup 옵션이 의도대로 동작한다.
