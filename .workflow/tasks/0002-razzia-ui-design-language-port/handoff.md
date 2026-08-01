# Task 0002 handoff

Last Edited: 2026-07-31

## Status

Complete. The implementation, browser matrix, negative cases, accessibility retest, lint, production
build, diff check, and final static inventories all pass. A1–A11 are verified. There are no known open
implementation or verification items.

## Delivered contract

- Persisted operator choice between `dark-everywhere` and `stage-studio`.
- Studio manager/quiz surfaces switch registers; auth/play/player surfaces stay dark and players never
  receive the dialect.
- Global and per-quiz custom backgrounds remain intact, fixed at game creation.
- One semantic role spine and one Atmosphere layer owner cover the web UI.
- Space Grotesk body/display type and JetBrains Mono code/score/answer identity type.
- All 11 game states, shared primitives, manager configuration/results, and quiz authoring converted.
- Legacy primary/secondary tokens and every neutral/drop shadow retired.
- Celebration motion/timing/SFX behavior preserved per D3.

## Final evidence

- `pnpm lint`, `pnpm build`, and `git diff --check` pass.
- Static counts: 0 legacy consumers, 0 legacy token definitions, 0 neutral shadows, 0 raw role bypasses.
- All 11 gallery states passed in ja/en/de/fr, both registers, desktop and compact.
- Actual config and quiz-editor routes passed in both dialects.
- Player-join dialect pair is byte-identical with SHA-256
  `1A8F595905CFDC2C6E39E3CEAD9AB92DD105AB87246929934BA7A2E73C14EE28`.
- Shared delete and Room QR dialogs passed in both dialects; the accessible QR-dialog retest has no app logs.
- Final audit: `artifacts/slice6/audit.md`.

## State and ownership

- Source of truth: `config/game.json` → `visuals.dialect`.
- DOM owner: `packages/web/src/hooks/use-surface.ts`.
- Layer owner: `packages/web/src/components/Atmosphere.tsx`.
- Style authority: `packages/web/STYLE.md`.
- Execution authority: `plan.md`, `progress.md`, and `implementation.md` in this task directory.

The inherited task-0001 batch is intentionally present in the dirty worktree. Baseline configuration is
restored to password `razzia`, the original background, no quiz override, and `dark-everywhere`.

## Optional next step

Review and commit or publish the combined worktree. No commit or PR was created as part of this task.
