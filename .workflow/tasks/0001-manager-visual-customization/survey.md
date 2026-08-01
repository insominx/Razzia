# Survey

Last Edited: 2026-06-26
Depth mode: deep

## Top facts

Historical baseline from the pre-implementation survey. Facts marked **superseded** are now implemented; see `plan.md` §1 status and `implementation.md`.

| fact | anchor | confidence |
|---|---|---|
| Persistent app configuration is file-backed under `config`, with `game.json`, `quizz/*.json`, and `results/*.json` all mediated by the socket service config module. | `packages/socket/src/services/config.ts:18`, `packages/socket/src/services/config.ts:23`, `packages/socket/src/services/config.ts:57`, `packages/socket/src/services/config.ts:78`, `packages/socket/src/services/config.ts:95`, `packages/socket/src/services/config.ts:157`, `packages/socket/src/services/config.ts:231` | high |
| The manager config payload currently exposes only quiz metadata and result metadata, not full game config settings. | `packages/socket/src/services/manager.ts:8`, `packages/common/src/types/manager.ts:3`, `packages/web/src/pages/manager/config.tsx:18` | high |
| Quiz JSON shape is validated in common before save/update and had no visual/background field at survey time. **Superseded:** optional `visuals.background` is now in common validators/types. | `packages/common/src/validators/quizz.ts:25`, `packages/common/src/types/game/index.ts:36` | high |
| Live game and quiz editor preview both hardcode the bundled web asset `background.png`. | `packages/web/src/features/game/components/GameWrapper.tsx:3`, `packages/web/src/features/game/components/GameWrapper.tsx:66`, `packages/web/src/features/quizz/components/QuestionEditor/index.tsx:1`, `packages/web/src/features/quizz/components/QuestionEditor/index.tsx:17` | high |
| Game creation reads quiz JSON from disk, creates a `Game` instance, and emits only `gameId` plus `inviteCode`; reconnect payloads also omit visual/session metadata. | `packages/socket/src/handlers/game.ts:65`, `packages/socket/src/services/game/index.ts:46`, `packages/socket/src/services/game/index.ts:83`, `packages/socket/src/services/game/index.ts:172`, `packages/socket/src/services/game/index.ts:217` | high |
| Docker production serves only the built web root through nginx and proxies `/ws`; config files are mounted for the socket process but are not exposed as static assets. | `Dockerfile:28`, `docker/nginx.conf:4`, `docker/nginx.conf:8`, `docker/nginx.conf:11`, `docker/supervisord.conf:18`, `compose.yml:7` | high |
| No repo tests or specs were found outside `node_modules`; verification is currently type/lint/build/manual oriented. | `rg --files -g '!node_modules' | rg '(test|spec|__tests__|\\.test\\.|\\.spec\\.)'` returned no files; `package.json` scripts | high |

## Top risks

| risk | anchor | blast radius | mitigation / next proof |
|---|---|---|---|
| Adding image refs only to frontend state would create duplicate authority and break restart/reconnect behavior. | `packages/socket/src/services/config.ts:57`, `packages/socket/src/services/config.ts:78`, `packages/web/src/features/game/stores/manager.tsx:17` | manager config, quiz editor, live game, reconnect | Keep authored state in config JSON and send resolved values from backend-owned flows. |
| Config-stored images are not currently HTTP-served, so clients cannot display a config-volume file by path. | `docker/nginx.conf:4`, `docker/nginx.conf:11`, `docker/supervisord.conf:18` | all custom image rendering in Docker/prod | Add an explicit asset serving boundary and prove a config image loads after restart. |
| Socket event contracts are shared types; visual fields need coordinated common/socket/web updates or TypeScript drift will surface. | `packages/common/src/types/game/socket.ts:31`, `packages/common/src/types/game/socket.ts:93`, `packages/web/src/features/game/contexts/socket-context.tsx:15` | build/type errors and runtime event mismatch | Extend common types first and verify `pnpm -r run types` or `pnpm lint`. |
| Quiz editor local state strips unknown top-level quiz fields because provider only models `subject`, `questions`, and `quizzId`. | `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx:48`, `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx:24` | per-quiz override loss on edit/save | Add explicit editor state for quiz visuals and include it in save/update payloads. |
| Game session visual state must survive reconnect; current reconnect payloads restore status/question/player state but no game-level presentation state. | `packages/socket/src/services/game/index.ts:172`, `packages/socket/src/services/game/index.ts:217`, `packages/web/src/pages/party/$gameId.tsx:23`, `packages/web/src/pages/party/manager/$gameId.tsx:34` | players/managers rejoining a live session | Store resolved visuals on the `Game` instance and include them in creation/reconnect or status state. |

## Scope and assumptions

- Includes:
  - Global default background controlled from manager configuration.
  - Optional per-quiz background override.
  - Background resolution for quiz editor preview and live manager/player game surfaces.
  - Config-local image persistence and serving.
- Excludes:
  - Login/manager shell background component changes.
  - Logo, accent color, or broad theme model.
  - Mid-session background updates.
  - Per-question media, which is already modeled separately.
- Assumptions:
  - The task folder is `.workflow/tasks/0001-manager-visual-customization`.
  - `map-structure.md` decisions remain valid and are treated as current design input.
  - Config-local image upload is the likely UX, but exact endpoint/event details remain a planning decision.
- Domain terms / contexts:
  - manager setup: `/manager/config` and manager-authenticated socket events.
  - quiz editor: `/manager/quizz` and `/manager/quizz/$quizzId`.
  - live game: `/party/$gameId` and `/party/manager/$gameId`.
  - global default: instance-wide background setting.
  - per-quiz override: quiz-specific background setting.
  - resolved background: override, else global default, else bundled fallback.

## Repo preflight

- Preserved invariants:
  - `config/game.json` remains the source for instance-wide game settings.
  - `config/quizz/*.json` remains the source for quiz data.
  - Manager-only config and quiz mutation stays behind `manager.withAuth`.
  - Live games are created from a quiz snapshot and do not reload quiz config per frame/status.
  - The bundled `background.png` remains usable as the final fallback.
- Domain/context docs:
  - `README.md` found and read.
  - `docs/README.md`, `docs/INDEX.md`, `CONTEXT.md`, ADR folders: not found.
  - `.workflow/distillations/README.md` found but not directly relevant to this feature.
- Repo-local constraints:
  - Monorepo packages are `@razzia/common`, `@razzia/socket`, and `@razzia/web`.
  - Socket service owns config file I/O.
  - Web client communicates over Socket.IO at `/ws`.
  - Docker mounts `./config:/app/config`.
- Validation limits:
  - Existing quiz validation is Zod-based in common.
  - Game config currently has only a local TypeScript interface in socket service, not a shared validator.
  - No automated tests were found for these flows.

## Relevant docs index

| doc | tier | why it matters |
|---|---|---|
| `README.md` | must-read | Documents Docker config volume, `config/game.json`, quiz JSON, and manager play flow. |
| `.workflow/tasks/0001-manager-visual-customization/intent.md` | must-read | Defines accepted scope, fallback order, and non-goals. |
| `.workflow/tasks/0001-manager-visual-customization/map-structure.md` | must-read | Locks representation and authority decisions that this survey grounds in code. |
| `.workflow/tasks/0001-manager-visual-customization/progress.md` | must-read | Shows current workflow state and acceptance trace. |
| `.workflow/distillations/README.md` | considered/skipped | Workflow catalog only; no product architecture evidence for this feature. |

## Dependency map

- Modules/packages:
  - `packages/common`: shared constants, game/manager/socket types, quiz validators.
  - `packages/socket`: Socket.IO server, manager auth, config file I/O, game registry/session lifecycle.
  - `packages/web`: React client, manager UI, quiz editor, live game rendering, Zustand stores.
  - `docker` plus `Dockerfile`: production serving and config mount.
- Directional edges:
  - `web -> common` for types/constants/validators.
  - `socket -> common` for types/constants/validators.
  - `web -> socket` only through Socket.IO event contracts, despite `@razzia/socket` appearing as a package dependency.
  - `socket -> config filesystem` for persisted JSON/results.
  - `nginx -> web dist` for static app and `nginx -> socket /ws` for websocket proxy.
- Public surfaces:
  - Socket events under `EVENTS.MANAGER`, `EVENTS.QUIZZ`, `EVENTS.GAME`, and reconnect events.
  - Config files `config/game.json` and `config/quizz/*.json`.
  - Browser routes `/manager/config`, `/manager/quizz`, `/manager/quizz/$quizzId`, `/party/$gameId`, `/party/manager/$gameId`.

## System overview

- Components and responsibilities:
  - `services/config.ts`: initializes, reads, validates, writes, and deletes config-backed game/quiz/result data.
  - `services/manager.ts`: tracks manager login state and emits manager config payloads.
  - `handlers/quizz.ts`: manager-authenticated quiz load/save/update/delete event boundary.
  - `handlers/game.ts`: game create, join, reconnect, leave, and game action event boundary.
  - `services/game/index.ts`: in-memory game session, manager/player reconnect state, status sends.
  - `RoundManager`: quiz progress, question/status broadcasts, result persistence callback.
  - `GameWrapper`: shared live game background and chrome for player/manager game pages.
  - `QuestionEditor`: quiz editing canvas and current hardcoded preview background.
- State owners and update authority:
  - Config JSON: socket service file I/O.
  - Manager auth: `Manager` singleton keyed by client id.
  - Quiz editor working state: `QuizzEditorProvider` React state until save/update.
  - Manager/player live state: Zustand stores updated from socket events.
  - Live game session state: `Game`, `PlayerManager`, and `RoundManager`.
- Persistence/boundary points:
  - File I/O through `getPath`.
  - Socket event payloads typed in common.
  - Docker config mount and nginx routing.
  - Vite-bundled static assets in web dist.

## Config and artifacts involved

| artifact | referenced by | role |
|---|---|---|
| `config/game.json` | `getGameConfig`, README | manager password today; target home for global background ref. |
| `config/quizz/*.json` | `getQuizz`, `getQuizzById`, `saveQuizz`, `updateQuizz`, README | quiz source of truth; target home for per-quiz override. |
| `packages/web/src/assets/background.png` | `GameWrapper`, `QuestionEditor` | current hardcoded game/editor background and desired fallback. |
| `packages/common/src/validators/quizz.ts` | socket config writes, editor media validation | shared quiz schema; target for optional visual field. |
| `packages/common/src/types/game/socket.ts` | socket server and web typed socket | event payload contract for creation/reconnect/config updates. |
| `docker/nginx.conf` | production image | serves web app and proxies `/ws`; does not serve config assets today. |
| `docker/supervisord.conf` | production image | gives socket server `CONFIG_PATH=/app/config`. |
| `compose.yml` | local Docker deployment | mounts host `./config` into container config directory. |

## Load-bearing flows

### Flow 1: Config bootstrap and manager config read

- Runtime surface: service/backend, browser/client.
- Boundary types: file/database/cache, network/API, asset/config/schema.
- Hazard types: authority/state ownership, persistence/boundary I/O, version drift.
- Text flow: socket process starts, initializes config directory and default JSON files, manager authenticates, backend reads `game.json`, then emits manager config metadata.
- Entry points:
  - `packages/socket/src/index.ts:11` calls `initConfig`.
  - `packages/socket/src/handlers/manager.ts:19` handles manager auth.
  - `packages/socket/src/services/manager.ts:8` emits config.
  - `packages/web/src/pages/manager/config.tsx:18` stores config in web manager store.
- Key files/symbols:
  - `initConfig`, `getGameConfig`, `getQuizzMeta`, `getResultsMeta`, `emitConfig`, `ManagerConfig`, `useManagerStore.setConfig`.
- Control flow:
  - `initConfig` creates `config`, `game.json`, and `quizz/example.json` if missing.
  - `managerSocketHandlers` checks password from `getGameConfig`.
  - `emitConfig` sends `{ quizz, results }`, not game settings.
  - Web listens to `EVENTS.MANAGER.CONFIG` and writes the payload into Zustand.
- Data flow:
  - `game.json` is parsed into local socket `GameConfig`.
  - Quiz metadata comes from reading all valid quiz JSON files and projecting `{ id, subject }`.
  - Manager UI receives no current global background-capable field today.
- State owner/update authority:
  - Backend file service owns config reads.
  - Manager auth wrapper owns authorization for config read.
  - Web store is cache/working state only.
- Invariants/order constraints:
  - Manager password cannot be default `"PASSWORD"` for access.
  - Config folder must exist before reads.
  - Manager config event requires authenticated manager for `GET_CONFIG`.
- Edge cases/failure modes/blast radius:
  - Invalid/missing `game.json` throws and manager auth fails.
  - Invalid quiz JSON is skipped from metadata.
  - Adding global background without extending manager config means UI cannot inspect current value.
- Tests/coverage:
  - No dedicated tests found.
- Safe change locations:
  - Shared `ManagerConfig` type, socket `GameConfig` shape/validator, `emitConfig`, manager config components, and locale strings.

### Flow 2: Quiz editor load, edit, and save

- Runtime surface: browser/client, service/backend.
- Boundary types: UI/input event, network/API, asset/config/schema, file/database/cache.
- Hazard types: authority/state ownership, persistence/boundary I/O, version drift.
- Text flow: editing an existing quiz emits `quizz:get`; backend reads and validates quiz JSON; editor provider normalizes quiz into local state; save/update sends quiz payload; backend validates and writes JSON.
- Entry points:
  - `packages/web/src/pages/manager/quizz/$quizzId.tsx:21` emits `quizz:get`.
  - `packages/socket/src/handlers/quizz.ts` handles quiz events.
  - `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx:48` creates editor state.
  - `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx:24` saves/updates.
- Key files/symbols:
  - `QuizzEditorProvider`, `QuestionWithId`, `handleSave`, `getQuizzById`, `saveQuizz`, `updateQuizz`, `quizzValidator`.
- Control flow:
  - Existing quiz route loads full quiz by id.
  - Provider stores only `subject`, `questions`, `currentIndex`, and generated question ids.
  - Header emits `EVENTS.QUIZZ.UPDATE` or `EVENTS.QUIZZ.SAVE`.
  - Backend validates, writes normalized data, emits success, then refreshes config metadata.
- Data flow:
  - Quiz top-level fields beyond modeled provider fields are not preserved in current save path.
  - Question media is URL-based and separately validated by `questionMediaValidator`.
- State owner/update authority:
  - Quiz JSON is backend-owned persisted state.
  - Editor provider owns unsaved working state.
  - Backend validator decides accepted persisted schema.
- Invariants/order constraints:
  - `subject` must be non-empty.
  - `questions` must have at least one valid question.
  - Question answers/solutions/timing are constrained by `quizzValidator`.
- Edge cases/failure modes/blast radius:
  - Adding `visuals` only to backend schema without editor state will drop per-quiz background on save.
  - Imported quiz JSON with visual fields will fail or strip fields unless schema and editor save path are updated together.
  - Question-level media UI may be confused with quiz-level background if labels are unclear.
- Tests/coverage:
  - No dedicated tests found.
- Safe change locations:
  - `Quizz` type and `quizzValidator`, `QuizzEditorContextType`, `QuizzEditorProvider`, `QuizzEditorHeader`, a quiz-level config UI location outside per-question media, and `QuestionEditor` background source.

### Flow 3: Game create, start, status, and reconnect

- Runtime surface: service/backend, browser/client.
- Boundary types: network/API, async callback/job, file/database/cache.
- Hazard types: lifecycle/order, authority/state ownership, reentrancy.
- Text flow: manager selects quiz, emits `game:create`; backend reads quiz list from config files, creates `Game`, sends created ids; manager/player pages update state from status and reconnect events; `GameWrapper` renders the hardcoded background.
- Entry points:
  - `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx:35` emits `EVENTS.GAME.CREATE`.
  - `packages/socket/src/handlers/game.ts:65` handles creation.
  - `packages/socket/src/services/game/index.ts:46` constructs `Game`.
  - `packages/web/src/pages/party/$gameId.tsx:74` and `packages/web/src/pages/party/manager/$gameId.tsx:101` render `GameWrapper`.
- Key files/symbols:
  - `getQuizz`, `Game`, `RoundManager`, `broadcastStatus`, `sendStatus`, `SUCCESS_RECONNECT`, `GAME_CREATED`, `GameWrapper`.
- Control flow:
  - Creation reads current quiz config from disk and snapshots it into `RoundManagerOptions.quizz`.
  - `Game` emits `GAME_CREATED` with `gameId` and `inviteCode`.
  - Start calls `round.start`, which broadcasts statuses over time.
  - Reconnect restores status, current question, players/player, and game id.
- Data flow:
  - Current game session has no visual field.
  - Status data contains question/game-state data, not global session presentation data.
  - `GameWrapper` imports bundled background directly instead of receiving it from state/props.
- State owner/update authority:
  - Backend game registry/session owns live game existence and reconnect validity.
  - `RoundManager` owns quiz progression.
  - Web player/manager stores are socket-derived caches.
- Invariants/order constraints:
  - Games are created before players join by invite code.
  - Start requires at least one player.
  - Reconnect uses persistent browser `client_id`.
  - Session should keep fixed background after creation per task intent.
- Edge cases/failure modes/blast radius:
  - If background is resolved client-side from mutable config, reconnect or later config edits can change an active session unintentionally.
  - If only `GAME_CREATED` carries visuals, refresh/reconnect loses visuals unless reconnect also carries them or status includes them.
  - If background URL points at an unserved config file, all clients fall back to broken image.
- Tests/coverage:
  - No dedicated tests found.
- Safe change locations:
  - `gameSocketHandlers` creation branch, `Game` constructor/session fields, shared socket event payload types, manager/player stores or dedicated visual state, manager/player reconnect handlers, and `GameWrapper` props.

### Flow 4: Background asset rendering and serving boundary

- Runtime surface: browser/client, build/deploy, service/backend.
- Boundary types: asset/config/schema, build/deploy hook, network/API.
- Hazard types: persistence/boundary I/O, external integration failure, version drift.
- Text flow: web components import a bundled PNG at build time; Docker copies the built web dist into `/app/web`; nginx serves the SPA and proxies websocket traffic; socket process can read `/app/config` but nginx cannot serve it as static assets today.
- Entry points:
  - `packages/web/src/features/game/components/GameWrapper.tsx:3`.
  - `packages/web/src/features/quizz/components/QuestionEditor/index.tsx:1`.
  - `Dockerfile:28`.
  - `docker/nginx.conf:4`.
  - `docker/supervisord.conf:18`.
- Key files/symbols:
  - `background`, `GameWrapper`, `QuestionEditor`, nginx `location /`, nginx `location /ws`, `CONFIG_PATH`.
- Control flow:
  - Vite turns imported `background.png` into a built asset URL.
  - Browser loads built asset from nginx web root.
  - Socket.IO traffic goes through `/ws`; no HTTP route serves config assets.
- Data flow:
  - Bundled asset is immutable after build.
  - Config volume files are readable by socket process through `CONFIG_PATH`.
  - Browser has no direct access to `CONFIG_PATH`.
- State owner/update authority:
  - Built asset belongs to source tree/build.
  - Config assets should belong to backend storage boundary.
  - Client should render only a public URL.
- Invariants/order constraints:
  - SPA fallback should not swallow intended asset-serving routes.
  - Websocket proxy must remain intact.
  - Config assets must not expose arbitrary config JSON/results unless intentionally served.
- Edge cases/failure modes/blast radius:
  - Nginx aliasing the whole config directory would expose passwords/results.
  - Using absolute filesystem paths in JSON will fail across Docker/hosts.
  - Browser caching can make replacing same-named images appear stale unless references are content-addressed or renamed.
- Tests/coverage:
  - No dedicated tests found.
- Safe change locations:
  - Narrow static route for a background-assets subdirectory, or a socket/backend HTTP-serving addition if an HTTP server is introduced; config storage helper for normalized asset paths; frontend image components to consume resolved URLs with fallback.

## Data models / schemas / state machines

- Current `GameConfig` is socket-local and contains only `managerPassword`.
- Current `ManagerConfig` contains only `quizz: QuizzMeta[]` and `results: GameResultMeta[]`.
- Current `Quizz` is `{ subject, questions }`; each `Question` may have optional URL-based `media`.
- Current socket creation/reconnect payloads:
  - `MANAGER.GAME_CREATED`: `{ gameId, inviteCode }`.
  - `MANAGER.SUCCESS_RECONNECT`: `{ gameId, status, players, currentQuestion }`.
  - `PLAYER.SUCCESS_RECONNECT`: `{ gameId, status, player, currentQuestion }`.
- Current live status state machine is controlled by `RoundManager`, using `STATUS` broadcasts and manager/player-specific sends.
- Proposed survey-safe model from `map-structure.md`: authored visual refs live in config JSON; resolved URL is derived by backend and captured by live game session.

## Gotchas and footguns

- `ConfigSelectQuizz` receives only quiz metadata, so per-quiz visual preview cannot be built from that list without widening metadata or fetching details.
- `QuestionEditorHeader` saves `{ subject, questions }`; any added top-level quiz field needs explicit editor state.
- `QuestionEditorMedia` is question media, not quiz background; overloading it would confuse semantics and persistence.
- `Background.tsx` is intentionally out of scope for v1 per `intent.md`, even though the name sounds related.
- `getQuizz()` silently skips invalid quiz JSON; schema changes should preserve useful warnings and migration behavior.
- Direct nginx exposure of `/app/config` would leak `game.json` and results. Asset serving must be scoped.
- `packages/web/src/route.gen.ts` is already modified in the working tree and appears unrelated to this read-only survey.

## Open questions

| question | anchor | decision blocked |
|---|---|---|
| Should config images be uploaded over Socket.IO, added through a small HTTP endpoint, or manually placed in a config asset folder for v1? | `plan.md` §4/§8 | **resolved in plan** — manager-authenticated Socket.IO upload for v1 |
| What file size and MIME/extension limits should background uploads enforce? | `plan.md` §4 | **resolved in plan** — 5 MB decoded image cap; PNG/JPEG/WebP/GIF |
| Should stored refs be content-addressed filenames, normalized user filenames, or generated ids? | `plan.md` §5/§8 | **resolved in plan direction** — generated/content-addressed or otherwise unique filenames to avoid stale caches |

## Glossary

- global default: instance-wide background configured under game config.
- per-quiz override: optional background configured on one quiz.
- resolved background: backend-derived public URL using quiz override, then global default, then bundled fallback.
- authored state: persisted JSON or file data controlled by manager-authenticated backend writes.
- working state: temporary React/Zustand/session state derived from socket payloads or editor input.
- config asset: image file stored under the deployable/mounted config directory but exposed through a narrow public route.
