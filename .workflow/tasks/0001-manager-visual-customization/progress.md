# Task Progress: Manager visual customization

Current status: completed — superseded by 0002
Current phase: closed; open acceptance evidence migrated to `.workflow/tasks/0002-razzia-ui-design-language-port`

## Human input required

- none

## Agent next actions

- [x] Begin Phase 1 implementation from `plan.md`
- [x] Add shared visual/background contracts and socket-owned asset route
- [x] Run Phase 1 type checks and record evidence
- [x] Probe `/config-assets/backgrounds/<file>` and negative config URLs with a running socket server
- [x] Continue with Phase 2 manager global background authoring
- [x] Continue with Phase 3 per-quiz override and editor preview — added scope-neutral `MANAGER.BACKGROUND_ASSET_UPLOAD` (no config write); quiz override flows through `QUIZZ.SAVE`/`UPDATE`; editor preview from `QUIZZ.DATA.resolvedVisuals` + unsaved upload ack `url`
- [x] Add drag/drop support to the global background upload surface
- [x] Fix implementation review request-changes findings before PR
- [x] Phase 5 documentation completed; manual acceptance evidence migrated to task 0002

## Implementation checklist

- [x] Add shared visual/background types and optional quiz/game config validation.
- [x] Add config-local background asset storage, safe path normalization, and narrow public asset serving.
- [x] Add backend resolver for `quiz override -> global default -> bundled fallback`.
- [x] Extend manager config payload and add global background upload/set/clear handling.
- [x] Add manager setup UI for global background preview, upload, and clear.
- [x] Extend quiz editor state/save path to preserve `visuals.background`.
- [x] Add scope-neutral `MANAGER.BACKGROUND_ASSET_UPLOAD` handler (stores asset, returns `{ ref, url }`, writes no config).
- [x] Add quiz-level background UI and resolved editor preview (unsaved override previews from the asset-upload ack `url`).
- [x] Resolve and snapshot visuals during game creation.
- [x] Extend game creation, reconnect, and **player join** socket payloads with `ResolvedVisuals`.
- [x] Wire manager/player party pages and `GameWrapper` to render socket-derived background with bundled fallback.
- [x] Update README with config visual refs, asset folder, and fixed-session behavior (completed in task 0002 Slice 0).
- [x] Preserve prior type/build/workflow evidence here; final browser evidence is owned by task 0002.

## Acceptance trace

| acceptance check | planned proof | evidence | status |
|---|---|---|---|
| Global default background in UI | Manual UI test | Visuals tab, upload/set/clear events, drag/drop handling, manager config payload, and live render wiring implemented; manual browser test pending | partial |
| Per-quiz override | Manual UI test | `BACKGROUND_ASSET_UPLOAD` (no config write) + override ref through `QUIZZ.SAVE`/`UPDATE`; `pnpm -r run types`, `pnpm build`, workflow verifier pass; manual set/reload pending | partial |
| Resolved background in live game | Manual game test + WS payloads | Game create resolves visuals; `GAME_CREATED`, `GAME.SUCCESS_JOIN`, and reconnect payload types carry visuals; `GameWrapper` renders store background; manual game test pending | partial |
| Quiz editor preview | Manual editor test + `QUIZZ.DATA.resolvedVisuals` | `QUIZZ.DATA` now carries `resolvedVisuals`; `QuestionEditor` renders `backgroundUrl ?? bundled`; unsaved upload previews from ack `url`; type/build pass; manual matrix pending | partial |
| Fresh player join shows background | Manual join test (no refresh) + `SUCCESS_JOIN.visuals` | `SUCCESS_JOIN` now sends `{ gameId, visuals }`; web stores visuals before navigating to player game page; manual test pending | partial |
| Fixed at game start | Config edit + reconnect payload compare | planned in `plan.md` | pending |
| Config-portable images | Config folder + restart test | planned in `plan.md` | pending |
| Config directory is not broadly exposed | Manual HTTP probe | `pnpm build`, started socket production bundle, temp `/config-assets/backgrounds/probe-route.png` returned 200 image/png; `/game.json`, `/config-assets/../game.json`, `/config-assets/quizz/`, `/config-assets/results/` returned 404 | verified |
| Type/build contracts pass | `pnpm -r run types`; `pnpm build` | `pnpm -r run types` passed; `pnpm build` passed | verified |
| Upload/set/clear success reflects persisted config | Code review + type/build checks | Upload now persists global config before ack and cleans up a just-written asset on persistence failure; set/clear now ack success/failure; `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier passed | verified |

## Review status

- 2026-06-26 — `review-implementation` verdict: **request changes**.
- Full artifact: `implementation.review.md`.
- Blocker: PR scope must either be narrowed to the completed global-background slice or the remaining full-plan work must be completed before opening as "manager visual customization".
- Major fixes before PR:
  - [x] Make `manager:backgroundUpload` robust when no acknowledgement callback is supplied.
  - [x] Add confirmation/acknowledgement for persisted global set/clear before showing success, with cleanup or explicit handling for upload-then-set failure.

## Execution log

- 2026-07-31 — Closed as **completed — superseded by 0002** per user decision D4/D7. Task 0002 now owns the visual workstream and every manual acceptance row that remained open here. README documentation was completed during task 0002 Slice 0; no acceptance evidence was discarded.

- 2026-06-26 — Started clarification; mapped current hardcoded visuals and config gaps.
- 2026-06-26 — Gate blocked; wrote open questions to `intent.md`.
- 2026-06-26 — User answered all blocking questions; intent aligned; gate → `unblocked for map-structure`.
- 2026-06-26 — Wrote `map-structure.md`; locked config JSON + config-local asset files as authored state, backend resolver as authority, and game session visuals as fixed derived snapshot.
- 2026-06-26 — Wrote `survey.md`; traced config bootstrap/read, quiz editor save/load, game create/reconnect, and background asset serving/deployment boundaries.
- 2026-06-26 15:17 — Wrote `plan.md`; sliced implementation into contracts/assets, global manager authoring, quiz override/editor preview, live game snapshot/reconnect rendering, and final verification/docs.
- 2026-06-26 — **Expanded plan review panel (initial pass)**
  - Mode: expanded (new persistence, cross-boundary UI/backend, asset serving, session snapshot, security exposure)
  - Lens artifacts were created as review workshop files and later retired by the fix loop after absorption
  - Verdict: **revise before implementation**
  - Workers: contract [13ab5598-7998-418b-84ed-3ac87769472b](13ab5598-7998-418b-84ed-3ac87769472b), architecture [1567735d-16b4-4dcc-9e30-2e93358e0ec9](1567735d-16b4-4dcc-9e30-2e93358e0ec9), evidence [952c2835-fd6d-47ca-960e-50e6bd38d50f](952c2835-fd6d-47ca-960e-50e6bd38d50f), verification [3c40ffc8-91f0-444d-ba4f-6298d1b2ff92](3c40ffc8-91f0-444d-ba4f-6298d1b2ff92)
  - Top finding: Phase 4 must deliver visuals on player `SUCCESS_JOIN` path, not reconnect-only
- 2026-06-26 — Ran `review-plan-fix-high-severity-loop`; absorbed high-severity review findings into `plan.md`: first-time player join visuals, socket-owned `/config-assets/backgrounds/<file>` route, backend-resolved editor preview, Socket.IO upload contract, `maxHttpBufferSize`, and unified acceptance checks.
- 2026-06-26 — Harmonized supporting docs: synced `intent.md` git/volume portability wording, marked survey open questions resolved, and updated `map-structure.md` blockers.
- 2026-06-26 — Absorbed and retired review workshop artifacts into `plan.md`: contract review, architecture review, evidence review, verification review, and consolidated review.
- 2026-06-26 — Implemented Phase 1 contracts/assets slice:
  - Added common visual contracts and validators plus shared game config validation.
  - Extended quiz type/schema with optional `visuals.background`.
  - Added socket visual service for config asset path validation, URL generation, resolver precedence, and narrow `/config-assets/backgrounds/<file>` serving.
  - Attached Socket.IO to a Node HTTP server with `maxHttpBufferSize` set for 5 MB decoded uploads plus base64 overhead.
  - Added Vite and nginx proxying for `/config-assets`.
  - Validation: `pnpm --filter @razzia/common run types`, `pnpm --filter @razzia/socket run types`, `pnpm --filter @razzia/web run types`, and workflow verifier all passed.
  - Gaps: live HTTP positive/negative probes, full `pnpm -r run types`, and `pnpm build` remain pending for later slices.
- 2026-06-26 — Implemented manager global background authoring and live game rendering:
  - Added manager-authenticated socket events for background upload, global set, and global clear.
  - Extended manager config payload with global authored visuals and resolved preview visuals.
  - Added Manager → Visuals tab with preview, upload, uploading state, and clear action.
  - Game creation now resolves and snapshots visuals; `GAME_CREATED`, `GAME.SUCCESS_JOIN`, manager reconnect, and player reconnect payloads include `ResolvedVisuals`.
  - Manager/player party pages store session visuals and pass `visuals.backgroundUrl` into `GameWrapper`.
  - Validation: `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier all passed.
  - Asset route probe: after `pnpm build`, `pnpm --filter @razzia/socket start` served temp `/config-assets/backgrounds/probe-route.png` as `200 image/png`; negative config probes returned `404`; no listener remained on port 3001 after cleanup.
  - Gaps: manual browser upload/reload/clear, per-quiz editor UI, quiz editor preview, reconnect/restart screenshots, and README remain pending.
- 2026-06-26 — Added drag/drop support to Manager → Visuals:
  - The preview area now accepts dropped image files, shows a drag-over state, and also opens the file picker on click/keyboard activation.
  - File picker and drag/drop share the same upload validation and socket acknowledgement path.
  - Validation: `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier all passed.
  - Gap: manual browser drag/drop gesture remains pending.
- 2026-06-26 — Reviewed implementation for PR readiness:
  - Validation during review: `pnpm -r run types`, `git diff --check`, and workflow verifier passed.
  - Verdict: request changes.
  - Findings recorded in `implementation.review.md`: full-plan scope mismatch, missing upload ack boundary guard, success toasts before persisted set/clear confirmation, minor formatting/generated-file hygiene.
- 2026-06-26 — Re-ran `review-plan-fix-high-severity-loop` (iteration 1–2): no remaining high-severity plan gaps from the retired panel review; harmonized `plan.md` with as-built event names (`MANAGER.*`), combined upload+set contract, 8 MB `maxHttpBufferSize`, and Phase 1–4 implementation status; synced `survey.md` superseded facts; review workshop artifacts already absent.
- 2026-06-26 — Fixed high-severity implementation review findings:
  - `manager:backgroundUpload` now treats the ack callback as optional at the socket boundary, returns with a manager error before writing if no callback is supplied, persists `game.json.visuals.background` before acknowledging success, and deletes the just-written asset best-effort if persistence fails.
  - `manager:globalBackgroundSet` and `manager:globalBackgroundClear` now acknowledge persisted success/failure.
  - Manager Visuals upload and clear toasts now wait for server acknowledgements.
  - Reformatted `emitConfig`; confirmed `packages/web/src/route.gen.ts` has no content diff and remains unrelated line-ending/status churn.
  - Validation: `pnpm --filter @razzia/common run types`, `pnpm --filter @razzia/socket run types`, `pnpm --filter @razzia/web run types`, `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier all passed.
  - Runtime no-ack probe attempted but not completed: root import of `socket.io-client` was unavailable, and the package-local retry hit `EADDRINUSE` on fixed port 3001. No process was killed.
- 2026-06-29 — Re-ran `review-plan-fix-high-severity-loop` (2 iterations, exit clean):
  - High-severity fix (H1): Phase 3 per-quiz override had no non-global upload path. The only upload event (`MANAGER.BACKGROUND_UPLOAD`) hard-writes `game.json` global, so reusing it for a quiz override would clobber the global default. Added a scope-neutral `MANAGER.BACKGROUND_ASSET_UPLOAD` (no config write, returns `{ ref, url }`) in plan §4; rewrote §8 Phase 3 steps to route the quiz override `ref` through `QUIZZ.SAVE`/`UPDATE` and preview unsaved overrides from the ack `url`. `storeBackgroundAsset` already returns `{ ref, url }` decoupled from persistence, so only a thin handler is needed.
  - Medium fixes: clarified `MANAGER.GLOBAL_BACKGROUND_SET` is a future-picker event unused by v1; trimmed "select"/asset-picker wording (v1 is upload + clear only); added the ack/persisted-config acceptance check to plan §3 and §12 so plan agrees with progress; added §11 edge-case row for orphaned unsaved quiz upload assets (accepted v1 debt).
  - Harmonization: no plan-review workshop artifacts remained (retired in the prior loop). `intent.md`/`survey.md`/`map-structure.md`/`implementation.md` checked — none contradict the revised plan; kept. `implementation.review.md` kept as the durable implementation-review record; its only open item (partial-slice vs full-task PR scope) remains tracked under Review status below. Consistency gate passed.
- 2026-06-29 — Implemented Phase 3 (per-quiz override + editor preview):
  - Added `MANAGER.BACKGROUND_ASSET_UPLOAD` (constants, socket types, manager handler): stores an asset and acks `{ ref, url }` without writing any config, so quiz overrides never clobber the global default.
  - `QUIZZ.GET → QUIZZ.DATA` now emits `{ quizz, resolvedVisuals }` via `resolveVisuals(quizz, getGameConfig())`.
  - `QuizzEditorProvider` tracks the authored `background` ref + preview `backgroundUrl` (new `initialBackgroundUrl` prop); `QuizzEditorHeader` includes `visuals` in save/update so overrides persist and are not dropped on edit.
  - New `QuizzBackgroundControl` (upload + clear) in the editor header; upload previews the returned `url` immediately (no false "saved" toast). `QuestionEditor` renders `backgroundUrl ?? bundled`.
  - `$quizzId.tsx` consumes the new `QUIZZ.DATA` shape and passes the resolved URL to the provider. Added `quizz:background` locale key (en/es/it).
  - Validation: `pnpm --filter @razzia/common run types`, `pnpm --filter @razzia/socket run types`, `pnpm --filter @razzia/web run types`, `pnpm -r run types`, `pnpm build`, `git diff --check`, and workflow verifier all passed.
  - Gaps: manual browser matrix (set quiz override → persists in quiz JSON, leaves `game.json` unchanged → editor/live preview) and Phase 5 README/manual evidence remain.
