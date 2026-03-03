# Tasks: Worktree 분리 Autopilot

## W0. 사전 점검
- [x] base repo clean-check 구현
- [x] job id 생성 유틸 구현
- [x] `.worktrees/` 경로 정책 확정

완료 기준:
- [x] dirty 상태 차단 동작 확인

## W1. worktree 생성/삭제 유틸
- [x] `git worktree add` 래퍼 구현
- [x] `git worktree remove` 래퍼 구현
- [x] 브랜치 prefix 규칙 적용

완료 기준:
- [x] 생성/삭제 단위 테스트 또는 dry-run 검증

## W2. autopilot 실행 경로 분리
- [x] autopilot 실행 cwd를 worktree로 전환
- [x] state/artifacts 경로 worktree 기준으로 저장
- [x] job manifest 기록

완료 기준:
- [x] base repo 미변경 상태 확인

## W3. 결과 반영 모드
- [x] `resultMode=branch` 구현(기본)
- [x] `resultMode=patch` 구현
- [x] (선택) `resultMode=merge` 구현

완료 기준:
- [x] DONE 시 반영 방식 선택 가능

## W4. cleanup 옵션
- [x] `cleanupOnSuccess`
- [x] `cleanupOnFail`
- [x] 실패 시 worktree 보존 메시지/경로 안내

완료 기준:
- [x] 옵션별 동작 확인

## W5. CLI/Config 연동
- [x] `harness/config.json`에 `autopilot.worktree` 섹션 추가
- [x] CLI 플래그 추가:
  - [x] `--worktree`
  - [x] `--result-mode <branch|patch|merge>`
  - [x] `--cleanup-on-success`
  - [x] `--cleanup-on-fail`

완료 기준:
- [x] config + CLI override 동작 확인

## W6. Pi 명령 연동
- [x] `/harness-autopilot`에 worktree 옵션 전달
- [x] 실행 결과 요약 출력(job id, worktree path, 반영 모드)

완료 기준:
- [x] Pi 명령으로 worktree 모드 실행 가능

## W7. 문서화
- [x] `docs/repro.md`에 worktree autopilot 예시 추가
- [x] 트러블슈팅(충돌/정리/복구) 섹션 추가

완료 기준:
- [x] 신규 사용자 재현 가능
