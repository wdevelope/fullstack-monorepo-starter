---
name: pr
description: 커밋된 작업 브랜치를 검증하고 원격에 push한 뒤 한국어 PR을 만들고 CI 결과를 확인하는 스킬. 사용자가 "PR 올려줘", "푸시해줘", "PR 만들어줘"라고 명시적으로 요청할 때만 실행한다. 커밋은 commit 스킬로 한다.
---

# PR (push와 풀 리퀘스트)

push와 PR은 바깥에 보이는 일이다. 사용자가 요청할 때만 한다. `main`에 직접 push하지 않는다.

1. **상태 확인**
   - `git status --short`에 커밋하지 않은 변경이 있으면 멈추고 알린다(커밋은 `commit` 스킬).
   - 현재 브랜치가 `main`이면 작업 브랜치(`feat/<기능>`, `fix/<요약>` 등)를 만들어 옮긴다.
   - `git log --oneline origin/main..HEAD`로 이번 PR에 들어갈 커밋을 확인한다.
2. **검증**: 이번 대화에서 마지막 커밋 뒤에 돌린 적이 없으면 전역 검증을 돌린다.
   ```bash
   pnpm lint && pnpm spec:check && pnpm test:tooling && pnpm typecheck && pnpm test
   ```
   실패하면 push하지 않고 보고한다.
3. **push**: `git push -u origin <브랜치>`. 원격 브랜치에 내가 없는 커밋이 있어 거부되면 강제 push하지 말고 `git fetch origin <브랜치>` 후 병합하고 다시 push한 뒤 알린다.
4. **PR**: `.github/pull_request_template.md`의 제목 구조를 따라 한국어로 쓴다.
   - 제목: 대표 커밋처럼 `type(scope): 한글 요약`.
   - 본문: 무엇을·왜(명세 링크와 시나리오 ID), 바뀐 것(레이어별), 검증(실행한 명령과 결과), 확인 못 한 것, 관련 결정(D 번호).
   - 만드는 방법은 세션에서 쓸 수 있는 도구(`gh` CLI 등)를 따른다.
5. **CI**: PR의 체크 결과를 확인해 보고한다. 실패하면 로그에서 원인을 찾아 보고하고, 사용자가 원하면 고친 커밋을 같은 브랜치에 더한다. 테스트를 건너뛰거나 지워서 초록을 만들지 않는다.
6. **보고**: PR 링크, 들어간 커밋 목록, CI 상태.
