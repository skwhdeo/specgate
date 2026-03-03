# Plan: Worktree 분리 Autopilot (v1)

## M0. 준비/가드
- 현재 autopilot 실행 경로 파악
- base repo clean-check 유틸 추가
- job id 생성 규칙 확정

산출물:
- `job-id`, `clean-check` 유틸 함수

## M1. Worktree Lifecycle 구현
- createWorktree(jobId)
- removeWorktree(jobId)
- job manifest 기록

산출물:
- worktree 생성/삭제 동작
- manifest 파일

## M2. Worktree 내부 Autopilot 실행
- autopilot 실행 cwd를 worktree로 변경
- config/path를 worktree 기준으로 재해석
- state/artifacts 분리 확인

산출물:
- 독립 실행 검증 로그

## M3. 결과 반영 모드
- branch 유지 모드(기본)
- patch 생성 모드
- merge 모드(선택)

산출물:
- resultMode별 결과물

## M4. Cleanup/복구
- success/fail별 cleanup 옵션
- 실패 시 디버그 힌트 출력

산출물:
- 자동/수동 정리 전략 확정

## M5. 문서/운영 가이드
- 실행 예시/트러블슈팅 문서화
- 안전 운영 기본값 확정

산출물:
- repro/운영 가이드 업데이트

---

## 리스크 및 대응

1. worktree 경로 충돌
- 대응: job id + 존재 체크

2. merge 충돌
- 대응: v1 기본 모드 branch 유지/patch 우선

3. 디스크 누수(worktree 누적)
- 대응: cleanup 옵션 + 주기적 prune 안내

4. 사용자 오해(메인 변경 여부)
- 대응: 시작/종료 시 요약 출력(변경 위치, 반영 여부)
