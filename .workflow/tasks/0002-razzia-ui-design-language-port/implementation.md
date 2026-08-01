# Implementation Record

Last Edited: 2026-07-31

## Contract as executed

Task 0002 is complete against `plan.md`. It supersedes task 0001 and preserves that task's global and
per-quiz background flow while adding a persisted, operator-owned `dark-everywhere` / `stage-studio`
dialect. Studio manager/authoring surfaces follow the selected dialect; auth, play, and player surfaces
stay dark. Dialect data never enters quiz persistence, resolved game visuals, or player payloads.

The web design language now has one semantic token spine, one surface/dialect root writer, one ambient
and photo composition owner, a measured 0.75 photo scrim, Space Grotesk and JetBrains Mono typography,
two-channel answer identity, and role-token coverage across shared components, manager/configuration,
quiz authoring, game chrome, ResultModal, and all 11 game states. Legacy primary/secondary tokens and
all neutral/drop shadows are retired. D3's celebration motion, timing, SFX, confetti, spotlight, easing,
and dynamic podium columns are preserved.

## Acceptance evidence

| check | status | evidence |
|---|---|---|
| A1 — persisted operator dialect | verified | Acknowledged manager mutation, disk state, socket restart/re-authentication, and cache-bypassing reload all agree. |
| A2 — studio changes; stage does not | verified | Actual config/editor dark+studio captures switch registers. Player-join captures are byte-identical: SHA-256 `1A8F595905CFDC2C6E39E3CEAD9AB92DD105AB87246929934BA7A2E73C14EE28`. |
| A3 — owned shells have no local shadows | verified | Shell grep is empty and the final workspace neutral-shadow inventory is zero. |
| A4 — arbitrary-photo contrast | verified | Four fixtures × four opacity levels × three text roles; 0.75 is the lowest passing value, with an 8.02:1 whole-frame minimum. User approved recognisability at G4. |
| A5 — editor/live parity | verified | Same quiz/question captured in editor and real `SHOW_QUESTION`; both use the photo Atmosphere recipe. |
| A6 — localized visuals/dialect copy | verified | All six locale variants rendered without raw keys; final 11-state passes covered ja/en/de/fr. |
| A7 — inherited task-0001 matrix | verified | Fallbacks, clear/reload, restart persistence, fresh join/reconnect, real chooser uploads, per-quiz isolation, and user-performed drag/drop pass. |
| A8 — layout/build contract | verified | Final lint, production build, and diff check pass; all compact gallery states have no horizontal overflow. |
| A9 — 11-state gallery | verified | Every state, including `PlayerFinished`, rendered from typed fixtures. |
| A10 — legacy identifiers retired | verified | Zero legacy consumer sites and zero legacy token definitions. |
| A11 — neutral shadows retired | verified | Zero neutral/drop-shadow sites and zero raw role-bypass sites; no D3 shadow exception survives. |
| Required negative cases | verified | Invalid/absent/quiz-level dialect handling, auth error flow, pre-config stage loader, and shared/Room Radix portals pass. |

## Verification record

- `pnpm lint` — pass.
- `pnpm build` — pass; web output 47.09 kB CSS (11.73 kB gzip) and 892.36 kB JS (282.59 kB gzip).
- `git diff --check` — pass.
- Static inventories — `legacy_consumer_sites=0`, `legacy_token_definitions=0`,
  `neutral_shadow_sites=0`, `raw_role_bypass_sites=0`.
- Browser — all 11 gallery states in ja/en/de/fr, both registers, desktop and 390×844 compact; no
  horizontal overflow.
- Browser — manager config, quiz editor, player join, quiz-delete dialog, and Room QR dialog audited
  in both dialects. A Radix accessibility warning found during the audit was fixed with a screen-reader
  title/description; the retest emitted no application console logs.
- CVD — answer identity remains distinguishable under protanopia, deuteranopia, and tritanopia because
  each option has a mono A/B/C/D badge independent of hue.
- Workflow verification remains intentionally non-authoritative because this repository has no configured
  scripted workflow checks; the explicit gates above are the evidence.

Detailed screenshots and the final audit are under `artifacts/slice0/` through `artifacts/slice6/`, with
the completion summary in `artifacts/slice6/audit.md`.

## Architecture and decisions

- `config/game.json` is the dialect authority; the manager store is its client mirror.
- `use-surface.ts` is the sole root `data-surface` / `data-dialect` writer.
- `<Atmosphere>` solely owns ambient and photo layer composition.
- `GameVisualsConfig` may contain a dialect; quiz `VisualsConfig` may not.
- No `src/components/ds/*` kit was created because Slice 5 found no recipe repeated at least three
  times across screens (D16).
- QR paper remains explicit black-on-white content for scanner reliability, while surrounding chrome
  follows semantic roles (D17).

## Change-control outcome

The inherited task-0001 work remains in the same dirty worktree and was preserved. The baseline runtime
configuration was restored to password `razzia`, the original global background, no quiz override, and
`dark-everywhere`. No commit or pull request was created.

## Completion

- Stop reason: implementation and completion audit passed.
- What remains: no task-0002 implementation or verification work.
- Optional next action: review and commit/publish the combined task-0001/task-0002 worktree when desired.
- User input needed: none.
