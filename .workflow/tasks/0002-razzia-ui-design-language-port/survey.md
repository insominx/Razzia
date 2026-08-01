# Survey

Last Edited: 2026-07-31
Depth mode: deep

Topic: port the slide-gen dark-technical design language onto the Razzia UI, with a selectable
dialect (dark-everywhere vs. stage/studio), custom backgrounds preserved, the celebration
subsystem left intact for now, and task `0001-manager-visual-customization` superseded.

Companion artifact: [`deep-dive.md`](deep-dive.md) (option space, composites, recommendations).
This survey is the read-only recon that grounds a plan; it names no implementation.

> **Status: superseded on the decided points — [`plan.md`](plan.md) is canonical.**
> This document is kept for its repo anchors (the five traced flows, the state-owner table, R1–R10 with
> file references), which the plan deliberately does not duplicate. Where the two disagree, the plan wins.
> Specifically:
> - **Q1–Q5 are all resolved** (see `progress.md` D5–D8 and the plan). The Open Questions table below is
>   historical.
> - **R1 is dissolved, not mitigated.** The localStorage mirror it floats was rejected: the manager login
>   screen is a *stage* surface, so there is nothing to flash. No browser persistence is introduced.
> - **Flow 4's "`ManagerConfig` via `ConfigProvider` → `useConfig`" is true only inside the configurations
>   tab.** That provider is mounted solely at `configurations/index.tsx:57`. The app-wide live config is
>   `useManagerStore().config`, and that — not `useConfig` — is what feeds the dialect to the root.
> - This survey's **`A1`–`A4` are assumptions**; the plan's `A1`–`A11` are acceptance checks. Unrelated
>   numbering. The plan writes **survey-A1** when it means this document's first assumption.

## Top facts

| fact | anchor | confidence |
|---|---|---|
| The dialect choice affects **authoring surfaces only** — play surfaces are dark in both modes, so players never see a studio surface | `pages/party/$gameId.tsx`, `pages/party/manager/$gameId.tsx` both render `GameWrapper`; studio surfaces are only reachable under `pages/manager/**` behind `MANAGER.AUTH` | high |
| Consequently the dialect does **not** need the `ResolvedVisuals` session-snapshot pipeline that `background` uses; it is operator-scoped, not game-scoped | `Game.visuals` (`socket/services/game/index.ts:23,52,59,72`) exists solely to freeze visuals for *players* at game creation | high |
| Task 0001 built a complete, well-shaped visuals config pipeline that a persisted dialect can extend with a small, precedented change | `common/types/visuals.ts` `VisualsConfig`; `common/validators/visuals.ts` `visualsConfigValidator`; `common/validators/game-config.ts`; `socket/services/manager.ts:emitConfig`; `MANAGER.GLOBAL_BACKGROUND_SET` acknowledged-mutation pattern in `socket/handlers/manager.ts` | high |
| A server-persisted dialect cannot style the pre-auth screens without a flash — `ManagerConfig` only arrives after `MANAGER.AUTH` succeeds | `socket/handlers/manager.ts` `AUTH` → `manager.login` → `emitConfig`; `pages/(auth)/manager/index.tsx` renders `ManagerPassword` before any config exists | high |
| The background layer stack is implemented **twice**, independently | `features/game/components/GameWrapper.tsx` (fixed full-bleed `<img>`) and `features/quizz/components/QuestionEditor/index.tsx` (same markup, separately written) | high |
| `GameWrapper` is the single chrome for both player and manager game views, switched by a `manager` boolean | `GameWrapper.tsx` props `{ statusName, backgroundUrl, onNext, onBack, manager }` | high |
| Status → screen mapping is a plain object lookup, not a router; it is the layout contract | `features/game/utils/constants.ts` `GAME_STATE_COMPONENTS`, `GAME_STATE_COMPONENTS_MANAGER`, `MANAGER_SKIP_BTN`, `MANAGER_SKIP_EVENTS` | high |
| There are **zero tests** in the entire workspace; `pnpm -r run types` and `pnpm build` are the only automated gates | no `*.test.*` / `*.spec.*` under `packages/`; `package.json` scripts are `dev/build/types/format/start/preview` | high |
| Task 0001 shipped its i18n keys to **en/es/it only**; de, fr, ja are missing every `visuals` key | `locales/{de,fr,ja}/manager.json` have no `visuals` block; same for `errors.json` `visuals` and `quizz.json` `background` | high |
| `getGameConfig()` swallows parse failures and returns `{} as GameConfig` | `socket/services/config.ts` — `catch` logs then falls through to `return {} as GameConfig` | high |
| The celebration subsystem is self-contained and can be styled around rather than through | `Podium.tsx` `usePodiumAnimation` (4 beats × 2000ms + SFX map), `react-confetti`, `.spotlight` + `anim-*` keyframes in `index.css`, `SFX` map in `constants.ts` | high |
| Radix portals render outside the app tree, so any theme scope must sit on the document root | `AlertDialog.tsx` uses `RadixAlertDialog.Portal`; `states/Room.tsx` QR modal uses `AlertDialog.Portal`; `@radix-ui/react-select`, `react-switch` in deps | high |
| Blast radius of the visual change: 73 `.tsx` files; 27 `bg-white`, 26 `bg-gray-200`, 47 `text-white`, 47 `font-bold`, 31 `drop-shadow*`, 15 `bg-primary` | grep census over `packages/web/src` | high |
| The entire current theme is 5 lines | `packages/web/src/index.css:3-7` — `--color-primary`, `--color-secondary`, `--font-display` | high |

## Top risks

| risk | anchor | blast radius | mitigation / next proof |
|---|---|---|---|
| **R1 — Pre-auth dialect flash.** Login/loading screens render before `ManagerConfig` arrives; a server-only dialect makes them flash or sit in the wrong dialect | `pages/(auth)/layout.tsx`, `pages/(auth)/manager/index.tsx`, `pages/manager/config.tsx` (`!isConnected` branch) | every manager entry | Decide dialect storage authority (see Open Questions Q1). A localStorage mirror written on config receipt removes the flash; a "login is always stage dialect" rule removes it by fiat |
| **R2 — Editor preview divergence.** The scrim/atmosphere layer must land in `GameWrapper` *and* `QuestionEditor`, or the editor stops predicting the live game | `GameWrapper.tsx`, `QuestionEditor/index.tsx` | authoring trust | Extract one shared layer-stack component consumed by both; assert by screenshotting the same quiz in editor and live game |
| **R3 — Unbounded host background.** Custom backgrounds are confirmed staying (decision 2); a bright upload breaks any low-alpha dark surface once neutral drop shadows are removed | `resolveVisuals` in `socket/services/visuals.ts`; 31 `drop-shadow*` sites | every play surface | Scrim contract (deep-dive S3). Prove with the scrim-ladder experiment before removing any shadow |
| **R4 — Silent config degradation.** A malformed `game.json` returns `{}`, so a persisted dialect (and the background) silently revert with only a console log | `socket/services/config.ts` `getGameConfig` | operator confusion | Inherited 0001 debt. Either tighten to fail-fast in a separate change or accept and document; do not let a dialect regression look like a UI bug |
| **R5 — i18n regression already in the tree.** de/fr/ja lack all `visuals` keys, so those users see raw key strings today; new dialect/theme keys would widen the gap | `locales/{de,fr,ja}/{manager,errors}.json`, `locales/{de,fr,ja}/quizz.json` | 3 of 6 locales | Inherited via decision 4. Backfill 0001's missing keys as part of taking over, before adding new ones |
| **R6 — No verification surface.** 11 game states are only reachable by playing a real game with real players; no test, no fixture, no screenshot harness | no test files anywhere; socket-driven state | whole port | Build a fixture route + screenshot matrix before restyling (deep-dive O16). Without it, "did this break?" is unanswerable |
| **R7 — Inherited unverified acceptance.** 0001's evidence table is mostly "verified by type/build"; manual browser flows (upload, drag/drop, per-quiz override, reconnect, restart persistence) were never exercised | `0001/implementation.md` "Not verified" + "Discovered risks" | background feature correctness | Decision 4 makes these this task's. Run the manual matrix once, early, to establish a known-good baseline *before* restyling those same surfaces |
| **R8 — Portal surfaces left unthemed.** Dialogs, selects, switches, and the QR modal escape any wrapper-scoped theme | `AlertDialog.tsx`, `states/Room.tsx:668-685` | visible half-themed bug | Scope the theme to `document.documentElement`, verify by opening every dialog in both dialects |
| **R9 — Upstream merge surface.** Razzia is a live fork; a 73-file restyle conflicts with every upstream UI change | `.github/workflows`, recent upstream merges in `git log` | ongoing maintenance | Concentrate value changes in `index.css`; prefer token/primitive edits to markup rewrites; accept and record the rest |
| **R10 — `twMerge` override precedence.** Components merge caller classes; moving from arbitrary values (`bg-[#E69F00]`) to named tokens silently changes which class wins at every call site | `Card.tsx`, `Button.tsx`, `AnswerButton.tsx`, `QuizzEditorCard.tsx` all use `twMerge`/`clsx` | subtle visual bugs | Convert one component's call sites at a time; screenshot before/after rather than reasoning about merge order |

## Scope and assumptions

**Includes**

- The visual token layer (color, type, spacing/radius, borders, depth, motion) across all of `packages/web/src`.
- A selectable dialect: `dark-everywhere` vs. `stage-studio` (decision 1), including where that choice is stored and who owns it.
- The relationship between the theme and host-supplied backgrounds, which are preserved (decision 2).
- Takeover of task `0001-manager-visual-customization`: its open Phase 5 (README docs + manual acceptance evidence), its unverified acceptance rows, and its i18n gap (decision 4).

**Excludes**

- Game flow, scoring, socket protocol semantics, and the `STATUS` state machine.
- New product features beyond the dialect selector.
- Removal or redesign of the celebration subsystem — confetti, spotlight, SFX, podium reveal, and the bouncy `anim-*` keyframes stay until a later dedicated pass (decision 3). Restyle *around* them where a direct design-language equivalent exists; otherwise leave alone.
- The `Foundations-Assignment` print dialect as a source language.

**Assumptions**

- A1 — "Stage/studio" means dark play surfaces + Canvas-light-slate authoring surfaces; "dark everywhere" means the slide dialect on authoring surfaces too. Play surfaces are dark in both. *If this is wrong, R1 and the entire authority analysis change.*
- A2 — The dialect is an operator/author preference, not something players ever observe. Follows from A1.
- A3 — Decision 3's "keep that thing around" covers the whole celebration cluster (confetti, spotlight, podium reveal beats, SFX, and the overshoot keyframes those screens depend on), not only confetti.
- A4 — "Supersedes" means this task owns 0001's remaining obligations, and 0001 is closed rather than run in parallel.

**Domain terms / contexts**

- **Dialect** — which token set an authoring surface uses (`dark-everywhere` | `stage-studio`). New term; not in the codebase today.
- **Stage / studio** — play surfaces vs. authoring surfaces. Maps to route groups, not to modules.
- **`VisualsConfig`** — the *authored* visual config persisted in `game.json` / quiz JSON (`common/types/visuals.ts`). Today: `{ background?: BackgroundRef }`.
- **`ResolvedVisuals`** — the *backend-derived runtime* shape sent to clients (`{ backgroundUrl?: string }`). Deliberately different from `VisualsConfig`; web never constructs config-asset URLs itself.
- **Resolved background** — precedence `quiz override → global default → bundled fallback`, computed by `resolveVisuals`.
- **Session visual snapshot** — `Game.visuals`, frozen at game creation, replayed on join/reconnect.
- **Accent triple** — matched accent/border/tint row from the slide system; the unit in which accents must be used.
- **Bounded contexts touched** — manager setup, quiz editor, live game, config storage (all four named in 0001's plan and all four in scope here).

## Repo preflight

**Preserved invariants**

- The `STATUS` → component mapping and the manager skip-event mapping are the layout contract; a visual change must not renumber, rename, or collapse states (`features/game/utils/constants.ts`).
- Web never constructs config-asset URLs; the backend resolves them and sends `ResolvedVisuals` (0001 decision, `implementation.md` deviation table).
- Session visuals are fixed at game creation and replayed on reconnect — not re-resolved from current config (`Game.visuals`, `PlayerManager.getVisuals`).
- All user-visible copy goes through `react-i18next` keys across 6 locales × 5 namespaces.
- Answer identity must stay four-way distinguishable including under color-vision deficiency (`ANSWERS_COLORS` is Okabe-Ito-derived, reinforced by A/B/C/D badges).
- The config directory is never broadly exposed; only `GET /config-assets/backgrounds/<file>` is public (`serveConfigAsset`).

**Domain/context docs**

- `docs/README.md`, `docs/INDEX.md`, `AGENTS.md`, `CLAUDE.md`, `docs/adr/` — **not found**. This repo has no docs router and no ADRs.
- `README.md` is user-facing deployment documentation; it does not yet document the visuals config (0001 Phase 5, now inherited).
- `.github/CONTRIBUTING.md` exists; `.agents/` is empty.
- The `.workflow/tasks/0001-*` artifact set is the de-facto architecture record for the visuals subsystem.

**Repo-local constraints**

- pnpm workspace, three packages (`common`, `socket`, `web`) with `@razzia/*` path aliases resolved in `vite.config.ts` and tsconfig.
- Tailwind v4 with a single `@theme` block in `src/index.css`; no `tailwind.config`, no PostCSS config, no CSS modules.
- Fonts must be self-hosted (Docker/offline deployment); `@fontsource-variable/rubik` imported in `main.tsx:1`. The slide package's CDN `@import` is unusable.
- oxlint (`.oxlintrc.json`) + prettier (`.prettierrc.json`); 0001 recorded that the prettier binary was not callable via root exec in that environment — use package scripts.
- Live upstream fork with GitHub CI; minimize gratuitous diff.

**Validation limits**

- Only `pnpm -r run types` and `pnpm build` gate correctness. There is no test suite, no lint-on-CI for visual rules, and no screenshot capability.
- `workflow-verify` reports `pass` with "no default npm scripts or verify profile" — the workflow gate is currently vacuous for this repo.
- 0001's socket runtime probes were blocked by a fixed port 3001 (`EADDRINUSE`); expect the same constraint for any live socket probe.

## Relevant docs index

| doc | tier | why it matters |
|---|---|---|
| `1. slide-gen/.../Slide Design System/STYLE.md` | must-read | The source language: non-negotiables, token tables, depth recipes, motion, polish checklist |
| `.workflow/tasks/0002-.../deep-dive.md` | must-read | Option space, four composites, sequencing, conflict register |
| `.workflow/tasks/0001-.../implementation.md` | must-read | As-built visuals pipeline, authority map, unverified acceptance rows now inherited |
| `.workflow/tasks/0001-.../plan.md` | must-read | Contract, precedence rules, non-goals for the background feature |
| `.workflow/tasks/0001-.../progress.md` | must-read | Exactly what remains open (Phase 5) |
| `1. slide-gen/Design/Canvas Design/design.md` | must-read | The light/slate dialect — the studio half of decision 1 |
| `1. slide-gen/.../Slide Design System/ARCHETYPES.md` | nice-to-have | Layout vocabulary; maps loosely to game-state screens |
| `1. slide-gen/.../Slide Design System/RUNTIME.md` | nice-to-have | Styling-route rulings; the "deck-local class systems are banned" precedent |
| `1. slide-gen/.../snippets/ds-components.html` | nice-to-have | Component prop contracts (accent names, recipes) |
| `README.md` | nice-to-have | Deployment shape; the file 0001 Phase 5 must update |
| `1. slide-gen/Design/Foundations-Assignment/design.md` | skipped | Different language (Segoe UI/indigo/rose, print geometry); explicitly out of scope |
| `_ds_bundle.js` | skipped | Compiled-only, no sources; rejected as an adoption path in the deep dive |
| `.github/CONTRIBUTING.md` | skipped | PR process only, no design or architecture content |

## Dependency map

**Modules/packages**

- `@razzia/common` — types, validators, `EVENTS` constants. No runtime deps on the others.
- `@razzia/socket` — handlers, services (config, visuals, game, manager, registry). Depends on `common`.
- `@razzia/web` — React SPA. Depends on `common` (types + events) and imports `socket` types only.

**Directional edges (visuals-relevant)**

```
common/validators/visuals ──> common/validators/game-config ──> socket/services/config
common/types/visuals ──────> common/types/manager ──────────> socket/services/manager (emitConfig)
                        └──> common/types/game/socket  ─────> web (typed socket client)
socket/services/visuals (resolveVisuals, serveConfigAsset, storeBackgroundAsset)
        ├──> socket/handlers/manager   (upload / set / clear, all manager-authed)
        ├──> socket/handlers/game      (resolve at GAME.CREATE)
        ├──> socket/handlers/quizz     (resolve for QUIZZ.DATA editor preview)
        └──> socket/index              (installs the /config-assets route)
socket/services/game/index (Game.visuals) ──> game/player-manager (join payload)
web stores (player.tsx, manager.tsx) ──> GameWrapper / QuestionEditor
```

**Public surfaces**

- Socket events: `MANAGER.{GET_CONFIG, CONFIG, BACKGROUND_UPLOAD, BACKGROUND_ASSET_UPLOAD, GLOBAL_BACKGROUND_SET, GLOBAL_BACKGROUND_CLEAR}`, `QUIZZ.{GET, DATA, SAVE, UPDATE}`, `GAME.{CREATE, SUCCESS_JOIN}`, `{PLAYER,MANAGER}.SUCCESS_RECONNECT`.
- HTTP: `GET /config-assets/backgrounds/<file>` (proxied by Vite in dev, nginx in prod).
- On-disk config: `config/game.json`, `config/quizz/*.json`, `config/assets/backgrounds/*`.

## System overview

**Components and responsibilities**

- `socket/services/config.ts` — sole authority for reading/writing `config/`. Owns `getConfigPath`, validated `getGameConfig`/`writeGameConfig`/`updateGameConfig`, quiz and result CRUD.
- `socket/services/visuals.ts` — sole authority for background asset paths, public URLs, precedence resolution (`resolveVisuals`), upload storage, and the narrow HTTP route.
- `socket/services/manager.ts` — auth gate (`withAuth`, client-id set) and `emitConfig`, the single place `ManagerConfig` is assembled.
- `socket/services/game/index.ts` — the `Game` session; freezes `visuals` at construction and hands a getter to `PlayerManager`.
- `web` stores (`player.tsx`, `manager.tsx`) — hold `visuals: ResolvedVisuals` for the session; fed by join/create/reconnect events.
- `web` shells — `Background.tsx` (auth/config), `GameWrapper.tsx` (live game), `QuestionEditor/index.tsx` (editor preview). These three are where a theme's atmosphere layer lands.

**State owners and update authority**

| state | owner | update authority | consumers |
|---|---|---|---|
| Authored global visuals | `config/game.json` | `updateGameConfig` via manager-authed handlers only | `emitConfig`, `resolveVisuals` |
| Authored per-quiz visuals | `config/quizz/<id>.json` | `QUIZZ.SAVE` / `QUIZZ.UPDATE` (quiz save path) | `resolveVisuals` |
| Resolved visuals (preview) | derived, not stored | `resolveVisuals` at `emitConfig` / `QUIZZ.GET` time | manager config UI, editor |
| Session visuals | `Game.visuals` (in-memory) | set once in the `Game` constructor; never mutated | create/join/reconnect payloads |
| Client session visuals | zustand stores | `setVisuals` from socket events | `GameWrapper` |
| Manager auth | `Manager.loggedClients` (in-memory Set, keyed by handshake `clientId`) | `login`/`logout` | every `withAuth` handler |
| **Dialect (proposed)** | **undecided — see Q1** | — | authoring surfaces only |

**Persistence/boundary points**

- File I/O: `config/game.json`, `config/quizz/*.json`, `config/results/*.json`, `config/assets/backgrounds/*` — all synchronous `fs` calls in `services/config.ts` and `services/visuals.ts`.
- Network: Socket.IO on `/ws` (8 MB `maxHttpBufferSize` for base64 uploads); one plain HTTP route for background assets.
- Browser: zustand in-memory only. **No localStorage/sessionStorage usage anywhere in the web package today** — introducing one for a dialect preference would be a new boundary type for this codebase.

## Config and artifacts involved

| artifact | referenced by | role |
|---|---|---|
| `packages/web/src/index.css` | `main.tsx` | The entire theme: `@theme` block + 6 keyframes + 5 utility classes |
| `packages/web/index.html` | Vite entry | `<body class="font-display touch-none">` — the current global font hook |
| `packages/web/src/main.tsx` | app entry | Font import, router, `Toaster` |
| `config/game.json` | `getGameConfig`/`writeGameConfig` | `{ managerPassword, visuals? }` — the extension point for a persisted dialect |
| `config/quizz/*.json` | `getQuizzById`, `saveQuizz`, `updateQuizz` | Per-quiz `visuals.background` override |
| `config/assets/backgrounds/*` | `storeBackgroundAsset`, `serveConfigAsset` | Uploaded background files |
| `packages/web/vite.config.ts` | dev server | `/ws` and `/config-assets` proxies to `:3001` |
| `docker/nginx.conf` | production | Same two proxies |
| `packages/web/src/locales/{de,en,es,fr,it,ja}/*.json` | `i18n.ts` | 5 namespaces × 6 locales; `visuals` keys present in en/es/it only |
| `.oxlintrc.json`, `.prettierrc.json` | lint/format | The only style gates; candidate home for adherence rules |
| `packages/web/src/assets/background.png` | `GameWrapper`, `QuestionEditor` | Bundled fallback background |

## Load-bearing flows

### Flow 1: Theme/dialect selection and application

- **Runtime surface**: browser/client, plus service/backend if the choice is persisted.
- **Boundary types**: UI/input event; asset/config/schema; (conditionally) network/API and file I/O.
- **Hazard types**: authority/state ownership; lifecycle/order; version drift.
- **Text flow**: operator picks a dialect → the choice is stored somewhere → a scope attribute is set on the document root → Tailwind/CSS custom properties resolve to that dialect's values → authoring surfaces repaint; play surfaces are unaffected.
- **Entry points**: a new control in `features/manager/components/configurations/` (the `ConfigVisuals` tab is the natural host — it already owns "how things look"); `main.tsx` or `__root.tsx` for applying the attribute at boot.
- **Key files/symbols**: `packages/web/src/index.css` (`@theme`); `pages/__root.tsx`; `features/manager/components/configurations/ConfigVisuals.tsx` + `index.tsx` (tab registry); if persisted — `common/types/visuals.ts` `VisualsConfig`, `common/validators/visuals.ts` `visualsConfigValidator`, `common/types/manager.ts` `ManagerConfig.game`, `socket/services/manager.ts` `emitConfig`, `socket/handlers/manager.ts` (new acknowledged mutation beside `GLOBAL_BACKGROUND_SET`), `common/constants.ts` `EVENTS.MANAGER`.
- **Control flow**: today there is none — this flow does not exist. The nearest precedent is `GLOBAL_BACKGROUND_SET`: `socket.on(event, manager.withAuth(socket, (payload, callback) => { validate → updateGameConfig → emitConfig → callback({ok:true}) }))`, with the client showing success only after acknowledgement.
- **Data flow**: `dialect` would be a small enum. Note the deliberate `VisualsConfig` (authored) vs `ResolvedVisuals` (runtime, player-facing) split — **a dialect belongs in the authored shape only.** Adding it to `ResolvedVisuals` would push an operator preference into player payloads and the frozen session snapshot, which is wrong under assumption A2.
- **State owner/update authority**: undecided (Q1). Candidates: `config/game.json` under `visuals` (matches repo precedent, survives cache clears, travels with the Docker config volume — a value 0001's intent explicitly named); or client-local storage (no backend change, no auth dependency, per-device, and a *new* boundary type for this codebase).
- **Invariants/order constraints**: the attribute must be on `document.documentElement` so Radix portals inherit (R8). If persisted server-side, the value arrives only post-`AUTH`, so a pre-auth default is mandatory (R1).
- **Edge cases/failure modes/blast radius**: pre-auth flash (R1); malformed `game.json` silently reverting the dialect (R4); an unknown/legacy dialect value needing a safe default; a second browser tab holding a stale dialect after a change. Blast radius is confined to authoring surfaces.
- **Tests/coverage**: none possible today (R6).
- **Safe change locations**: `visualsConfigValidator` (already `.optional()`-friendly and forward-compatible); `ManagerConfig.game` (additive); the `configurations` tab registry (`tabs` array in `configurations/index.tsx`) is a clean insertion point; `index.css` `@theme` is the single style authority.

### Flow 2: Resolved background — authoring → persistence → session → render

- **Runtime surface**: browser/client + service/backend + file storage.
- **Boundary types**: UI/input event; network/API (socket + HTTP); file I/O; asset/config/schema.
- **Hazard types**: authority/state ownership; persistence/boundary I/O; lifecycle/order; external integration failure.
- **Text flow**: manager uploads an image → socket handler stores it under `config/assets/backgrounds/` and (for the global default) persists the ref in `game.json` → at `GAME.CREATE` the backend resolves quiz-override → global → none and freezes it on the `Game` → the URL rides create/join/reconnect payloads into the zustand stores → `GameWrapper` renders it.
- **Entry points**: `ConfigVisuals.tsx` (global, via `BACKGROUND_UPLOAD` which stores *and* persists in one acknowledged handler); `QuizzBackgroundControl.tsx` (per-quiz, via `BACKGROUND_ASSET_UPLOAD` which stores but writes no config); `GAME.CREATE`.
- **Key files/symbols**: `socket/services/visuals.ts` — `storeBackgroundAsset`, `getBackgroundAssetUrl`, `resolveVisuals`, `serveConfigAsset`, `deleteBackgroundAsset`; `socket/handlers/manager.ts`; `socket/handlers/game.ts:66-79`; `socket/services/game/index.ts:23,48-73`; `socket/services/game/player-manager.ts:58-64`; `web` stores; `GameWrapper.tsx`; `QuestionEditor/index.tsx`.
- **Control flow**: `GAME.CREATE` → `getQuizz()` lookup → `resolveVisuals(quizz, getGameConfig())` → `new Game(io, socket, quizz, visuals)` → `registry.addGame`. `PlayerManager.join` emits `GAME.SUCCESS_JOIN { gameId, visuals }`. Reconnect paths re-emit the same frozen snapshot.
- **Data flow**: `BackgroundRef { kind: "config-asset", path }` (authored, path restricted to a single safe filename token by `backgroundAssetPathValidator`) → `ResolvedVisuals { backgroundUrl? }` (runtime). `getBackgroundAssetUrl` returns `undefined` for an invalid ref or a missing file, so a stale ref degrades to the bundled fallback rather than a broken URL.
- **State owner/update authority**: `config/` files are the durable authority; `Game.visuals` is the session authority; stores are display caches.
- **Invariants/order constraints**: resolution happens exactly once per game, at creation — reconnects must not re-resolve. Per-quiz upload must never write `game.json` (0001's H1 fix; this is why two upload events exist). Web must never build config-asset URLs.
- **Edge cases/failure modes/blast radius**: unbounded image brightness vs. a dark theme (R3); missing acknowledgement → handler returns before storing, so no orphaned file; config write failure after store → the just-written asset is deleted; cleared global while a game is live → the live game keeps its frozen snapshot (correct); the editor preview path is a *separate* resolution (`QUIZZ.DATA.resolvedVisuals`) plus an unsaved-upload ack URL, so it can legitimately differ from a future live game.
- **Tests/coverage**: none. 0001's evidence is type/build plus one manual HTTP probe of the asset route and its negative cases. The browser upload, drag/drop, per-quiz override, reconnect, and restart-persistence paths are **unverified** (R7).
- **Safe change locations**: `GameWrapper` and `QuestionEditor` render layers (visual only, no contract impact); a new shared atmosphere/layer-stack component consumed by both; `ConfigVisuals`/`QuizzBackgroundControl` markup. Do **not** touch `resolveVisuals` precedence, the `Game.visuals` freeze, or the two-upload-event split.

### Flow 3: Game status → screen rendering

- **Runtime surface**: browser/client, driven by service/backend.
- **Boundary types**: network/API (socket events); UI/input event.
- **Hazard types**: lifecycle/order.
- **Text flow**: backend emits `GAME.STATUS { name, data }` → the page checks membership in the appropriate component map → zustand `setStatus` → the page picks the component and renders it inside `GameWrapper` with the session background.
- **Entry points**: `pages/party/$gameId.tsx` (player), `pages/party/manager/$gameId.tsx` (manager).
- **Key files/symbols**: `features/game/utils/constants.ts` — `GAME_STATE_COMPONENTS` (7 player states), `GAME_STATE_COMPONENTS_MANAGER` (adds `SHOW_ROOM`, `SHOW_RESPONSES`, `SHOW_LEADERBOARD`, overrides `FINISHED` → `Podium`), `MANAGER_SKIP_BTN`, `MANAGER_SKIP_EVENTS`, `isKeyOf`; `GameWrapper.tsx`; the 11 screens under `features/game/components/states/`.
- **Control flow**: both pages guard `if (name in MAP)` before `setStatus`, then re-check with `isKeyOf` before rendering; `null` status renders nothing. `GameWrapper` separately subscribes to `GAME.UPDATE_QUESTION` and `GAME.ERROR_MESSAGE`.
- **Data flow**: `StatusDataMap[Status]` is a discriminated map in `common/types/game/status.ts`; screens receive `data` typed per status (cast via `as never` at the render site).
- **State owner/update authority**: backend `RoundManager`/`Game` own status; the client is a pure projection. `useQuestionStore` holds the `current/total` counter shown in `GameWrapper`'s HUD.
- **Invariants/order constraints**: the `MANAGER_SKIP_BTN` and `MANAGER_SKIP_EVENTS` keys must stay aligned with the status union; `MANAGER_SKIP_EVENTS` is typed `satisfies Partial<Record<keyof typeof GAME_STATE_COMPONENTS_MANAGER, string>>`, so a rename breaks the build (good).
- **Edge cases/failure modes/blast radius**: an unknown status silently renders nothing; the manager and player maps diverge deliberately (`FINISHED` → `Podium` vs `PlayerFinished`); every screen assumes it is inside `GameWrapper`'s flex column.
- **Tests/coverage**: none; states are reachable only by playing a real game with real players (R6).
- **Safe change locations**: the 11 screen components' markup and the `GameWrapper` chrome are pure presentation. The two maps, `MANAGER_SKIP_*`, and `isKeyOf` are contract — leave them alone.

### Flow 4: Manager authoring surfaces (config shell + quiz editor)

- **Runtime surface**: browser/client + service/backend.
- **Boundary types**: UI/input event; network/API; file I/O.
- **Hazard types**: authority/state ownership; lifecycle/order.
- **Text flow**: password → `MANAGER.AUTH` → `emitConfig` → `ManagerConfig` into the manager store → `Configurations` renders a 4-tab shell → the quiz tab navigates to the editor, which loads `QUIZZ.DATA { quizz, resolvedVisuals }` into `QuizzEditorProvider`.
- **Entry points**: `pages/(auth)/manager/index.tsx`, `pages/manager/config.tsx`, `pages/manager/quizz/$quizzId.tsx`, `pages/manager/quizz/index.tsx`.
- **Key files/symbols**: `features/manager/components/ManagerPassword.tsx`; `configurations/index.tsx` (the `tabs` array — `play`/`quizz`/`results`/`visuals`), `ConfigTabButton`, `ConfigSelectQuizz`, `ConfigManageQuizz`, `ConfigResults`, `ConfigVisuals`; `contexts/config-context.tsx` (`useConfig`); `ResultModal/*` (4 files); `features/quizz/contexts/quizz-editor-context.tsx`; `QuizzEditorHeader`, `QuizzEditorSidebar`, `QuizzEditorCard`, `QuestionEditor/*`, `QuizzBackgroundControl`.
- **Control flow**: `withAuth` gates every manager handler on an in-memory `Set` keyed by the handshake `clientId`; a server restart silently logs everyone out. `emitConfig` is re-emitted after every successful mutation, so the UI is server-authoritative.
- **Data flow**: `ManagerConfig { quizz: QuizzMeta[], results: GameResultMeta[], game: { visuals?, resolvedVisuals } }` via `ConfigProvider` → `useConfig`.
- **State owner/update authority**: server-side config files; the client re-renders from `emitConfig`. The quiz editor holds local draft state in `QuizzEditorProvider` until save.
- **Invariants/order constraints**: `ManagerConfig` exists only post-auth (R1). The quiz editor's unsaved background override previews from an upload ack URL and persists only on quiz save — a deliberate no-false-success rule from 0001.
- **Edge cases/failure modes/blast radius**: server restart drops auth mid-edit; the editor renders the *live game* background behind an otherwise light editing surface, so the dialect boundary literally cuts through one screen; `getGameConfig` degradation (R4) surfaces here first.
- **Tests/coverage**: none; 0001's manual browser matrix was never run (R7).
- **Safe change locations**: all of `configurations/*`, `ResultModal/*`, and `features/quizz/components/*` markup; the `tabs` array is the clean place to add a dialect control. `withAuth`, `emitConfig`'s shape, and the editor's save path are contract.

### Flow 5: Celebration subsystem (preserve — decision 3)

- **Runtime surface**: browser/client.
- **Boundary types**: frame/tick (CSS animation + `setInterval`); asset (audio files).
- **Hazard types**: lifecycle/order (audio/visual sync); reentrancy (`useSound` instances).
- **Text flow**: `FINISHED` on a manager view → `Podium` mounts → `usePodiumAnimation` steps an `apparition` counter 0→4 on a 2000 ms interval → each step fires a mapped SFX → `>=3` reveals the spotlight sweep, `>=4` fires confetti and starts the `anim-balanced` name wiggle.
- **Entry points**: `states/Podium.tsx`; also `Prepared.tsx` (`anim-quizz`), `Start.tsx` (rotating countdown square), `Result.tsx`/`Answers.tsx`/`Responses.tsx` (SFX + `anim-show`).
- **Key files/symbols**: `usePodiumAnimation`, `medalColor`, `Medal`; `ReactConfetti`; `useScreenSize`; `SFX` map in `features/game/utils/constants.ts`; `index.css` keyframes `spotlightAnim`, `show`, `timer`, `quizz`, `quizzButton`, `balanced`, `progressBar` and the `.spotlight` / `.anim-*` classes.
- **Control flow**: `usePodiumAnimation` short-circuits to `4` when fewer than 3 players; otherwise a `setInterval` advances until `>=4`, with a separate effect firing `actions[apparition]`.
- **Data flow**: `top: Player[]` from the manager status payload; `width/height` from `useScreenSize` for confetti.
- **State owner/update authority**: purely local component state; no server involvement beyond the status payload.
- **Invariants/order constraints**: the 2000 ms beat schedule is what keeps the reveal aligned with four distinct sound files. Under decision 3 this cluster is **not** to be re-timed or removed now.
- **Edge cases/failure modes/blast radius**: `<3` players skips the whole reveal; the interval and the SFX effect are separate `useEffect`s that could desync if either is touched; `Podium` is the only consumer of `.spotlight`.
- **Tests/coverage**: none.
- **Safe change locations**: under decision 3, treat this cluster as frozen. Colors reachable from tokens (`medalColor`, `bg-primary` podium blocks) may follow the palette where a direct equivalent exists; the timing, the keyframes, the SFX map, and confetti stay as-is until a dedicated pass.

## Data models / schemas / state machines

**Visual config (authored, persisted)**

```
GameConfig            = { managerPassword: string, visuals?: VisualsConfig }   // config/game.json
Quizz.visuals?        : VisualsConfig                                          // config/quizz/<id>.json
VisualsConfig         = { background?: BackgroundRef }
BackgroundRef         = { kind: "config-asset", path: string }                 // path: one safe filename token
```

`backgroundAssetPathValidator` rejects leading `/` or `\`, any `..`, any `/`, `\`, or `:`, and anything
starting with `config-assets`. `visualsConfigValidator` is an object with all-optional members, so it is
additively forward-compatible — a new optional member is a non-breaking schema change and old configs stay valid.

**Visual runtime (derived, sent to clients)**

```
ResolvedVisuals       = { backgroundUrl?: string }
ManagerConfig.game    = { visuals?: VisualsConfig, resolvedVisuals: ResolvedVisuals }
Game.visuals          : ResolvedVisuals   // frozen at construction
```

**Status machine (unchanged by this task)**

`STATUS.{ SHOW_ROOM, SHOW_START, SHOW_PREPARED, SHOW_QUESTION, SELECT_ANSWER, SHOW_RESULT, SHOW_RESPONSES, SHOW_LEADERBOARD, FINISHED, WAIT }`
→ two component maps (player / manager) → screen. `MANAGER_SKIP_BTN` maps status → i18n key for the
next-action button; `MANAGER_SKIP_EVENTS` maps status → the socket event that advances it.

**Answer identity (unchanged so far)**

`ANSWERS_COLORS = ["bg-[#E69F00]", "bg-[#56B4E9]", "bg-[#3DBFA0]", "bg-[#CC79A7]"]` (each ` text-white`),
`ANSWERS_LABELS = ["A","B","C","D"]`. Consumed by `Answers`, `Responses`, `Prepared`, and the editor's
`QuestionEditorAnswers`.

## Gotchas and footguns

- **Two upload events, deliberately.** `BACKGROUND_UPLOAD` stores *and* persists to `game.json`; `BACKGROUND_ASSET_UPLOAD` stores only. Reusing the former for a quiz override would clobber the global default — this was a review finding in 0001, not an accident.
- **`getGameConfig` returns `{} as GameConfig` on failure.** `managerPassword` becomes `undefined`, so auth compares against `undefined` and fails closed — but `visuals` also vanishes silently. A dialect stored here inherits that behavior.
- **Manager auth is an in-memory `Set` keyed by handshake `clientId`.** A socket-process restart logs every manager out with no persisted session.
- **`emitConfig` targets one socket, not a room.** A second manager tab does not see another tab's mutation until it re-requests config.
- **`AnswerButton` uses `break-all`** on answer text (`w-full flex-1 text-sm break-all`) — mid-word breaking that will look worse, not better, once typography tightens.
- **Icon component names are misspelled** (`CricleCheck`, `CricleXmark`). Renaming is a gratuitous upstream conflict; leave them.
- **`Responses.tsx` has three interacting `useEffect`s** around `playMusic`/`stopMusic` with an `isMusicPlaying` flag; it is fragile and unrelated to styling. Do not refactor while restyling.
- **`Podium` uses inline `style={{ gridTemplateColumns }}`** computed from `top.length`, and `Question` uses an inline `animation: progressBar Ns` — these escape Tailwind entirely and will not respond to token changes.
- **No localStorage anywhere in `web` today.** A client-persisted dialect introduces a new persistence boundary to a codebase that has none.
- **`twMerge` + arbitrary values.** `bg-[#E69F00]` does not merge against `bg-primary` the way two named tokens would; changing `ANSWERS_COLORS` to named tokens silently changes override precedence at every call site (R10).
- **`i18n` fallback behavior.** With de/fr/ja missing `visuals` keys, those locales currently render raw key strings on the Visuals tab. Any new key must land in all six.
- **`workflow-verify` currently passes vacuously** for this repo ("no default npm scripts or verify profile") — it is not evidence of anything.

## Open questions

| question | anchor | decision blocked |
|---|---|---|
| **Q1 — Where does the dialect live: `config/game.json` under `visuals`, or client-local storage?** Server-side matches repo precedent, survives cache clears, travels with the Docker config volume, and works across the operator's devices — but costs a socket event + validator + payload change and cannot style pre-auth screens. Client-local costs nothing on the backend and has no auth dependency, but is per-device and introduces a new persistence boundary. *Recommendation: `game.json` under `visuals.dialect`, following the `GLOBAL_BACKGROUND_SET` acknowledged-mutation pattern, with a hardcoded pre-auth default.* | `common/validators/visuals.ts`, `socket/handlers/manager.ts`, `socket/services/manager.ts` | Flow 1 shape; whether `common`/`socket` are touched at all |
| **Q2 — Is assumption A1 correct** (play surfaces dark in both modes; the dialect only changes authoring chrome)? If the user instead means the *player* experience changes too, the dialect must enter `ResolvedVisuals` and the frozen session snapshot, which is a materially larger change | `deep-dive.md` S1; `Game.visuals` | Flow 1 authority model; whether players are affected at all |
| **Q3 — Does the dialect selector belong in the existing Visuals tab or as a separate surface?** The tab already owns "how things look" and 0001 built its i18n namespace (`manager:visuals.*`) | `configurations/index.tsx` `tabs` array | UI placement, i18n key naming |
| **Q4 — Is 0001 formally closed, or does it stay open with its files reassigned?** Decision 4 says superseded; the mechanics (close 0001's progress.md, migrate its open acceptance rows here) still need a call | `0001/progress.md`, `0001/implementation.md` | Where Phase 5 evidence gets recorded |
| **Q5 — Backfill de/fr/ja `visuals` keys now or as a separate change?** They are broken today, independent of this port | `locales/{de,fr,ja}/*.json` | Scope of the takeover slice |

## Glossary

- **Dialect** — which token set an authoring surface uses: `dark-everywhere` or `stage-studio`. New concept; no code today.
- **Stage** — play surfaces (`pages/(auth)`, `pages/party/**`, `features/game/**`). Dark in every dialect.
- **Studio** — authoring surfaces (`pages/manager/**`, `features/manager/**`, `features/quizz/**`). The only surfaces the dialect changes.
- **`VisualsConfig`** — authored, persisted visual config (`game.json`, quiz JSON). All members optional.
  *(Plan update: this splits into `VisualsConfig` (quiz, background only) and `GameVisualsConfig`
  (`game.json`, adds `dialect`), so a quiz cannot express a dialect. See `plan.md` §4.)*
- **`ResolvedVisuals`** — backend-derived runtime visuals sent to clients (`{ backgroundUrl? }`). Player-facing.
- **`BackgroundRef`** — `{ kind: "config-asset", path }`; `path` is one validated filename token under `config/assets/backgrounds/`.
- **Resolved background** — precedence `quiz override → global default → bundled fallback`. Note the third
  tier is applied **client-side** in the shells (`backgroundUrl ?? background`); `resolveVisuals` itself
  returns `{}` when neither of the first two is set.
- **Session visual snapshot** — `Game.visuals`, frozen at creation, replayed on join/reconnect.
- **Accent triple** — matched accent/border/tint row; the unit in which slide-system accents must be used.
- **Semantic accent** vs. **categorical identity color** — hue chosen by meaning vs. hue chosen only to distinguish options (answers A–D).
- **Celebration subsystem** — confetti, spotlight sweep, podium reveal beats, SFX map, and the overshoot `anim-*` keyframes. Frozen under decision 3.
