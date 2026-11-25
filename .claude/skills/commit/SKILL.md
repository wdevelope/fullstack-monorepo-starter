---
name: commit
description: 작업한 변경을 의도별로 나눠, 경로를 지정한 원자적 커밋과 한국어 커밋 메시지로 기록하는 스킬. 사용자가 "커밋해줘", "작업 커밋해줘", "나눠서 커밋해줘", "commit"이라고 할 때 실행한다. push는 하지 않는다(pr 스킬).
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git show:*), Bash(pnpm:*)
---

# Commit (의도별 분할, 한국어 메시지)

## 원칙

1. **승인 뒤 커밋**: 사용자가 커밋을 요청하거나 승인한 뒤에만 한다.
2. **원자적 커밋**: 커밋 하나에 의도 하나(기능, 버그 수정, 하네스 변경, 리팩토링 …). 구현과 그 테스트, 그 작업으로 바뀐 명세·작업 목록·결정 기록은 같은 커밋에 넣는다.
3. **경로 지정 커밋**: 스테이징 영역에 몰아 담지 않는다. 다른 세션이나 사용자가 스테이징한 변경이 섞이지 않게 `git commit -- <경로들>`로 그 경로만 커밋한다. `git add .`·`git add -A`·`git commit -a`는 쓰지 않는다.
4. **깨진 상태 금지**: 커밋하는 코드는 관련 테스트와 타입 검사를 통과한 상태다. pre-commit 훅이 커밋 가드·명세 검사·Prettier·ESLint를 돌린다. `--no-verify`로 건너뛰지 않는다.

## 메시지 규약

```text
type(scope): 한글 요약 (100자 이내, 마침표 없음)

- 왜 바꿨는지 또는 무엇이 바뀌었는지
- 영향 범위, 관련 시나리오 ID·결정 번호
```

- **type**: `feat` 새 기능, `fix` 버그 수정, `refactor` 동작 없는 구조 변경, `test` 테스트만, `docs` 문서만, `build` 빌드·의존성, `ci` CI, `chore` 그 밖(에이전트 규칙·스킬 포함), `perf` 성능, `revert`.
- **scope**: 영문 소문자와 `-`만(`commit-msg` 훅이 검사). `server`, `web`, `desktop`, `mobile`, `contracts`, `api-client`, `specs`, `harness`, `deps` 등. 여러 앱에 걸친 수직 슬라이스는 기능 이름(`bookmarks`)을 쓴다.
- 예: `feat(bookmarks): 글 북마크 추가와 목록 조회`, `fix(server): 내보내진 멤버가 댓글을 지울 수 있던 문제 수정 (WS-9)`, `docs(specs): 북마크 명세 초안`.
- 세션이나 도구가 정한 꼬리말(Co-Authored-By 등)이 있으면 본문 끝에 붙인다.

## 절차

1. **변경 조사**: `git status --short`와 `git diff`로 파일마다 무엇이 바뀌었는지 본다. 이번 작업과 무관한 사용자 변경이 섞였는지 확인하고, 섞였으면 그 파일은 빼고 보고한다.
2. **묶음 설계**: 파일을 의도별로 묶는다. 보통 다음 단위다.
   - 하네스·에이전트 규칙(`AGENTS.md`, `CLAUDE.md`, `.claude/`, `tooling/`, `.github/`)
   - 빌드·의존성(`package.json`, `pnpm-lock.yaml`, `tsconfig*`, `turbo.json`)
   - 기능 하나의 수직 슬라이스(명세 + 계약 + 서버 + 클라이언트 + 테스트)
   - 명세만 먼저 승인받은 경우의 `docs(specs)` 커밋
     묶음 계획을 사용자에게 한 줄씩 알린다.
3. **검증**: 이번 대화에서 이미 검증했고 그 뒤 바뀌지 않은 패키지는 건너뛴다. 아니면 바뀐 패키지의 `test`와 `typecheck`를 돌린다. 문서·스킬만 바뀌었으면 `pnpm spec:check`(명세를 건드렸을 때)로 충분하다.
4. **커밋**: 묶음마다 차례로
   1. 새 파일(`??`)만 `git add -N <파일>`로 추적시킨다(내용은 스테이징하지 않는다).
   2. 그 묶음의 파일을 모두 `--` 뒤에 적어 커밋한다. 지우거나 옮긴 파일은 옛 경로도 적는다.
      ```bash
      git commit -F- -- <경로1> <경로2> <<'EOF'
      type(scope): 한글 요약

      - 변경 이유 또는 내용
      EOF
      ```
   3. `git show --stat --oneline HEAD`로 들어간 파일을 확인한다. 다른 파일이 섞였으면 되돌리지 말고 보고한다.
   4. 훅이 막으면 메시지대로 고치고 다시 커밋한다(`--amend`가 아니라 새 커밋 시도).
5. **보고**: `git log --oneline -n <만든 개수>`를 보여 준다. push는 하지 않는다. 사용자가 요청하면 `pr` 스킬로 한다.
