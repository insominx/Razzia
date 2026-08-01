# Task Progress: Razzia UI design-language port

Current status: completed
Current phase: Completion audit passed

Supersedes: `.workflow/tasks/0001-manager-visual-customization` (per user decision 2026-07-31).
This task inherits 0001's open Phase 5 obligations and its unverified acceptance rows.

Artifacts: [`plan.md`](plan.md) (canonical) · [`survey.md`](survey.md) · [`deep-dive.md`](deep-dive.md)

Review history: `review-plan-panel` (expanded, parallel, `cursor-grok-4.5-high-fast`) returned **revise before
implementation**; the fix loop resolved every high-severity finding and the workshop artifacts were absorbed
into `plan.md` §15 and deleted. Nothing actionable remains outside `plan.md` and this file.

## Decisions locked

**2026-07-31 (user)**

- **D1 — Selectable dialect.** Ship the ability to choose between `dark-everywhere` and `stage-studio`
  (dark play surfaces + light/slate authoring surfaces). Not a fixed scope choice — a user-facing option.
- **D2 — Custom backgrounds stay.** The task 0001 background feature (global default + per-quiz override,
  resolved at game creation) is preserved. The theme must work over an arbitrary host-uploaded image.
- **D3 — Celebration subsystem frozen for now.** Confetti, spotlight sweep, podium reveal beats, SFX, and
  the overshoot `anim-*` keyframes stay as-is. Restyle around them only where a direct design-language
  equivalent exists; otherwise leave untouched until a dedicated later pass.
- **D4 — Supersede task 0001.** This task takes over the visuals workstream, including 0001's contested
  files (`GameWrapper.tsx`, `QuestionEditor/index.tsx`, `ConfigVisuals.tsx`, `QuizzBackgroundControl.tsx`).

**2026-07-31 (planning — survey Q1/Q3/Q4/Q5 resolved)**

- **D5 — Dialect storage** (survey Q1, user accepted the recommendation): `config/game.json` under
  `visuals.dialect`, via a manager-authed acknowledged mutation mirroring `GLOBAL_BACKGROUND_SET`.
  No browser persistence.
- **D6 — Selector placement** (survey Q3): inside the existing manager Visuals tab (`ConfigVisuals.tsx`),
  reusing the `manager:visuals.*` i18n namespace 0001 already created. No new tab, no new namespace.
- **D7 — 0001 closure** (survey Q4): 0001 is formally closed as `superseded by 0002`; its open acceptance
  rows are migrated into this task's checklist and run in Slice 0.
- **D8 — i18n backfill** (survey Q5): de/fr/ja `visuals` keys are backfilled in Slice 0, before any new
  dialect keys are added, so the gap is closed rather than widened.

**2026-07-31 (Q2 resolved from the decision mockup)**

- **D9 — The dialect is operator-scoped. Confirmed.** survey-A1 holds: play surfaces are dark in *both*
  dialects and the dialect never reaches players. The operator controls it; players do not observe it and
  are not offered it. **Gate G3 is cleared.** `plan.md` §4 and §7 stand as written — no `ResolvedVisuals`
  change, no frozen-session-snapshot change, nothing on a player payload.
  - **Per-player theme preference was considered and rejected**, in the user's words: *"I would think it'd
    be nice to just let every player select what they like for themselves… I don't need that. I need to be
    the one controlling it."* Record the reasoning so it does not resurface as a fresh idea: a per-player
    theme is strictly more expensive than the operator-scoped alternative *and* than the rejected
    dialect-reaches-players option — it would put the theme on every player payload **and** add per-device
    persistence, which this codebase has none of today.
  - **Stated priority:** *"It's the content that matters, not the theme."* Treat this as a standing
    constraint on scope, not a one-off remark: prefer the slices that reduce risk (spine, scrim, gallery)
    over slices that add theme surface area. D3's celebration freeze stays frozen. If Slice 6 starts to
    balloon, cut it rather than extend it.

**Design-wall re-derivation (planning)** — R1 "pre-auth dialect flash" was going to be answered with a
localStorage mirror. Re-derived at the authority owner instead: the manager login screen is a **stage**
surface, so there is nothing to flash. Pre-auth screens are dark under both dialects by definition, not by
fallback. One explicit consequence: connection/loading states render in the stage register
(`manager/quizz/layout.tsx`). No browser persistence boundary is introduced. See `plan.md` §7.

## Human input required

- ~~**Q2 — hard gate G3.**~~ **Resolved 2026-07-31 → D9.** Gate cleared; Slice 2 is unblocked.
- ~~**A7 drag/drop execution — hard gate G2.**~~ **Resolved 2026-07-31.** The user performed the real
  drag/drop gesture in the handed-off Visuals tab. `config/game.json` changed to the randomized path
  `HD-wallpaper-picking-a-game-engine-retro-M4x1DVrZ70HdFmz4.jpg`, the matching 104,657-byte asset was
  stored at the same timestamp, and the quiz remained override-free. Baseline config was then restored.
- ~~**A7 waiver policy — hard gate G2.**~~ **Resolved without waiver.** Every inherited row passed, so
  Slice 1 began from a known-good baseline.
- ~~**G4 recognisability judgement.**~~ **Resolved 2026-07-31 → D15.** The user reviewed the four
  full-resolution 0.75 candidates and confirmed they look okay. The 8.02:1 technical floor and the
  user-owned principal-subject/dominant-colour rubric both pass.
- ~~**Local dependency restore.**~~ **Resolved 2026-07-31.** `pnpm install --frozen-lockfile` linked all
  277 locked packages; the correct checkout is serving on ports 3000/3001.

## Hard gates (from `plan.md` §8 — these stop work)

| gate | blocks | rule |
|---|---|---|
| ~~**G1**~~ | Slice 0 | **Cleared 2026-07-31.** The correct checkout's socket listener was confirmed on port 3001 before browser evidence. |
| ~~**G2**~~ | ~~Slice 1+~~ | **Cleared 2026-07-31.** Every inherited A7 row passes, including the user-performed real drag/drop gesture. |
| ~~**G3**~~ | ~~Slice 2~~ | **Cleared 2026-07-31 (D9).** Q2 confirmed: operator-scoped, players never see it. |
| ~~**G4**~~ | ~~Slices 4–6~~ | **Cleared 2026-07-31 (D15).** 0.75 passes every fixture/role and the user approved recognisability. |
| ~~**G5**~~ | Slice 6 | **Cleared 2026-07-31.** Slice 5 found zero cross-screen recipes with ≥3 uses; the source inventory exposed shared/root/join ownership and 10 remaining game states, so the ordered decomposition below replaces the stale intent list before any Slice 6 source edit. |

## Agent next actions

- [x] Deep-dive the solution space (`deep-dive.md`)
- [x] Capture user decisions D1–D4
- [x] Survey the codebase: load-bearing flows, state owners, invariants, safe change locations (`survey.md`)
- [x] Resolve survey Q1/Q3/Q4/Q5 → D5–D8
- [x] Write `plan.md`
- [x] review-plan-panel (expanded, parallel Grok 4.5 high-fast) → `revise before implementation`
- [x] Fix loop: all high-severity findings resolved in `plan.md`; disposition recorded in §15
- [x] Documentation harmonization: review artifacts absorbed and deleted
- [x] Q2 resolved via decision mockup → D9; gate G3 cleared
- [x] Slice 0, agent-side (no browser needed): de/fr/ja i18n backfill, README visuals docs, close 0001
- [x] Slice 0, live stack (G1 + A7): every inherited acceptance row passes; G2 cleared

## Implementation checklist

### Slice 0 — Takeover and known-good baseline (HITL)

- [x] **G1** — all 277 locked packages linked; correct-checkout listeners confirmed on ports 3000/3001
- [x] Run the inherited 0001 acceptance matrix against current `main`: preview, persistence, locale, fresh
      join, in-game reconnect, global chooser upload, per-quiz chooser upload, and drag/drop all pass
- [x] **G2** — cleared after the final user-performed drag/drop row passed
- [x] Backfill the `visuals` block in `locales/{de,fr,ja}/manager.json`, `visuals` in `errors.json`, and
      `background` in `quizz.json`, keyed identically to `en`
- [x] Document the visuals config in `README.md`: `config/game.json` `visuals.background`, per-quiz
      override, `config/assets/backgrounds/`, fixed-at-game-start behaviour
- [x] Mark `0001/progress.md` `completed — superseded by 0002`
- [x] `pnpm lint && pnpm build`

### Slice 1 — Token spine, STYLE.md, DEV gallery (AFK code / HITL review) — complete

- [x] Read `../1. slide-gen/Design/Canvas Design/design.md` — **note the `../`**: it is a sibling of the
      Razzia repo in the `ai-research` workspace, not inside this repo. Extract studio-dialect values from
      §3; it defines no danger/red role, so derive `#b91c1c` and record the derivation as inferred
- [x] Write `packages/web/STYLE.md`: role table (both dialects' accent/border/tint triples), the
      `accent-*` = meaning / `answer-*` = identity rule with two-channel identity, the scrim contract,
      banned patterns, the per-directory migration status table, and the **four** documented deviations —
      the `.catch()` on dialect parsing, the D3-frozen celebration cluster and the D3-vs-A11 boundary,
      "a quiz must never persist a dialect", and the gallery's temporary root-attribute ownership
- [x] Rewrite `packages/web/src/index.css`: role-named `@theme` bound to `var(--rz-*)`; `:root` dark values;
      one `:root[data-dialect="stage-studio"][data-surface="studio"]` override block; motion, depth, radius,
      scrim tokens. Keep `--color-primary`, `--color-secondary`, `.spotlight`, `.anim-*`, and all **seven**
      legacy keyframes untouched — `spotlightAnim`, `balanced`, `show`, `progressBar`, `timer`, `quizz`,
      `quizzButton`
- [x] Add `packages/web/src/hooks/use-surface.ts` — derives `stage | studio` from the matched route
      (`/manager/**` → studio), takes a dialect argument, writes both attributes to
      `document.documentElement`, cleans up on unmount
- [x] Wire `useSurface` into `pages/__root.tsx` `GameLayout`, replacing the
      `document.body.classList.add("bg-secondary")` effect; keep `bg-secondary` on the wrapper for now.
      `DEFAULT_DIALECT` does not exist until Slice 2 — pass the literal `"dark-everywhere"` with a
      `// TODO(Slice 2)` comment; do **not** create a web-local constant to be reconciled later
- [x] Add `pages/dev/gallery.tsx`, returning `<NotFound/>` unless `import.meta.env.DEV`: role swatches, type
      specimen, motion/depth samples, and **all 11 state components** — the 10 `GAME_STATE_COMPONENTS_MANAGER`
      entries **plus `PlayerFinished`**, which that map hides behind its `FINISHED` → `Podium` override —
      each with canned `StatusDataMap` payloads, plus stage/studio and dialect toggles
- [x] Gallery **single-writer rule**: its toggles write the same root attributes `useSurface` owns, so the
      gallery must take exclusive ownership while mounted (supply `useSurface`'s arguments, or an explicit
      override mode). Two writers to `document.documentElement` is the bug this line prevents
- [x] Regenerate `route.gen.ts` with the `/dev/gallery` route
- [x] `pnpm lint && pnpm build`; screenshot the gallery and three existing routes; confirm existing routes
      are unchanged versus Slice 0

### Slice 2 — Dialect persistence and selector (AFK code / HITL evidence) — complete

- [x] **G3** — cleared by D9 before implementation
- [x] `common/types/visuals.ts`: add `Dialect`, `DEFAULT_DIALECT` (`"dark-everywhere"`), and
      `GameVisualsConfig extends VisualsConfig { dialect? }`. Leave `VisualsConfig` background-only
- [x] `common/validators/visuals.ts`: add `dialectValidator` and
      `gameVisualsConfigValidator = visualsConfigValidator.extend({ dialect: dialectValidator.catch(DEFAULT_DIALECT).optional() })`.
      **Do not add `dialect` to `visualsConfigValidator`** — `validators/quizz.ts:28` consumes it, and doing
      so would make quiz JSON a legal second home for an operator-scoped setting
- [x] `common/validators/game-config.ts`: point `visuals` at `gameVisualsConfigValidator`.
      `common/types/manager.ts`: retype `ManagerConfig.game.visuals` as `GameVisualsConfig`
- [x] `common/constants.ts`: add `DIALECT_SET: "manager:dialectSet"`; type the event in the socket type map
- [x] `socket/handlers/manager.ts`: add the handler beside `GLOBAL_BACKGROUND_SET`, copying its
      validate → `updateGameConfig` → `emitConfig` → `callback?.({ok:true})` / catch → `ERROR_MESSAGE` +
      `callback?.({error})` structure. Copy the `GLOBAL_BACKGROUND_SET` shape (optional callback, no
      `typeof callback` guard), not the upload-handler shape
- [x] `ConfigVisuals.tsx`: two-option control using the existing acknowledged-mutation client pattern —
      no optimistic update, toast on error. It may keep `useConfig()` for the displayed value; it is inside
      `ConfigProvider`
- [x] Add `manager:visuals.dialect.*` and `errors:visuals.*` keys to **all six** locales
- [x] `use-surface.ts`: replace the Slice 1 literal with
      `useManagerStore((s) => s.config)?.game.visuals?.dialect ?? DEFAULT_DIALECT`. **Not `useConfig()`** —
      `ConfigProvider` is mounted only at `configurations/index.tsx:57`, so at the root it returns the empty
      default context and never carries a dialect
- [x] Set the stage register on `manager/quizz/layout.tsx`'s pre-config loader (replaces `bg-gray-50`)
- [x] `pnpm lint && pnpm build`; capture A1/A2 evidence (on-disk value, post-restart survival, stage routes
      showing no perceptible difference across both dialects)
- [x] Capture the three required negative cases: `"dialect": "neon"` in `game.json` falls back to dark with
      background + password intact; the key deleted entirely falls back to dark; a quiz JSON carrying
      `visuals.dialect` is stripped on parse and ignored

### Slice 3 — Type register (AFK) — complete

- [x] `pnpm --filter @razzia/web add @fontsource-variable/space-grotesk @fontsource-variable/jetbrains-mono`;
      remove `@fontsource-variable/rubik`
- [x] Update `main.tsx` imports; point `--font-display` at Space Grotesk; add `--font-mono` for JetBrains Mono
- [x] Apply `font-mono` at every numeral site: `GameWrapper` counter pill, the actual visible `Answers` timer (D13),
      `Leaderboard`/`Podium` scores, `PinInput`, `Room` invite code
- [x] Make the A/B/C/D badges mono, larger, accent-bordered (the second identity channel)
- [x] Measure the build output delta before/after; record it below. If the compressed delta exceeds
      ~120 KB, subset the mono weight range before proceeding
- [x] `pnpm lint && pnpm build`

### Slice 4 — Scrim contract and `<Atmosphere>` (HITL)

- [x] Commit (a): extract `components/Atmosphere.tsx` with **two recipes** reproducing today's compositions
      exactly — `ambient` (canvas → role-tinted blocks → vignette, **no host image**) for `Background.tsx`,
      `photo` (canvas → host image → scrim → vignette) for `GameWrapper.tsx` and `QuestionEditor/index.tsx`.
      `Background` has no photo layer today; do not give it one. Verify output unchanged vs Slice 3 shots
- [x] Prepare four test backgrounds (bright white-heavy photo, high-contrast pattern, dark photo, bundled
      default) and run the X1 scrim ladder: `Answers` at scrim 0 / 0.35 / 0.55 / 0.75 with the ladder
      components' `drop-shadow` removed; record contrast ratios for body, label, and answer text using the
      **worst-case sampled pixel** under each text run (not the mean) via the DevTools contrast inspector
- [x] **G4 falsifier** — if no opacity meets AA at every text size while leaving the host image recognisable
      (rubric: principal subject and dominant colour identifiable at 2 m on a projected 1080p screen, judged
      by the user), STOP and escalate. Do not select "best available" and continue
- [x] Commit (b): set `--rz-scrim` to the lowest passing opacity; add the scrim layer to the `photo` recipe;
      remove `drop-shadow` from exactly the ladder-covered sites — `AnswerButton.tsx`, `Answers.tsx`,
      `Question.tsx`, plus `QuestionEditorAnswers.tsx` as the editor's mirror of `AnswerButton`. That leaves
      27 of the 31 for Slice 6 under A11
- [x] Capture A5 evidence: the same quiz screenshotted in the editor and in a live `SHOW_QUESTION`
- [x] Amend `README.md`: the background is now composited under a guaranteed contrast floor (a contract
      amendment to 0001's stated intent)
- [x] `pnpm lint && pnpm build`

### Slice 5 — Vertical slice: `Answers` + `configurations` (HITL)

- [x] Convert `Answers.tsx` / `AnswerButton` onto role + `answer-*` tokens keeping the Okabe-Ito hues
      (`#E69F00`, `#56B4E9`, `#3DBFA0`, `#CC79A7`), each gaining a derived border and tint; screenshot
      before/after at every call site rather than reasoning about `twMerge` precedence
- [x] Verify four-way distinguishability under protanopia/deuteranopia/tritanopia simulation; the mono
      badge must carry identity independently of hue
- [x] Convert `configurations/index.tsx` and its tab components onto role tokens in the studio dialect
- [x] Inventory repeated recipes; extract `src/components/ds/*` **only** for recipes with ≥3 uses.
      If fewer than three repeat, record that a primitive kit is premature and continue class-level
- [x] Update `STYLE.md`'s migration table: both directories → `converted`
- [x] **G5 — rewrite Slice 6's ordered steps in `plan.md` and here from this slice's evidence, before any
      Slice 6 commit**
- [x] `pnpm lint && pnpm build`

### Slice 6 — Strangle the remaining surfaces (HITL, G5 rewrite 2026-07-31)

- [x] Shared/root/auth: convert `pages/__root.tsx`, `Background`, shared form/dialog/error primitives,
      and `(auth)/**`; verify auth, error, language popover, and alert dialog before flipping rows
- [x] Game chrome/join: convert `GameWrapper.tsx` and `components/join/**`; verify manager and player
      chrome remain stage-register surfaces
- [x] State cluster A: convert `Wait`, `Prepared`, `Question`, `Start`, and `PlayerFinished`; remove
      neutral/drop shadows while preserving dynamic progress/timing behavior
- [x] State cluster B: convert `Room`, `Responses`, `Result`, and `Leaderboard`; preserve layout/data
      behavior and verify the Room Radix dialog
- [x] Podium in isolation: convert medal/podium palette and all shadows, including inline `textShadow`;
      preserve D3 confetti, spotlight, 2000ms/SFX schedule, keyframes, easing, and dynamic columns
- [x] Convert `ResultModal/**`; verify every modal view in both dialects
- [x] Convert `features/quizz/**` plus `pages/manager/quizz/**`; preserve dnd-kit transform/transition
      and media behavior; verify editor controls and delete dialog in both dialects
- [x] Residual inventory, then delete `--color-primary` / `--color-secondary`; run lint/build and the
      A3/A10/A11 grep gates; flip every migration row
- [x] Paired route audit for config/editor/join/live in both dialects; 11 gallery states across
      `en`/`de`/`fr`/`ja` × desktop/compact; every Radix dialog in both dialects
- [x] Keep the task's explicit lint/build/diff and grep gates as the verification authority; no
      `verify.json` was added because the existing workflow verifier has no configured checks here

## Acceptance trace

| acceptance check | planned proof | evidence | status |
|---|---|---|---|
| A1 — dialect persists across socket restart and cache clear | manual, Slice 2 | acknowledged UI mutation wrote `game.json`; post-socket-restart re-auth and cache-bypassing hard reload both restored the selected radio/root attribute; `artifacts/slice2/selector-*.png` | verified |
| A2 — studio surfaces change with the dialect; stage surfaces never do | manual, Slices 2 + 6 | actual config/editor captures switch between dark and studio registers; player join captures are byte-identical with SHA-256 `1A8F595905CFDC2C6E39E3CEAD9AB92DD105AB87246929934BA7A2E73C14EE28` | verified |
| A3 — the three shells stay free of local shadows (non-regression) | grep gate, Slice 4 | empty `rg` over `Background.tsx`, `GameWrapper.tsx`, `QuestionEditor/index.tsx` (the *file*, not the directory) | verified |
| A4 — AA contrast over the adversarial fixture set, shadows removed | X1 ladder, Slice 4 | `artifacts/slice4/x1/contrast-table.md`; 4 images × 4 opacities × 3 roles; 0.75 minimum 8.02:1; G4 user approval; four covered shadows absent | verified |
| A5 — editor preview matches the live game | manual, Slice 4 | `artifacts/slice4/a5-editor.png` + `a5-live-show-question.png`; same quiz/question and both consume `<Atmosphere recipe="photo">` | verified |
| A6 — all six locales render translated visuals + dialect copy | grep + manual, Slices 0 + 2 | all six selector title/description pairs rendered through the UI; manager/error key parity passed; inherited de/fr/ja visuals evidence remains under Slice 0 | verified |
| A7 — inherited 0001 acceptance matrix passes | manual, Slice 0 | preview matrix, clear/reload, restart persistence, fresh join/reconnect, real global upload/reload, real per-quiz upload/save isolation, and user-performed drag/drop all pass | verified |
| A8 — no regression in the layout contract | build gate, every slice | final `pnpm lint`, `pnpm build`, and `git diff --check` clean; desktop and 390×844 gallery passes have no horizontal overflow | verified |
| A9 — all 11 state components reachable without playing a real game | manual, Slice 1 | gallery exposes and rendered all 11 fixtures, including `PlayerFinished`; `artifacts/slice1/gallery-*.png` | verified |
| A10 — legacy theme identifiers retired | grep + build, Slice 6 | zero legacy consumer sites and zero legacy token definitions; production build passes | verified |
| A11 — neutral drop shadows retired workspace-wide | grep gate, Slice 6 | zero neutral/drop-shadow sites and zero raw role-bypass sites; no D3 shadow exception survives | verified |
| Negative cases | manual, Slices 2 + 6 | invalid/absent/quiz-level dialect cases pass; loader remains stage-register; shared AlertDialog and Room QR Radix portals render in both dialects; QR dialog has accessible title/description and no app console logs | verified |

## Inherited from task 0001 (completed in Slice 0)

- [x] README docs: config visual refs, asset folder, fixed-session behavior (0001 Phase 5)
- [x] real global chooser upload persisted a new config-asset ref, rendered its URL, and survived reload
- [x] real drag/drop upload: user dropped a JPEG in the handed-off Visuals tab; the global ref and matching
      104,657-byte asset changed together at `2026-07-31 19:11:41`; evidence archived as
      `artifacts/slice0/drag-drop-created.jpg`
- [x] real per-quiz chooser upload previewed and saved a quiz-local ref while the SHA-256 of `game.json`
      stayed `B9A56BCDAF7CE231B8261658F2027FA2BF21CFFF9C38CDB5D92942ED58ED4435`
- [x] editor preview matrix: override → global → bundled fallback resolved to three distinct expected URLs
- [x] fresh join and in-game reconnect both received the frozen global background; socket restart required
      the documented manager re-auth and the global asset remained selected
- [x] Decide fate of 0001's open PR-scope question → D7: 0001 closed as superseded, rows migrated here

## Measurements

| measurement | slice | value |
|---|---|---|
| web bundle size before font swap | 3 | Slice 2 production-build baseline |
| web bundle size after font swap | 3 | +10.55 kB combined compressed delta (+8.09 kB fonts, +2.37 kB CSS gzip, +0.09 kB JS gzip) |
| chosen `--rz-scrim` opacity | 4 | 0.75 |
| repeated recipes across `Answers` + `configurations` | 5 | 0 with ≥3 cross-screen uses; no primitive kit extracted |
| `drop-shadow` sites remaining after Slice 4 (expected 27 of 31) | 4 | 27 |
| D3 shadow exceptions surviving A11, each justified in `STYLE.md` | 6 | 0; only the frozen motion/timing behavior remains |

## Execution decision ledger

- `execution-decisions.md`: D10 records the repo-owned LF checkout rule required to make the existing
  linebreak lint contract reproducible on Windows; D11 records the inferred studio accent triples; D12
  records the additive `rounded-rz-*` namespace used to preserve Slice 1's no-visible-change constraint.

## Execution log

- 2026-07-31 — Completion audit passed. Final lint, production build, diff check, legacy-token grep,
  neutral-shadow grep, and raw-role-bypass grep are clean. The full gallery rendered all 11 states in
  Japanese, English, German, and French, in both dialect registers and at desktop plus 390×844 compact
  size with no horizontal overflow. Actual config and quiz-editor routes were captured in both dialects;
  player join stayed byte-identical. Shared delete and Room QR dialogs rendered in both dialects. A
  discovered Radix accessibility warning was fixed by adding a screen-reader title and description;
  the retest produced no application console logs. Baseline config was restored to `dark-everywhere`.

- 2026-07-31 — Slice 6 completed the G5 owner clusters: shared/root/auth, game chrome and all 10
  remaining state owners, isolated Podium, ResultModal, quiz editor/routes, and residual tokens. D3's
  confetti, spotlight, 2000ms/SFX schedule, keyframes, easing, and dynamic columns remain behaviorally
  unchanged. Legacy primary/secondary tokens and every neutral/drop shadow were retired.

- 2026-07-31 — Slice 5 converted Answers and manager configurations, verified answer identity under
  protanopia/deuteranopia/tritanopia simulation, and found zero cross-screen recipes repeated at least
  three times. G5 was rewritten to the observed class-level owner clusters; no premature DS kit was added.

- 2026-07-31 — Slice 4 completed. The user approved all four full-resolution 0.75 candidates at G4.
  Set `--rz-scrim` to `rgba(6, 9, 15, 0.75)`, removed exactly the four X1-covered shadows, confirmed the
  three shells remain shadow-free, and measured 27 workspace sites remaining. Captured the same quiz's
  editor and real live `SHOW_QUESTION` views as `artifacts/slice4/a5-*.png`; both source owners consume
  `<Atmosphere recipe="photo">`. Added the README contrast-floor contract. Lint, build, and diff check pass.

- 2026-07-31 — Slice 4 checkpoint before G4. Extracted the ambient and photo layer stacks into the single
  `Atmosphere` owner while keeping scrim/vignette transparent; ambient and editor-photo browser captures
  plus `pnpm lint`/`pnpm build` pass. Ran X1 on a bright-white scene, maximum-contrast target, dark retro
  scene, and bundled classroom at 0/0.35/0.55/0.75. D14 uses whole-frame minimum WCAG ratios, a stricter
  set than the planned under-text samples. Only 0.75 passes all three roles on all four fixtures (minimum
  8.02:1). The rightmost ladder column remains pending the user-owned 2 m recognisability judgement, so
  `--rz-scrim` remains transparent and no ladder shadow site has been removed.

- 2026-07-31 — Exported the four 0.75 candidates as individual 1920×1080 review files (`075-*`) so G4 can
  be judged at the contract's projected-1080p scale instead of from the contact-sheet thumbnails.

- 2026-07-31 — Slice 3 completed. Replaced Rubik with self-hosted Space Grotesk and JetBrains Mono,
  moved the named counters/codes/scores and the actual visible Answers countdown onto `font-mono`, and
  upgraded A/B/C/D badges to larger mono identity markers with their matching answer-border tokens in
  game, response, editor, and gallery surfaces. D13 records that `Question.tsx` has no rendered numeral;
  its visible countdown owner is `Answers.tsx`. Browser computed styles confirmed Space Grotesk on the
  body and JetBrains Mono plus four distinct border colors on the Answers fixture. Bundle delta versus
  Slice 2 is +8.09 kB font assets, +2.37 kB CSS gzip, +0.09 kB JS gzip = +10.55 kB combined, well below
  the 120 kB subsetting threshold. `pnpm lint`, `pnpm build`, and `git diff --check` pass; evidence is in
  `artifacts/slice3/`.

- 2026-07-31 — Slice 2 completed. Split game visuals from quiz visuals in common, added the typed
  acknowledged `manager:dialectSet` mutation, wired `useSurface` to the live manager store, added the
  two-option Visuals selector, and rendered all new copy in six locales. Both selections persisted with
  `{ ok: true }` acknowledgements (controls re-enabled), and studio role tokens changed from dark
  `#0a0e16/#111827/#f4f8fc` to light `#ffffff/#ffffff/#0f172a`. `stage-studio` survived a real socket
  restart, re-authentication, and a cache-bypassing hard reload. Player-join captures after each operator
  choice are byte-identical. Negative evidence passed: `neon` fell back to dark while password/background
  stayed usable; an absent key defaulted dark; a quiz-level dialect was stripped on live load/save; an
  invalid socket mutation returned and emitted `errors:visuals.invalidDialect` without changing disk.
  Baseline is restored to the original background plus explicit `dark-everywhere`. `pnpm lint`,
  `pnpm build`, and `git diff --check` pass; evidence is under `artifacts/slice2/`.

- 2026-07-31 — Slice 1 completed. Added the dialect-independent role spine and both register value tables
  to `index.css`, authored `packages/web/STYLE.md`, made `useSurface` the sole root-attribute writer, and
  added the DEV gallery with typed fixtures for all 11 game-state components (including
  `PlayerFinished`). Both gallery dialects and surfaces rendered; stage computed tokens were identical
  across dialects; every state selector was exercised. `pnpm lint`, `pnpm build`, and `git diff --check`
  pass. Evidence is in `artifacts/slice1/`, including gallery dark/studio/state captures and unchanged
  manager-login, player-join, and invalid-party route captures. A8 is verified through Slice 1 and A9 is
  verified; work continues at Slice 2.

- 2026-07-31 — The user completed the final real drag/drop gesture in the handed-off Visuals tab. Disk
  evidence immediately afterward showed `config/game.json` pointing at
  `HD-wallpaper-picking-a-game-engine-retro-M4x1DVrZ70HdFmz4.jpg`, with a matching 104,657-byte asset
  written at `19:11:41`; the quiz JSON still had no `visuals` member. The generated file was moved to
  `artifacts/slice0/drag-drop-created.jpg`, the original global ref was restored, A7 is fully verified,
  and G2 is cleared. Slice 1 may start.

- 2026-07-31 — Resumed G2 after the user enabled full Chrome access. Correct-checkout listeners were
  confirmed on ports 3000/3001. A real global chooser upload succeeded, persisted
  `HD-wallpaper-picking-a-game-engine-retro-zFiARQ1hCci4X-Kk.jpg`, rendered its `/config-assets/` URL, and
  survived reload. A real per-quiz chooser upload then previewed and saved
  `Abstract-32-S0H6c0xlGgdseiv8-rvZj0zpxRo_hxfkx.jpg`; `config/game.json` retained SHA-256
  `B9A56BCDAF7CE231B8261658F2027FA2BF21CFFF9C38CDB5D92942ED58ED4435`, proving isolation. Baseline config
  was restored to the original global asset with no quiz override, and the two generated test copies were
  moved into `artifacts/slice0/` as evidence. The remaining drag/drop row cannot be automated on the
  supported browser surface because `cua.drag` carries pointer coordinates but no filesystem payload; a
  local controlled drag fixture was abandoned when browser URL policy rejected the `file://` navigation.
  G2 therefore still blocks Slice 1 pending one manual drag or a written waiver.

- 2026-07-31 — Third consecutive resumed G2 audit: confirmed the correct stack remains healthy on ports
  3000/3001 and config state remains restored, then repeated the live Japanese Visuals-tab chooser flow.
  Chrome again returned `fileChooser.setFiles: Not allowed` before the app received the JPEG. The same
  external permission condition has now repeated across three resumed goal turns, so the active goal is
  marked blocked. Resume only after enabling **Allow access to file URLs** for the ChatGPT Chrome Extension;
  then rerun global upload, drag/drop, and per-quiz upload before clearing G2 or starting Slice 1.

- 2026-07-31 — Second resumed G2 audit: reopened the live Japanese Visuals tab on the healthy
  correct-checkout stack and repeated the documented file-chooser flow against a local JPEG. Chrome again
  rejected `fileChooser.setFiles` with `Not allowed` before the app received a file. No tracked runtime
  source or config changed; Slice 1 remains stopped by G2. Required external action is unchanged: enable
  **Allow access to file URLs** for the ChatGPT Chrome Extension.

- 2026-07-31 — Resumed with full environment access. `pnpm install --frozen-lockfile` linked all 277
  packages. The initially observed ports belonged to `[REDACTED-PATH]`; those exact processes
  were stopped and the correct checkout was started, clearing G1 on port 3001. Normalized the Windows
  worktree's CRLF checkout to repository LF so the configured linebreak gate could run without semantic
  churn. Fixed inherited 0001 lint findings (constructor option objects, guarded FileReader results,
  merged type imports, and service lint conformance); `pnpm lint` and `pnpm build` now pass. Browser evidence:
  global clear/reload passed; de/fr/ja Visuals copy rendered; seeded per-quiz persistence left `game.json`
  byte-identical; editor override/global/fallback URLs passed; fresh join and isolated-origin in-game
  reconnect both received the frozen background; socket restart persistence passed. Evidence screenshots
  are under `artifacts/slice0/`. Chrome blocked both real file gestures until its local-file permission is
  enabled, so G2 still prevents Slice 1.

- 2026-07-31 — Third consecutive G1 audit: ports 3000/3001 still have no listeners and required probes
  (`dotenv-cli`, `@stylistic/eslint-plugin`, workspace `socket.io`, and Vite) are all absent. `package.json`
  and `pnpm-lock.yaml` remain unchanged. The same external dependency blocker has now repeated across the
  original implementation turn and two automatic continuations, so the active goal is marked blocked;
  resume remains `$env:CI='true'; pnpm install --frozen-lockfile` in a registry-enabled environment.

- 2026-07-31 — Continuation checkpoint: re-audited the worktree and G1. Port 3001 remains free. A normal
  `CI=true pnpm install --frozen-lockfile` recreated `node_modules` but hit the 60-second environment
  limit before linking dependencies. `CI=true pnpm install --offline --frozen-lockfile` then proved the
  local store incomplete: `eslint-10.3.0.tgz` is absent, with 277 locked packages still to link. Corrected
  the A7 ownership note: the agent can execute the browser matrix after the stack starts. No theme/runtime
  slice was started and no manifest or lockfile changed.

- 2026-07-31 — Slice 0 checkpoint: added translated inherited visuals keys to de/fr/ja and verified
  their key sets against en with `ConvertFrom-Json` + `Compare-Object`; documented global and per-quiz
  background refs, `config/assets/backgrounds/`, precedence, portability, and fixed-session behavior in
  `README.md`; closed task 0001 as `completed — superseded by 0002`. `git diff --check` passed. G1 could
  not complete: port 3001 was free, but root `pnpm dev` failed because `dotenv-cli` was missing. Offline
  dependency repair was impossible because required tarballs were absent from the local pnpm store and
  registry access is restricted; the attempted reinstall left `node_modules` incomplete. Browser matrix,
  `pnpm lint`, and `pnpm build` are blocked; Slice 1 was not started per G2. `workflow-verify` reported
  `pass` with `_none configured_`, recorded as vacuous per repo policy.

- 2026-07-31 — Deep dive: surveyed both design sources (slide dialect `STYLE.md` + `_ds` tokens; Canvas
  light/slate dialect), enumerated 21 options, evaluated all, synthesized 4 composites (S1 Stage & Studio,
  S2 Spine→Kit→Gate, S3 Scrim Contract, S4 Two Color Namespaces). Recorded a 15-item edge-case taxonomy and
  a STYLE.md-rule → Razzia-violation conflict register. Established that `_ds_bundle.js` is compiled-only
  (no JSX sources) and rejected it as an adoption path.
- 2026-07-31 — User decisions D1–D4 recorded.
- 2026-07-31 — Survey (deep): traced five load-bearing flows. Read the full task 0001 visuals pipeline in
  `common` (`types/visuals.ts`, `validators/visuals.ts`, `validators/game-config.ts`, `types/manager.ts`,
  `types/game/socket.ts`), `socket` (`services/{config,visuals,manager}.ts`, `handlers/{manager,game}.ts`,
  `services/game/{index,player-manager}.ts`), and `web` (stores, party pages, `ConfigVisuals`,
  `config-context`). Key findings: the dialect is operator-scoped and does **not** belong in
  `ResolvedVisuals` or the frozen session snapshot; the background layer stack is implemented twice
  (`GameWrapper` + `QuestionEditor`) and both must take the scrim contract; a server-persisted dialect
  cannot style pre-auth screens without a flash; there are zero tests workspace-wide; and task 0001 shipped
  its i18n keys to en/es/it only, leaving de/fr/ja rendering raw key strings on the Visuals tab today.
- 2026-07-31 — Plan written. Q1 resolved to `config/game.json` `visuals.dialect` (D5); Q3/Q4/Q5 resolved
  (D6–D8). Read `package.json` manifests, `index.html`, `main.tsx`, `__root.tsx`, `(auth)/layout.tsx`,
  `manager/config.tsx`, `manager/quizz/layout.tsx`, `Background.tsx`, and `EVENTS` to ground the deltas.
  New ground truth: `__root.tsx` sets the canvas imperatively via `document.body.classList`;
  `manager/config.tsx` already reuses the *dark* auth shell while `manager/quizz/**` is light `bg-gray-50`,
  so the stage/studio boundary already exists and is merely inconsistent. R1 dissolved by re-deriving the
  pre-auth problem at the authority owner (login is a stage surface) rather than adding a localStorage
  mirror — no browser persistence boundary is introduced. Plan is 7 vertical slices; Slices 0–4 at
  implementation resolution, 5–6 re-planned at the Slice 5 checkpoint.
- 2026-07-31 — review-plan-panel (expanded, parallel workers, `cursor-grok-4.5-high-fast`). Lenses:
  Contract `proceed after minor edits` · Architecture `proceed after minor edits` · Evidence
  `revise before implementation` · Verification `proceed after minor edits`. Consolidated verdict:
  **revise before implementation**.
- 2026-07-31 — Fix loop, iteration 1. Every panel claim was **re-verified against the repo before editing**
  rather than taken on trust; all eight high-severity findings reproduced. Nine fixes applied to `plan.md`:
  dialect boot corrected to `useManagerStore().config` (`ConfigProvider` is mounted only at
  `configurations/index.tsx:57`, so `useConfig()` at the root returns the empty default context); the quiz
  dialect leak closed by splitting `VisualsConfig` (background-only, what `validators/quizz.ts:28` consumes)
  from `GameVisualsConfig` (adds `dialect`), making a quiz-level dialect unrepresentable rather than merely
  discouraged; A10 stopped greping `text-primary`, which is unused today and is a *role* name in the new
  table — the gate was uncloseable by a correct conversion; the "three shells share one stack" claim
  corrected (the photo stack is duplicated twice; `Background` has no host image), so `<Atmosphere>` now
  carries two recipes; A3 demoted to a non-regression gate after the inventory showed all 31 shadows live on
  content and **zero** on the shells, with new A11 carrying the real proof; A9 corrected to 11 components
  (`GAME_STATE_COMPONENTS_MANAGER` has 10 and shadows `PlayerFinished` via its `FINISHED` → `Podium`
  override); A4 reworded as a fixture-sample guarantee with a named measurement method, a recognisability
  rubric, and stated residual risk; Zod `.catch` (invalid) separated from `?? DEFAULT_DIALECT` (absent);
  gates G1–G4 added so Q2, the A7 failure policy, the port-3001 preflight, and the X1 falsifier stop work
  instead of reading as notes. Medium/low: gallery single-writer rule, `../1. slide-gen/...` path, seven
  keyframes not six, client-side bundled fallback, A2 "pixel-identical" demoted, A6 gains `fr`.
  Self-caught during re-review: the A3 grep targeted the `QuestionEditor` *directory*, whose
  `QuestionEditorAnswers.tsx` carries a shadow — scoped to `index.tsx`, and that file added to Slice 4's
  removal list as the editor's mirror of `AnswerButton` (31 − 4 = 27 left for Slice 6).
- 2026-07-31 — Built an interactive decision mockup (published artifact) rendering four screens — two play,
  two authoring — in the proposed language, with the dialect and a "let it reach players" switch wired to
  the real `surface × dialect → register` rule. The user answered from it: **operator-scoped, players never
  see it** (D9), and rejected per-player preference. Gate G3 cleared; `plan.md` §4/§7 unchanged, which is
  the outcome the plan was already built for. Also recorded the standing scope constraint
  *"it's the content that matters, not the theme."*
- 2026-07-31 — Iteration 2 review: **zero high-severity issues remain**. Documentation harmonization run.
  absorbed from `plan.review.consolidated.md`: unified edits 1–12, conflict resolutions, deferred items.
  absorbed from `plan.review.evidence.md`: claim-verification matrix and seven missed repo facts.
  absorbed from `plan.review.md`: A10 blocker, A11 proposal, A2 wording, hard-gate framing.
  absorbed from `plan.review.verification.md`: A4 method gap, A9 `PlayerFinished`, negative-case list.
  absorbed from `architecture.md`: quiz-vs-game dialect authority (Option B), root-attribute writer.
  All five review artifacts deleted; disposition, including deferrals with rationale, recorded in
  `plan.md` §15.
