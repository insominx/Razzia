# Implementation Record

Last Edited: 2026-06-29

## Phase 3 update (2026-06-29) — per-quiz override and editor preview

- Added scope-neutral `MANAGER.BACKGROUND_ASSET_UPLOAD` socket event: stores an asset via `storeBackgroundAsset` and acks `{ ref, url }` **without** writing `game.json` or quiz JSON. This is the path quiz authoring uses, so a per-quiz override never clobbers the global default (the plan's H1 fix from the fix-loop).
- Quiz editor now tracks `visuals.background` (authored ref) plus a preview URL in `QuizzEditorProvider`; the ref is included in `QUIZZ.SAVE`/`QUIZZ.UPDATE` payloads, so overrides persist through the normal quiz save path and are no longer dropped on edit.
- Added a compact `QuizzBackgroundControl` (upload + clear) in the quiz editor header. Upload calls `BACKGROUND_ASSET_UPLOAD` and previews the returned `url` immediately; no "saved" toast is shown because persistence only happens on quiz save (the live background change is the feedback).
- `QUIZZ.GET → QUIZZ.DATA` now returns `{ quizz, resolvedVisuals }`; the server resolves the persisted preview via `resolveVisuals(quizz, getGameConfig())`. The editor previews unsaved uploads from the upload ack `url` and persisted overrides from `resolvedVisuals.backgroundUrl`, falling back to the bundled asset.
- `QuestionEditor` renders `backgroundUrl ?? bundled background`.

## Contract as-executed

- Spec source: plan.md
- Behavior delivered:
  - Added shared background visual contracts for authored config refs and backend-derived runtime visuals.
  - Extended quiz validation and shared quiz types with optional `visuals.background`.
  - Promoted game config validation into common with optional `visuals`.
  - Added a socket-owned visual service for background asset path validation, public URL generation, precedence resolution, and narrow HTTP serving under `/config-assets/backgrounds/<file>`.
  - Attached Socket.IO to a Node HTTP server with an 8 MB `maxHttpBufferSize`, leaving Socket.IO on `/ws` and adding config asset proxying in Vite and nginx.
  - Added manager global background upload/set/clear events and a Visuals tab in manager setup.
  - Extended manager config payloads with authored global visuals and resolved preview visuals.
  - Snapshotted resolved visuals during game creation and sent them through manager creation, fresh player join, and manager/player reconnect payloads.
  - Updated `GameWrapper` to render the session background URL with the bundled background as fallback.
  - Added drag/drop, click, and keyboard activation to the manager Visuals preview area, reusing the same validated upload path as the file picker.
  - Hardened the manager background socket boundary so upload acknowledgements are optional at runtime, missing acknowledgements do not write files, and UI success is shown only after persisted config mutation succeeds.
- Non-goals honored:
  - No per-quiz background authoring UI was implemented in this slice.
  - No quiz editor preview change was implemented in this slice.
  - No broad config directory serving was added.
  - No logo, accent color, login shell, or theme system work was added.

## Deviations from plan

| planned | actual | reason |
|---|---|---|
| Phase 1 complete with optional manual asset-route probe | Code and type checks completed; live HTTP probe not run | This slice did not start the socket server or create temp config assets; later manual verification remains required. |
| Add common game config validator | Added `packages/common/src/validators/game-config.ts` and socket `getGameConfig` uses it | Matches plan; keeps old missing `visuals` config valid. |
| Phase 2 manager UI only | Also wired live game session rendering for global/resolved visuals | User explicitly needed a visible way to change the background, and manager upload without live rendering would not satisfy that immediate behavior. |
| File picker upload only | Visuals preview now also accepts dropped images | User requested drag/drop directly on the Visuals panel. |
| Separate upload success followed by fire-and-forget set | Upload now stores the file and persists it as the global background before acknowledging success; set/clear also acknowledge persisted mutations | Implementation review found the split flow could show false success and leave orphaned files if the config write failed. |
| Phase 3 reuse of `MANAGER.BACKGROUND_UPLOAD` for quiz override | Added a separate `MANAGER.BACKGROUND_ASSET_UPLOAD` that writes no config | The global upload event persists `game.json`; reusing it for a quiz override would overwrite the global default (plan fix-loop H1). |
| Quiz upload shows a "saved"/"updated" toast | No success toast on quiz upload; preview updates instead | The override is not persisted until the quiz is saved, so a success toast would be a false persisted-success signal. |
| `QUIZZ.DATA` returns raw `QuizzWithId` | Returns `{ quizz, resolvedVisuals }` | Editor must receive a backend-resolved preview URL; web must not construct config-asset URLs. |

## Authority and change map (as-built)

- Owner: socket config service plus new backend visual resolver/service.
- Decision point: `resolveVisuals` in `packages/socket/src/services/visuals.ts`; public config asset reads in `serveConfigAsset`.
- Files changed:
  - `packages/common/src/types/visuals.ts` - added `BackgroundRef`, `VisualsConfig`, `ResolvedVisuals`.
  - `packages/common/src/validators/visuals.ts` - added background ref/path and visuals config validators.
  - `packages/common/src/validators/game-config.ts` - added shared `GameConfig` validator/type.
  - `packages/common/src/types/game/index.ts` - added optional `Quizz.visuals`.
  - `packages/common/src/validators/quizz.ts` - accepts optional quiz visuals.
  - `packages/socket/src/services/config.ts` - exports `getConfigPath` and validates `game.json` through common.
  - `packages/socket/src/services/visuals.ts` - owns config asset constants, background URL generation, resolver precedence, route serving, upload buffer constants, and best-effort uploaded asset deletion for rollback.
  - `packages/socket/src/handlers/manager.ts` - added manager-authenticated background upload, global set, and global clear handlers; upload now persists global config before acknowledging and cleans up the just-written asset if persistence fails.
  - `packages/socket/src/services/manager.ts` - emits current game visuals in normal block formatting.
  - `packages/socket/src/handlers/game.ts` - resolves visuals when a game is created.
  - `packages/socket/src/services/game/index.ts` - stores session visuals and includes them in creation/reconnect payloads.
  - `packages/socket/src/services/game/player-manager.ts` - includes session visuals in fresh player join payloads.
  - `packages/socket/src/index.ts` - attaches Socket.IO to a Node HTTP server and installs the config asset route.
  - `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx` - added manager setup background preview/upload/clear UI.
  - `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx` - added drag/drop handling, drag-over styling, and keyboard/click activation for the preview drop area; upload/clear success toasts now wait for server acknowledgement.
  - `packages/web/src/features/manager/components/configurations/index.tsx` - added the Visuals tab.
  - `packages/web/src/features/game/components/GameWrapper.tsx` - renders a resolved session background URL with bundled fallback.
  - `packages/web/src/features/game/stores/manager.tsx` and `packages/web/src/features/game/stores/player.tsx` - store session visuals.
  - `packages/web/src/pages/manager/config.tsx`, `packages/web/src/pages/party/$gameId.tsx`, `packages/web/src/pages/party/manager/$gameId.tsx`, `packages/web/src/features/game/components/join/Username.tsx` - wire visual socket payloads into stores and `GameWrapper`.
  - `packages/web/vite.config.ts` - proxies `/config-assets` to the socket process in dev.
  - `docker/nginx.conf` - proxies `/config-assets/` to the socket process in production.
  - Phase 3 (2026-06-29):
    - `packages/common/src/constants.ts` - added `MANAGER.BACKGROUND_ASSET_UPLOAD`.
    - `packages/common/src/types/game/socket.ts` - `QUIZZ.DATA` now `{ quizz, resolvedVisuals }`; added `BACKGROUND_ASSET_UPLOAD` client event.
    - `packages/socket/src/handlers/manager.ts` - added `BACKGROUND_ASSET_UPLOAD` handler (stores asset, returns `{ ref, url }`, no config write).
    - `packages/socket/src/handlers/quizz.ts` - `QUIZZ.GET` resolves and emits `resolvedVisuals` with the quiz.
    - `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx` - tracks `background` ref + preview `backgroundUrl` + `setBackground`; new `initialBackgroundUrl` prop.
    - `packages/web/src/features/quizz/components/QuizzBackgroundControl.tsx` - new quiz background upload/clear control.
    - `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx` - includes `visuals` in save/update; renders the control.
    - `packages/web/src/features/quizz/components/QuestionEditor/index.tsx` - previews `backgroundUrl ?? bundled`.
    - `packages/web/src/pages/manager/quizz/$quizzId.tsx` - consumes new `QUIZZ.DATA` shape; passes resolved URL to provider.
    - `packages/web/src/locales/{en,es,it}/quizz.json` - added `background` label.

## Implementation decisions

| decision | alternatives considered | rationale |
|---|---|---|
| Restrict `BackgroundRef.path` to one safe filename token | Allow nested subdirectories under backgrounds | Keeps Phase 1 traversal guarantees simple and matches current planned generated/unique filenames. |
| Return no `backgroundUrl` when a ref is invalid or missing on disk | Emit a broken public URL or throw during resolution | Preserves bundled fallback behavior and avoids breaking old or manually edited config. |
| Serve only `GET` on `/config-assets/backgrounds/<file>` | Also allow broad `/config-assets` static serving | Avoids exposing `game.json`, quiz JSON, or results. |
| Use 8 MB Socket.IO `maxHttpBufferSize` | Keep default 1 MB or lower the 5 MB upload cap | 8 MB covers a 5 MB decoded image plus base64 expansion and small metadata. |
| Upload and persist global background in one acknowledged handler | Upload then set through two socket actions | Avoids false success and lets the handler delete the just-written asset if `game.json` persistence fails. |
| Keep `GLOBAL_BACKGROUND_SET` but add acknowledgement | Remove the event until a future ref picker exists | It remains useful for a future asset picker/ref-based UI, but persisted success/failure is now explicit. |
| Persist session visuals in manager/player stores | Re-resolve from current manager config on game pages | Preserves fixed-at-game-start behavior and supports reconnect payloads. |
| Reuse one `uploadFile` path for picker and drop | Separate drop upload logic | Keeps validation, toasts, and socket acknowledgement handling identical across both inputs. |

## Acceptance / evidence

| check | status | evidence | gap |
|---|---|---|---|
| Existing config and quiz JSON remain valid with missing `visuals` | verified | `pnpm --filter @razzia/common run types`; `pnpm --filter @razzia/socket run types`; validators mark `visuals` optional | Runtime old-config load not manually exercised. |
| Shared visual contracts exist | verified | Added common types and validators; common type check passed | None for Phase 1. |
| Known config asset ref can resolve to public URL | verified | Built socket bundle, started `pnpm --filter @razzia/socket start`, temp `config/assets/backgrounds/probe-route.png` returned `200 image/png` | UI upload path not manually clicked in browser. |
| Config directory is not broadly exposed | verified | Probed `/game.json`, `/config-assets/../game.json`, `/config-assets/quizz/`, `/config-assets/results/`; all returned `404` | Browser/nginx production probe still pending. |
| Global default can be set, read back, and cleared | partially verified | Manager UI and socket handlers implemented; upload and clear acknowledgements now represent persisted config updates; `pnpm -r run types` and `pnpm build` passed | Manual browser upload/reload/clear and `game.json` inspection still pending. |
| Global background supports drag/drop upload | verified by type/build | `ConfigVisuals` handles `dragover`, `dragleave`, and `drop`, reusing `uploadFile`; `pnpm -r run types` and `pnpm build` passed | Manual browser drag/drop pending. |
| Fresh player join receives visuals | verified by type/build | `GAME.SUCCESS_JOIN` payload changed to `{ gameId, visuals }`; `Username` stores visuals before navigation | Manual join flow pending. |
| Live game renders resolved background | verified by type/build | Game create resolves visuals, `Game` stores them, stores pass `visuals.backgroundUrl` to `GameWrapper` | Manual game screenshot pending. |
| Type contracts stay aligned | verified | `pnpm -r run types` and `pnpm build` exited 0 | None for compiled contracts. |
| Workflow verifier passes | verified | `node [REDACTED-PATH] .workflow/tasks/0001-manager-visual-customization` result: pass | No scripted checks configured. |
| Missing upload acknowledgement cannot write orphaned assets | verified by code/type/build | `BACKGROUND_UPLOAD` returns before `storeBackgroundAsset` unless `callback` is a function; type/build checks pass | Runtime socket probe was attempted but port 3001 was occupied. |
| Per-quiz override can be set and persisted without clobbering global | verified by type/build | `BACKGROUND_ASSET_UPLOAD` writes no config; override ref flows through `QUIZZ.SAVE`/`UPDATE`; `pnpm -r run types` and `pnpm build` pass | Manual browser set/reload of a quiz override pending. |
| Quiz editor preview uses resolved background | verified by type/build | `QUIZZ.DATA` returns `resolvedVisuals`; `QuestionEditor` renders `backgroundUrl ?? bundled`; unsaved upload previews from ack `url` | Manual editor matrix (override/global/fallback) pending. |

## Verification record

- Verified:
  - `pnpm --filter @razzia/common run types` passed.
  - `pnpm --filter @razzia/socket run types` passed.
  - `pnpm --filter @razzia/web run types` passed.
  - `pnpm -r run types` passed.
  - `pnpm build` passed.
  - Drag/drop follow-on: `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier passed.
  - Review-fix follow-on: `pnpm --filter @razzia/common run types`, `pnpm --filter @razzia/socket run types`, `pnpm --filter @razzia/web run types`, `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier passed.
  - Workflow verifier passed with no scripted checks configured.
  - `rg "getPath\(" packages/socket/src/services/config.ts packages/socket/src/services/visuals.ts` found no stale helper calls.
  - Scoped HTTP asset route probe passed with a temporary local PNG; negative config probes returned 404.
  - Phase 3 follow-on (2026-06-29): `pnpm --filter @razzia/common run types`, `pnpm --filter @razzia/socket run types`, `pnpm --filter @razzia/web run types`, `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier all passed.
- Not verified:
  - Manual browser upload/set/clear flow and manager reload.
  - Manual browser drag/drop upload gesture.
  - No-ack socket runtime probe; first attempt could not resolve `socket.io-client` from the repo root, second attempt was blocked by `EADDRINUSE` on fixed port 3001. The handler control flow was verified by code review and type/build checks.
  - Phase 3 manual browser matrix: set a quiz override, confirm it persists in quiz JSON and does NOT change `game.json`; editor preview shows override/global/fallback; unsaved upload preview before save.
  - Manual live game screenshot, reconnect behavior, and restart persistence.
- Failed:
  - None. A targeted Prettier command was unavailable in this environment; formatting-sensitive issues found in diff review were corrected manually.
  - Initial dev-server route probe failed because `tsx` is not installed; after `pnpm build`, the production socket start route probe passed.

## Change control record

- Checkpoints used:
  - Added shared validators/types and socket asset service, then ran package type checks.
  - Reviewed focused diff and corrected a formatting-only regression in `config.ts`.
  - Reran package type checks and workflow verifier.
  - Added manager UI/global background and live session visual wiring, then ran full workspace types and build.
  - Probed the production socket asset route with a temporary local config asset and removed the probe file after the check.
  - Added drag/drop support to the existing Visuals preview/upload surface, then reran full workspace types, production build, diff check, and workflow verifier.
- Mixed feature/refactor/debug batches:
  - Config path helper rename was combined with game config validation because the visual service needs one exported config path authority.
- Rollback/resume anchor:
  - Remove `packages/socket/src/services/visuals.ts`, new common visual/game-config validator files, and the HTTP server/proxy changes to return to no custom config assets.

## Discovered risks / debt

| finding | severity | recommendation |
|---|---|---|
| The public asset route has not been exercised with a real running socket server | medium | Run the Phase 1 HTTP positive/negative probes before or during the upload/UI slice. |
| `getGameConfig` still returns `{}` after parse failure to preserve prior behavior | low | Consider tightening error propagation in a separate config-hardening task if maintainers want fail-fast startup. |
| Prettier binary was not callable through attempted root/package exec commands | low | Use package scripts or confirm local install before relying on format automation in later phases. |
| Browser UI upload/reload/clear was not manually clicked | medium | Run the manager Visuals tab manual test before marking task complete. |
| Browser drag/drop upload was not manually exercised | low | Drag an image onto the Visuals preview area during the next UI pass. |
| The no-ack upload boundary has code/build evidence but not a live socket probe | low | Re-run the no-ack probe when port 3001 is free, or make the socket port configurable for isolated integration probes. |

## Resume anchors

- Files/docs/tests/commands/artifacts:
  - `.workflow/tasks/0001-manager-visual-customization/plan.md`
  - `.workflow/tasks/0001-manager-visual-customization/progress.md`
  - `packages/socket/src/services/visuals.ts`
  - `packages/socket/src/index.ts`
  - `packages/common/src/validators/game-config.ts`
  - `packages/common/src/validators/visuals.ts`
  - `packages/web/src/features/manager/components/configurations/ConfigVisuals.tsx`
  - `packages/web/src/features/game/components/GameWrapper.tsx`
  - `pnpm --filter @razzia/common run types`
  - `pnpm --filter @razzia/socket run types`
  - `pnpm --filter @razzia/web run types`
  - `pnpm -r run types`
  - `pnpm build`
  - `node [REDACTED-PATH] .workflow/tasks/0001-manager-visual-customization`

## Continue from here

- Stop reason: implementation slice complete; full task remains active.
- Resume point: Phase 5 (README + manual acceptance evidence); Phase 1–4 code is implemented.
- What remains: README config-visuals docs; manual browser verification of global upload, per-quiz override (persists in quiz JSON, leaves `game.json` unchanged), editor preview matrix, fresh-join/reconnect visuals, and restart persistence.
- Next command/check: run the app, set a per-quiz background in the editor, save, inspect the quiz JSON and `config/game.json`, then start a game from that quiz and confirm the override renders.
- User input needed: PR scope decision (partial slice vs full task) still open from the implementation review.
