# Harness Efficacy Log

목적: CI 이전 단계에서 하네스의 실효성을 빠르게 검증하기 위한 작업 로그.

운영 원칙:
- 작업 1개당 아래 템플릿 1세트 작성
- 실행 명령/게이트 결과는 실제 값만 기록
- 주관 평가 대신 수치(시간, 실패 횟수, 재시도 횟수) 우선

---

## Template (copy)

### [작업-ID] <작업명>
- Date:
- Scope:
- Baseline (하네스 없이 예상):

#### 1) 실행 기록
- Start:
- End:
- Elapsed(min):
- Runner attempts:
- Gate runs:
  - lint:
  - typecheck:
  - test:
  - arch:

#### 2) 실패/복구
- First failure:
- Root cause:
- Fix count:
- Recovery time(min):

#### 3) 결과
- Done criteria satisfied: (Y/N)
- Changed files:
- Regression found later: (Y/N)

#### 4) 비교 메모
- 하네스 도움된 지점:
- 하네스 오버헤드:
- 다음 개선 포인트:

---

## Session Entries

### [E0] v1 마무리 기준선
- Date: 2026-03-02
- Scope: H0~H4, A0~A7 완료 상태 기준선
- Baseline (하네스 없이 예상): 비교 데이터 없음(초기 기준선)

#### 1) 실행 기록
- Start: 세션 시작
- End: v1 DONE 상태 도달
- Elapsed(min): n/a (누적 세션)
- Runner attempts: state.runCount 기준 누적
- Gate runs:
  - lint: PASS
  - typecheck: PASS
  - test: PASS
  - arch: PASS

#### 2) 실패/복구
- First failure: 초기 환경에서 게이트 실패 및 docker.sock 권한 이슈
- Root cause: docker 그룹 권한/세션 반영 전 상태
- Fix count: 다수(환경+코드 수정)
- Recovery time(min): n/a

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: apps/*, harness/*, docs/* 전반
- Regression found later: runner 상태 기록 문제 1건(수정 완료)

#### 4) 비교 메모
- 하네스 도움된 지점: 게이트 기반 품질 고정, 상태 파일 기반 이어하기
- 하네스 오버헤드: 상태/아티팩트 관리 비용, runner 동작 정교화 필요
- 다음 개선 포인트: 소규모 단위 작업(E1~E5)로 시간/실패율 계량 비교

### [E1] 운영 마찰 감소(러너 명령 표준화 + 아티팩트 노이즈 관리)
- Date: 2026-03-02
- Scope: `harness:run`, `harness:reverify` 스크립트 추가 / 아티팩트 JSON 커밋 노이즈 정책 반영
- Baseline (하네스 없이 예상): 실행 명령 기억 의존, 반복 실행 시 커밋 노이즈 발생

#### 1) 실행 기록
- Start: 2026-03-02 15:32:18
- End: 2026-03-02 15:32:20
- Elapsed(min): ~0.03
- Runner attempts: +1 (runCount 13)
- Gate runs:
  - lint: PASS
  - typecheck: PASS
  - test: PASS
  - arch: PASS

#### 2) 실패/복구
- First failure: 없음
- Root cause: n/a
- Fix count: 0
- Recovery time(min): 0

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `.gitignore`, `package.json`, `docs/repro.md`, `docs/harness-efficacy-log.md`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 재검증 절차가 명령 1개로 표준화됨
- 하네스 오버헤드: 상태/체크포인트 파일 갱신으로 변경 파일 수 증가
- 다음 개선 포인트: runner 실행으로 갱신되는 상태 파일 커밋 정책 분리(코드 vs 런타임 로그)

### [E2] 효용성 수치 추출 자동화(메트릭 스냅샷)
- Date: 2026-03-02
- Scope: `harness:metrics` 명령 추가, 상태/게이트 핵심 수치 JSON 스냅샷 생성
- Baseline (하네스 없이 예상): 상태 수치 수동 확인/복사 필요

#### 1) 실행 기록
- Start: 2026-03-02 15:42:55
- End: 2026-03-02 15:42:56
- Elapsed(min): ~0.02
- Runner attempts: 변화 없음(리포트만 생성)
- Gate runs:
  - lint: last PASS @ 2026-03-02T05:51:48.904Z
  - typecheck: last PASS @ 2026-03-02T05:51:54.376Z
  - test: last PASS @ 2026-03-02T05:51:58.151Z
  - arch: last PASS @ 2026-03-02T05:51:58.231Z

#### 2) 실패/복구
- First failure: 없음
- Root cause: n/a
- Fix count: 0
- Recovery time(min): 0

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `harness/metrics/report.js`, `package.json`, `docs/repro.md`, `docs/harness-efficacy-log.md`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 효용성 지표(runCount, gate pass 시각)를 즉시 추출 가능
- 하네스 오버헤드: 메트릭 파일 경로/형식 유지보수 필요
- 다음 개선 포인트: E3에서 3~5개 실제 작업을 같은 템플릿으로 누적 비교

### [E3] lint 게이트 실체화(placeholder 제거)
- Date: 2026-03-02
- Scope: ESLint flat config 도입, API/UI lint 스크립트를 실제 검사로 전환
- Baseline (하네스 없이 예상): lint가 항상 pass(placeholder)라 품질 신호 약함

#### 1) 실행 기록
- Start: lint 설정 적용
- End: lint/typecheck/test/arch 재검증 완료
- Elapsed(min): ~10
- Runner attempts: 변화 없음(수동 게이트 검증)
- Gate runs:
  - lint: PASS (warnings only)
  - typecheck: PASS
  - test: PASS
  - arch: PASS

#### 2) 실패/복구
- First failure: ESLint v10에서 `.eslintrc` 미지원 오류
- Root cause: flat config 미적용
- Fix count: 1 (eslint.config.cjs 전환)
- Recovery time(min): ~3

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `eslint.config.cjs`, `apps/fare-api/package.json`, `apps/fare-ui/package.json`, `package.json`, `package-lock.json`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: placeholder lint의 허점을 즉시 드러내고 수정 루프를 강제함
- 하네스 오버헤드: Vue 스타일 경고 다수 발생(규칙 튜닝 필요)
- 다음 개선 포인트: warning 정책(허용/차단) 명확화

### [E4] lint 경고 차단 정책 적용(0-warning)
- Date: 2026-03-02
- Scope: lint 스크립트에 `--max-warnings=0` 적용, Vue 파일 자동수정으로 경고 제거
- Baseline (하네스 없이 예상): warning 누적으로도 pass되어 품질 저하 누락 가능

#### 1) 실행 기록
- Start: lint strict 적용
- End: lint/typecheck/test/arch 재검증 완료
- Elapsed(min): ~6
- Runner attempts: 변화 없음(수동 게이트 검증)
- Gate runs:
  - lint: PASS (0 errors, 0 warnings)
  - typecheck: PASS
  - test: PASS
  - arch: PASS

#### 2) 실패/복구
- First failure: package.json 콤마 누락으로 npm JSON parse 실패
- Root cause: 수동 스크립트 편집 실수
- Fix count: 1
- Recovery time(min): ~2

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `apps/fare-api/package.json`, `apps/fare-ui/package.json`, `apps/fare-ui/src/App.vue`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: warning을 실패로 승격해 린트 단계의 실효성 강화
- 하네스 오버헤드: 초기 포맷 조정 비용 발생
- 다음 개선 포인트: Vue 템플릿 스타일 규칙을 팀 컨벤션으로 확정

### [E5] 브라우저 DOM 스냅샷 도입 + hang 원인 제거
- Date: 2026-03-02
- Scope: Playwright 기반 DOM snapshot 테스트 추가, 테스트 내부 dev-server spawn 제거
- Baseline (하네스 없이 예상): 브라우저 회귀 검증 없음, 실패 시 프로세스 정리 이슈로 지연 가능

#### 1) 실행 기록
- Start: dom snapshot 테스트 추가
- End: `npm run test:browser` PASS
- Elapsed(min): ~20
- Runner attempts: 변화 없음(수동 검증)
- Gate runs:
  - lint: PASS
  - typecheck: PASS
  - test: PASS
  - arch: PASS
  - test:browser: PASS

#### 2) 실패/복구
- First failure: dom selector timeout + 테스트 종료 지연
- Root cause: 테스트가 내부에서 `npm run dev`(watch 프로세스)를 spawn해 실패 시 정리 불완전
- Fix count: 2 (CORS 반영 후 서버 재시작, 브라우저 테스트를 외부 실행 서버 사용 방식으로 변경)
- Recovery time(min): ~8

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `apps/fare-api/src/api/create-app.ts`, `apps/fare-ui/src/App.vue`, `apps/fare-ui/test/browser/dom-snapshot.e2e.test.ts`, `apps/fare-ui/test/browser/golden/dom-snapshot.expected.json`, `apps/fare-ui/package.json`, `package.json`, `docs/repro.md`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 실제 브라우저 기준 UI 계약(스냅샷) 회귀 검증 가능
- 하네스 오버헤드: 테스트용 셀렉터(data-testid)와 golden 관리 필요
- 다음 개선 포인트: 브라우저 스냅샷을 선택적 게이트(`test:browser`)로 운영하고 변경시만 갱신

### [E6] 브라우저 테스트를 하네스 선택 게이트로 연결
- Date: 2026-03-02
- Scope: `harness/gates`에 `browser` gate 추가, runner `--with-browser` 플래그 지원
- Baseline (하네스 없이 예상): 브라우저 테스트는 수동 명령으로만 실행

#### 1) 실행 기록
- Start: gate 연동 작업 시작
- End: 단위 게이트/러너 브라우저 옵션 검증 완료
- Elapsed(min): ~8
- Runner attempts: 선택 실행(기본 플로우 영향 없음)
- Gate runs:
  - browser: PASS (서버 기동 시)
  - lint/typecheck/test/arch: 기존 PASS 유지

#### 2) 실패/복구
- First failure: 없음
- Root cause: n/a
- Fix count: 0
- Recovery time(min): 0

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `harness/gates/run.js`, `harness/runner/run.js`, `package.json`, `docs/harness-contract.md`, `docs/repro.md`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 브라우저 회귀 검증을 하네스 명령 체계로 표준화
- 하네스 오버헤드: 서버 선기동 precondition 관리 필요
- 다음 개선 포인트: 서버 자동기동/정리 래퍼를 별도 안정화 스크립트로 분리

### [E7] harness config 도입(프로젝트 독립성 개선)
- Date: 2026-03-02
- Scope: `harness/config.json` 추가, runner/gates/metrics의 하드코딩 경로/명령 일부 설정화
- Baseline (하네스 없이 예상): 다른 프로젝트로 이식 시 코드 직접 수정 필요

#### 1) 실행 기록
- Start: config 도입 작업 시작
- End: lint/typecheck/test/arch + browser gate 재검증
- Elapsed(min): ~10
- Runner attempts: 변화 없음(수동 검증)
- Gate runs:
  - lint: PASS
  - typecheck: PASS
  - test: PASS
  - arch: PASS
  - browser: PASS (서버 기동 상태)

#### 2) 실패/복구
- First failure: 없음
- Root cause: n/a
- Fix count: 0
- Recovery time(min): 0

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `harness/config.json`, `harness/gates/run.js`, `harness/runner/run.js`, `harness/metrics/report.js`, `docs/harness-contract.md`, `docs/repro.md`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 경로/명령 설정 분리로 재사용성 향상
- 하네스 오버헤드: config 스키마 관리 필요
- 다음 개선 포인트: config schema validation 추가

### [E8] Stitch HTML 기반 UI 리디자인 반영
- Date: 2026-03-02
- Scope: `design/stitch/code.html`을 기준으로 Vue 대시보드 레이아웃 재구성
- Baseline (하네스 없이 예상): 기능 위주 단순 UI, 디자인 검증 부족

#### 1) 실행 기록
- Start: Stitch 산출물 반입/정리
- End: lint/typecheck/test + browser snapshot 업데이트 후 PASS
- Elapsed(min): ~20
- Runner attempts: 변화 없음(수동 검증)
- Gate runs:
  - lint: PASS
  - typecheck: PASS
  - test: PASS
  - arch: PASS
  - test:browser: PASS (snapshot 갱신)

#### 2) 실패/복구
- First failure: browser snapshot mismatch
- Root cause: 마크업 구조/공백 변화로 golden 불일치
- Fix count: 1 (snapshot update)
- Recovery time(min): ~2

#### 3) 결과
- Done criteria satisfied: Y
- Changed files: `apps/fare-ui/src/App.vue`, `apps/fare-ui/test/browser/golden/dom-snapshot.expected.json`, `design/stitch/*`, `.gitignore`
- Regression found later: N

#### 4) 비교 메모
- 하네스 도움된 지점: 브라우저 스냅샷으로 리디자인 회귀를 즉시 확인 가능
- 하네스 오버헤드: 디자인 변경 시 golden 갱신 루틴 필요
- 다음 개선 포인트: snapshot에 semantic 추출(텍스트/구조) 비중을 높여 스타일 민감도 조절
