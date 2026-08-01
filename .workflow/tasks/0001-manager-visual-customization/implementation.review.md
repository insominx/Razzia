Last Edited: 2026-06-26

# Implementation Review: Manager visual customization

## Result
- Status: partial
- Phase: review-implementation
- Verdict: request changes
- Reviewed change set: working tree diff for `.workflow/tasks/0001-manager-visual-customization`
- Canonical artifact(s): `.workflow/tasks/0001-manager-visual-customization/plan.md`, `.workflow/tasks/0001-manager-visual-customization/implementation.md`
- Human action needed: decide whether the eventual PR is a partial global-background slice or the full visual-customization task.

## Contract check

| Acceptance check | Status | Evidence | Gap |
|---|---|---|---|
| Global default can be set, read back, and cleared | not verified | Manager Visuals UI, backend upload/set/clear handlers, and config payload are implemented; `pnpm -r run types` passes | Manual browser upload/reload/clear and `game.json` inspection are still missing |
| Per-quiz override can be set, read back, and cleared | not verified | Shared quiz schema allows `visuals` | Per-quiz editor UI/save path is not implemented |
| Resolution precedence works | not verified | `resolveVisuals` implements quiz-over-global precedence in `packages/socket/src/services/visuals.ts` | Manual three-case game/editor matrix is missing; per-quiz UI path is absent |
| Session background is fixed | not verified | `Game` stores constructor-time `ResolvedVisuals` and reconnect payloads include it | Manual reconnect after config change is missing |
| Config assets survive restart | not verified | Asset files are stored under `config/assets/backgrounds` | Restart/container persistence check is missing |
| Quiz editor preview uses resolved background | not verified | No `QUIZZ.DATA.resolvedVisuals` or editor preview wiring in current diff | Phase 3 remains unimplemented |
| Fresh player join shows session background | partially verified | `GAME.SUCCESS_JOIN` now emits `{ gameId, visuals }`; player store passes `visuals.backgroundUrl` to `GameWrapper` | Manual fresh join screenshot/payload check is missing |
| Config directory is not broadly exposed | verified | Production socket route probe returned `200 image/png` for a temp background and `404` for `/game.json`, traversal, `quizz/`, and `results/` | nginx production proxy was not separately browser-tested |
| Type contracts stay aligned | verified | `pnpm -r run types` passed on 2026-06-26; `git diff --check` passed | Full `pnpm build` was recorded previously but not rerun in this review pass |

## Change-set map

- Changed files:
  - Service/backend: socket config service, visual asset service, manager/game handlers, game session/player manager, HTTP server bootstrap.
  - Browser/client: manager Visuals tab, config context, game stores/pages, join flow, `GameWrapper`, locales.
  - Shared contracts: visual types/validators, game config validator, quiz/socket/manager types, event constants.
  - Build/deploy: Vite dev proxy and Docker nginx proxy.
  - Docs/workflow: implementation/progress records and this review.
- Public APIs/schemas/config:
  - New `BackgroundRef`, `VisualsConfig`, `ResolvedVisuals`.
  - `game.json.visuals.background` and `Quizz.visuals.background`.
  - New manager socket events for upload, global set, and global clear.
  - Changed `GAME.SUCCESS_JOIN` payload from string to `{ gameId, visuals }`.
  - Added visuals to game creation and reconnect payloads.
- Behavioral deltas:
  - Managers get a Visuals tab with preview, upload, clear, click, keyboard, and drag/drop upload.
  - Uploaded backgrounds are stored in the config directory and exposed only through `/config-assets/backgrounds/<file>`.
  - New games snapshot the resolved background and clients render it with bundled fallback.
- Mixed feature/refactor/debug changes:
  - `getPath` was promoted to exported `getConfigPath` as part of config validation and asset serving.
  - No unrelated debug logging was added.
  - `packages/web/src/route.gen.ts` is dirty with no content diff and appears unrelated/pre-existing.
- Diff reviewability / rollback risk:
  - The change set is coherent as a global-background vertical slice, but it is not reviewable as the full plan because Phase 3 and several manual acceptance checks remain absent.

## Findings

### Blockers
- Where: `.workflow/tasks/0001-manager-visual-customization/plan.md`, Phase 3 and acceptance checks.
- Why it matters: If this is opened as the full manager visual customization PR, core planned behavior is missing: per-quiz overrides, quiz editor resolved preview, README docs, and manual browser proof for upload/reconnect/restart. That mismatch would look unfinished in review.
- Suggested fix: Either scope the PR title/description explicitly to "global background upload and live-game rendering" or finish Phase 3 plus docs/manual evidence before opening it as the full task.

### Major
- Where: `packages/socket/src/handlers/manager.ts:21`
- Why it matters: `BACKGROUND_UPLOAD` assumes the client supplied an acknowledgement callback. A logged-in or malformed client can emit the event without one; the handler can write the asset, throw while calling `callback`, then throw again in the catch block while trying to call `callback({ error })`. That is a boundary robustness issue and can leave orphaned assets.
- Suggested fix: Treat the ack as optional at the boundary. Check `typeof callback === "function"` before storing or before calling it, emit a manager error when absent, and update the socket type to reflect the runtime-safe shape if needed.

- Where: `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx:65` and `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx:118`
- Why it matters: The UI shows success immediately after emitting set/clear, but those socket events have no acknowledgement. If `updateGameConfig` fails, the user can see a success toast plus an error toast, and an uploaded file may remain unused.
- Suggested fix: Add acknowledgements to global set/clear or a combined upload-and-set event. Toast success only after the persisted config update succeeds; on set failure after upload, delete the just-written asset best-effort or record cleanup debt explicitly.

### Minor
- Where: `packages/socket/src/services/manager.ts:14`
- Why it matters: `export const emitConfig = (...) => { ... }` is formatted with an unusual newline before the block. It is valid, but it reads like accidental formatting and is the sort of thing reviewers mark as sloppy.
- Suggested fix: Convert it to a normal block-bodied function or keep the arrow and put the block on the same line.

- Where: `packages/web/src/route.gen.ts`
- Why it matters: The file is dirty in `git status` but has no content diff. That looks like unrelated generated/line-ending churn in a PR.
- Suggested fix: Isolate or clean it before opening a PR, without reverting unrelated user work unless explicitly requested.

### Nits
- None beyond the minor cleanup above.

## Regression watchlist

- Upload without ack: fastest detection is a socket-level probe that emits `manager:backgroundUpload` without a callback after manager auth; server should emit an error and stay alive without writing a file.
- Browser upload/drag/drop: fastest detection is one manual Manager -> Visuals run with file picker and drag/drop, followed by `config/game.json` inspection.
- First join/reconnect visuals: fastest detection is browser DevTools WebSocket payload inspection for `GAME.SUCCESS_JOIN`, `MANAGER.SUCCESS_RECONNECT`, and `PLAYER.SUCCESS_RECONNECT`.
- Asset exposure: repeat the positive background route and negative config route probes after any nginx or server bootstrap change.

## Risks / unresolved

- The current code is suitable for a partial vertical slice only if the PR scope says so plainly.
- No automated tests exercise the socket upload boundary, persistence update failure, or browser drag/drop path.
- Manual browser evidence is still missing for the feature most visible to users.

## Follow-ups

- Add focused socket tests around background upload validation and missing ack handling if the project has or gains a backend test harness.
- Add a cleanup policy for old background assets after replacement or failed set.
- Complete Phase 3 per-quiz authoring and editor preview as a separate slice if the global-background PR ships first.

## Next best action

- Fix the upload ack boundary and persisted-set acknowledgement flow, then rerun `pnpm -r run types`, `git diff --check`, and a manual Manager -> Visuals browser pass.

## Resume anchors

- `.workflow/tasks/0001-manager-visual-customization/plan.md`
- `.workflow/tasks/0001-manager-visual-customization/implementation.md`
- `packages/socket/src/handlers/manager.ts`
- `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx`
- `packages/socket/src/services/visuals.ts`
- `packages/web/src/features/game/components/join/Username.tsx`
- `packages/web/src/features/game/components/GameWrapper.tsx`
- `pnpm -r run types`
- `git diff --check`
- `node C:\Users\mlinh\.codex\skills\.g-skills\bin\workflow-verify.js .workflow/tasks/0001-manager-visual-customization`
