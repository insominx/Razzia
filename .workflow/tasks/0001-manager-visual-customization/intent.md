# Intent

Last Edited: 2026-06-26

## Current understanding

- Intent: Let the game host customize the game background through the manager UI instead of replacing hardcoded repo assets. Other styling (logo, colors, login shell) is deferred to a later pass.
- In scope:
  - Global default background setting (manager dashboard / game config)
  - Optional per-quiz background override when authoring or selecting a quiz
  - Apply the resolved background consistently wherever the current bundled `background.png` is used today
  - Background is fixed when a game starts; no mid-session visual edits
  - Custom images stored under server config so they travel with deployments (Docker `config` volume) and can be shared when others copy, mount, or deliberately commit the config directory
- Out of scope (v1):
  - Logo, primary accent color, login/manager shell styling (`Background.tsx`)
  - Mid-session visual updates or live sync to connected players
  - Per-question media changes (already supported separately via URL)
  - Build-time-only asset replacement as the primary workflow
- Success criteria:
  - Manager can set a global default background without editing repo source
  - Manager can optionally override background per quiz
  - When a game starts, players and the manager party view use the resolved background (quiz override if set, else global default, else bundled fallback)
  - Quiz editor preview uses the same resolved background for that quiz
  - Custom image files live in config storage and remain accessible after restart and when others use the same config directory
- Runtime surface: browser/client (manager UI, quiz editor, game UI) + service/backend (persist images, resolve theme at game start)
- Domain terms:
  - global default -> instance-wide visual setting in game config
  - per-quiz override -> optional visual setting on a quiz record
  - resolved background -> quiz override if present, otherwise global default, otherwise bundled `background.png`
  - manager setup -> `/manager/config` dashboard
  - game background surfaces -> `GameWrapper` (live game) and `QuestionEditor` (quiz editor preview)

## Acceptance checks

| check | proof method | source | status |
|---|---|---|---|
| Manager can set a global default background in the UI | Manual: set global value, verify persisted in config | user | proposed |
| Manager can set an optional per-quiz background override | Manual: set override on one quiz, leave another unset | user | proposed |
| Live game uses resolved background (override > default > bundled) | Manual: start games with/without override | user | proposed |
| Quiz editor preview uses resolved background for that quiz | Manual: open quiz editor, compare preview | user | proposed |
| Background is fixed for the session after game start | Manual: confirm no mid-game change path exists | user | proposed |
| Custom images persist in config and survive restart | Manual: restart server/container, reload settings | user | proposed |
| Others can access config-stored images via shared config directory | Manual: inspect config folder / copied or mounted config directory; git sharing requires deliberate ignore-rule change or force-add | user | proposed |

## Decisions locked

- Authority model: **global default + optional per-quiz override**; resolved at game start.
- v1 visual scope: **background image only**.
- Session behavior: **fixed when game starts**; no mid-session edits.
- Surfaces: same as today’s hardcoded background usage (`GameWrapper`, `QuestionEditor`); login shell unchanged in v1.
- Image storage: **config-local files** (not external-URL-only), so images are portable with the repo/config volume and accessible to others who pull or mount the same config.
- Fallback chain: quiz override → global default → bundled `background.png`.

## Clarifying questions

| question | decision blocked | risk if guessed | status |
|---|---|---|---|
| Global vs per-quiz vs both? | Data model and UI placement | High | **resolved** — global default + per-quiz override |
| URL vs upload / how others access images? | Storage and serving | High | **resolved** — store in config directory for portability |
| v1 visual scope? | UI/CSS scope | Medium | **resolved** — background only; more styling later |
| Which screens in v1? | Rollout list | Medium | **resolved** — same surfaces as current `background.png` |
| Session-level vs mid-session? | Game state sync | Medium | **resolved** — fixed at game start |

## Assumptions

| assumption | confidence | risk | how to verify |
|---|---|---|---|
| Config-stored images will be written via manager UI upload (not manual file drop only) | high | low | Locked in `plan.md` as manager-authenticated Socket.IO upload |
| Global default lives in `game.json` (or adjacent config file under `config/`) | medium | low | map-structure phase |
| Per-quiz override lives on the quiz record in `config/quizz/*.json` | medium | low | map-structure phase |
| Resolved background is sent to clients when the game session is created | high | low | survey game creation flow |
| Config image files may be committed to git alongside quiz JSON when teams share setups | medium | low | `plan.md` documents `/config` is ignored by default; teams must force-add or change ignore rules for git portability |

## Gate

- Alignment: aligned
- Status: unblocked for map-structure
- Needed next: Define config schema, file layout, resolution rules, and serving path for config-stored background images; then plan implementation.
