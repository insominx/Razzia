Last Edited: 2026-07-31
Topic: Porting the slide-gen dark-technical design language onto the Razzia quiz UI
Inputs:
- `1. slide-gen/Slide-Style-Portable/Design/Slide Design System/STYLE.md` (canonical style bible)
- `1. slide-gen/Slide-Style-Portable/Design/Slide Design System/ARCHETYPES.md`, `RUNTIME.md`, `snippets/ds-components.html`
- `1. slide-gen/Slide-Style-Portable/Design/Slide Design System/runtime/_ds/slide-design-master-9f587eba-.../tokens/{colors,typography,fonts,spacing,effects}.css`, `_ds_bundle.js`, `_ds_manifest.json`
- `1. slide-gen/Design/Canvas Design/design.md` (light/slate dialect of the same language)
- `1. slide-gen/Design/Foundations-Assignment/design.md` (print dialect — surveyed, not a candidate)
- `4. Razzia/packages/web/src/index.css`, `main.tsx`, `index.html`, `vite.config.ts`, `package.json`
- `4. Razzia/packages/web/src/components/*`, `features/game/**`, `features/manager/**`, `features/quizz/**`
- `4. Razzia/.workflow/tasks/0001-manager-visual-customization/{intent,plan,progress}.md`

---

## Preflight

### Preserved invariants

- **Socket status contract owns layout routing.** `features/game/utils/constants.ts` maps `STATUS.*` → screen component (`GAME_STATE_COMPONENTS`, `GAME_STATE_COMPONENTS_MANAGER`) and `MANAGER_SKIP_BTN` maps status → footer action key. A retheme must not renumber, rename, or collapse states.
- **All user-visible copy is i18n keys.** 6 locales × 5 namespaces under `src/locales/{de,en,es,fr,it,ja}/`. No new literal strings; new UI chrome (kickers, labels) needs keys in all six or it must be non-textual.
- **Answer identity must survive color-vision deficiency.** `ANSWERS_COLORS` (`#E69F00 #56B4E9 #3DBFA0 #CC79A7`) is an Okabe-Ito-derived categorical palette, reinforced by `ANSWERS_LABELS` A/B/C/D badges in `AnswerButton.tsx`. Whatever replaces it must stay four-way distinguishable.
- **Host-supplied backgrounds are a shipped feature.** Task 0001 landed `visuals.background` (global default + per-quiz override), resolved at game creation and carried in create/join/reconnect payloads, served from `/config-assets/backgrounds/<file>`. `GameWrapper.tsx` and `QuestionEditor/index.tsx` render `backgroundUrl ?? background`. Any new atmosphere layer sits *around* an arbitrary user image, not instead of it.
- **Dual viewport register.** Player surfaces are phone-first (`touch-none` on `<body>`, `min-h-dvh`, `md:`/`lg:` step-ups); manager surfaces are projector-first (`max-w-7xl`, 5xl type). One theme has to serve both.

### Repo-local constraints

- **No AGENTS.md / CLAUDE.md in Razzia.** The g-skills `.workflow` convention is the only process contract; task 0001 is the precedent for artifact shape.
- **Tailwind v4, single global stylesheet.** `src/index.css` is `@import "tailwindcss"` + one `@theme` block (`--color-primary: #ff9900`, `--color-secondary: #1a140b`, `--font-display: "Rubik Variable"`) + hand-written keyframes. No CSS modules, no PostCSS config, no `tailwind.config`.
- **Self-hosted / offline deployment.** Docker image serves static `web` + nginx `/ws` proxy; fonts arrive via `@fontsource-variable/rubik` imported in `main.tsx:1`. The slide package's `tokens/fonts.css` uses a Google Fonts CDN `@import` — unusable as-is.
- **Lint/format gates.** `.oxlintrc.json` + `.prettierrc.json`; `pnpm -F @razzia/web types|format` are the existing checks. There is no test suite for the web package and no visual regression harness.
- **Upstream fork.** Razzia is an open-source project with GitHub CI (`.github/workflows`) and an active upstream history (`e2a2d1f`, PR merges). A total restyle maximizes future merge conflict surface.

---

# Phase A — Understand

## A0) Situation summary

What is happening

- Razzia's UI is styled as a consumer party-game: saturated orange (`--color-primary: #ff9900`) on white rounded cards, `font-bold`/`font-extrabold` Rubik everywhere, gold/silver/bronze medals with cartoon shine streaks (`Podium.tsx:193-231`), confetti, spotlight sweep, and bouncy scale-overshoot keyframes.
- The slide-gen language is the opposite register: near-black navy canvas, Space Grotesk + JetBrains Mono only, six *semantically assigned* accent hues used as accent/border/tint triples, depth from accent-tinted inset glow rather than neutral drop shadow, calm 0.5s `cubic-bezier(0.16,1,0.3,1)` motion.
- The two systems disagree on specific, enumerable points — not just "vibe". At least four STYLE.md non-negotiables are actively violated by current Razzia code (neutral drop shadows ×31, three-plus font weights of a single face, decorative rather than semantic accents, bounce easing).
- The style bible is written for a **fixed 1920×1080 absolute-px slide canvas**. Razzia is a responsive React SPA with a phone-first player view. The color/depth/motion/voice layers transfer cleanly; the type scale, padding registers, and slide-chrome (kicker→H2→rule, footer band, `NN / TOTAL` counter) transfer only by analogy.
- A second, already-proven dialect of the same language exists: `Design/Canvas Design/design.md` — light slate surfaces, same two fonts, same semantic hue *roles* remapped to light-mode hexes. This is the precedent that the language is portable off the dark slide stage.
- An in-flight feature (task 0001, Phase 5 open) makes the game background a **host-uploaded arbitrary image**. The dark language assumes a controlled canvas.

What we know vs. what we don't

- Known: exact token values, exact depth/glow recipes, exact motion keyframes, and a written adherence checklist exist on the slide-gen side (`STYLE.md` §12).
- Known: the `_ds` component layer ships only as a **compiled global IIFE** (`_ds_bundle.js`, `window.SlideDesignMaster_9f587e`, `React.createElement` + inline styles). `_ds_manifest.json` lists 21 components; **no `.jsx` sources exist anywhere in `1. slide-gen`**.
- Known: blast radius is 73 `.tsx` files; 27 `bg-white`, 47 `text-white`, 47 `font-bold`, 31 `drop-shadow*`, 26 `bg-gray-200`, 15 `bg-primary` occurrences.
- **Unknown:** whether the user wants the *dark slide dialect everywhere*, or dark for play surfaces and the Canvas light/slate dialect for authoring surfaces. The phrase "the design language I have inside 1. slide-gen" covers both.
- **Unknown:** whether host-uploaded backgrounds survive the retheme, get constrained (scrim/darkening contract), or get deprecated in favor of a generated atmosphere layer.
- **Unknown:** whether upstream-merge friction is a real cost here or the fork is already divergent enough not to care.
- **Unknown:** whether the SFX/confetti/spotlight *game-show energy* is wanted-but-restyled or wanted-gone. "Less elementary-school" is a floor, not a direction.
- **Unknown:** target of the `Design/Slide Design Master/index.html` taxonomy app — whether an equivalent in-app reference surface is desired.

## A1) Problem definition + scope boundaries

In scope

- Visual token layer: color, typography, spacing/radius, borders, depth, motion.
- Every rendered surface in `packages/web/src`: player join → game states → manager config → quiz editor → dialogs/toasts/error pages.
- The relationship between the theme and the host-supplied background image (task 0001 output).
- Whatever adherence/verification machinery is needed to keep the port from drifting back.

Out of scope

- Socket protocol, scoring, game flow, state machine semantics.
- New features (new game modes, new manager capabilities).
- Backend/`packages/socket` changes, except any that the background/scrim contract forces.
- The `Foundations-Assignment` print dialect (Segoe UI / indigo / rose, US-Letter geometry) — surveyed and rejected as a source; it is a different language that happens to live in the same repo.
- Sound design, unless motion/sound pairing is explicitly reopened.

Glossary

- **Slide dialect** — the dark-technical register in `STYLE.md` (`#0a0e16` canvas, teal/green/blue/orange/purple/red accents).
- **Canvas dialect** — the light/slate register in `Design/Canvas Design/design.md`; same two fonts, same six accent *roles*, light-mode hexes.
- **Accent triple** — the matched `accent` / `border` / `tint(bg)` row that STYLE.md §3.1 requires be used together.
- **Semantic accent** — hue chosen by meaning (server = blue, error = red). **Categorical identity color** — hue chosen only to tell A from B (Razzia answer buttons). The two are different jobs; the slide system only has the first.
- **Play surfaces** — everything under `features/game/**` plus `pages/(auth)`, `pages/party/**`.
- **Authoring surfaces** — `features/manager/**`, `features/quizz/**`, `pages/manager/**`.
- **Resolved background** — task 0001's precedence chain (quiz override → global default → bundled `background.png`).

Observable symptoms of the current state

- Orange-on-white cards (`Card.tsx`: `rounded-xl bg-white p-4 shadow-sm`) read as a children's app on a projector.
- Neutral text drop shadows everywhere (`drop-shadow-lg` on every `<h2>`) — a legibility crutch for text over a photographic background, and STYLE.md's stated #1 tell of off-system output.
- Motion overshoot: `@keyframes show` scales 0→0.9→0.8→1; `anim-quizz` does a 3D perspective rotate; `anim-balanced` wiggles ±10°; `motion` springs run `stiffness: 400–1000` (`Leaderboard.tsx:362,386`).
- Weight monotony: 47 `font-bold` + 27 `font-semibold` + 3 `font-extrabold` with zero mono usage — no typographic hierarchy beyond size and weight.
- `Podium.tsx` medals: `bg-yellow-500 border-yellow-600` + two white `/25` diagonal shine bars + `textShadow: 2px 2px rgba(0,0,0,0.25)`.
- Authoring surfaces are a *third* register: light gray Tailwind defaults (`bg-gray-100`, `border-gray-200`, `text-gray-600`) that match neither the play surfaces nor either slide-gen dialect.

## A2) Current state (ground truth)

Token layer

- `src/index.css:3-7` — the entire theme: two colors and one font family. Everything else is raw Tailwind utility classes.
- `index.html:8` — `<body class="font-display touch-none">`; `main.tsx:1` — `import "@fontsource-variable/rubik/wght.css"`.
- `src/index.css:14-170` — six hand-written keyframes (`spotlightAnim`, `show`, `timer`, `quizz`, `quizzButton`, `balanced`, `progressBar`) and five utility classes wrapping them.

Shared components (`src/components/`)

- `Card.tsx` — white, `rounded-xl`, `shadow-sm`, `max-w-80`. Used by join screens (`join/Room.tsx`, `join/Username.tsx`), manager config shell (`configurations/index.tsx`), password.
- `Button.tsx` — `bg-primary rounded-lg font-semibold text-white` + brightness hover; three sizes.
- `Input.tsx` / `PinInput.tsx` — white fields, `outline-gray-300`, `focus:outline-primary` / `focus:border-primary`.
- `Background.tsx` — the auth shell: two `bg-primary/15` rotated `rounded-4xl` blocks at 120vmin/75vmin, centered logo, GitHub footer link.
- `AlertDialog.tsx`, `Toaster.tsx`, `LanguageSwitcher.tsx`, `Loader.tsx` (13px-stroke rounded spinner in `#fff4e4`), `ErrorPage.tsx`, `NotFound.tsx`, `QuestionMedia.tsx`, `GithubIcon.tsx`.

Play surfaces (`features/game/`)

- `GameWrapper.tsx` — the chrome: fixed full-bleed `<img>` background (`backgroundUrl ?? background`), a white pill `NN / TOTAL` counter top-left, white manager next/exit buttons top-right, and a white player HUD bar bottom (`username` + points chip).
- `AnswerButton.tsx` — `rounded-2xl px-4 py-6`, `bg-black/20` label badge, `drop-shadow-md` text, `Check`/`X` lucide icon at `stroke-6`.
- 11 state screens under `components/states/`: `Answers`, `Question`, `Responses`, `Result`, `Leaderboard`, `Podium`, `Room`, `Start`, `Prepared`, `Wait`, `PlayerFinished`. Every one centers a `text-3xl…text-5xl font-bold text-white drop-shadow-lg` `<h2>`.
- Semantic-color usage today: `bg-black/40` for every HUD chip; `bg-primary` for leaderboard rows, podium blocks, player chips, the `Start` rotating square, and the `Question` progress bar; `bg-amber-700` for the streak badge; `bg-green-400` for the editor's correct-answer dot.
- Custom icons: `icons/CricleCheck.tsx`, `CricleXmark.tsx`, `Fire.tsx` (note the misspelling — they are project-local SVGs, not lucide).

Authoring surfaces

- `features/manager/components/configurations/index.tsx` — a `max-w-md` white `Card` with a gray-100 tab strip (`ConfigTabButton`: active = `bg-primary text-white`), four tabs (`play`, `quizz`, `results`, `visuals`).
- `features/manager/components/ResultModal/*` — four-file modal (header/stats/table/answers).
- `features/quizz/components/*` — full editor: white `h-14` header bar (`QuizzEditorHeader`), sortable sidebar (`QuizzEditorSidebar` + `@dnd-kit`), `QuizzEditorCard` slide thumbnails (`h-36 border-2 border-gray-200 bg-white`, `border-primary` when active), `QuestionEditor/*` with a config rail.
- `QuestionEditor/index.tsx` renders the resolved background behind the editing surface — the editor is a live preview of the play theme, so a retheme must move both together.

Verification surface today

- None. No `.spec`/`.test` files in `packages/web`, no screenshot harness, no storybook. `pnpm -F @razzia/web types` and `format` are the only automated gates.

## A3) Edge-case taxonomy

- **EC1 — Uploaded background collision.** Host uploads a bright, busy, or white photo. Dark-language surfaces (hairline accent borders, tinted fills at 0.06–0.16 alpha) become invisible; the current fix (neutral `drop-shadow-lg` on all text) is exactly what non-negotiable #4 bans. Structural, semantic, and unavoidable — it is the one place where the two systems are in direct contradiction.
- **EC2 — Semantic vs. categorical color.** STYLE.md §1.6: "Accents are semantic, not decorative." Answer A/B/C/D are decorative-by-necessity. Mapping A→teal, B→blue, C→orange, D→purple burns four of the six semantic hues on identity, leaving green/red for correct/incorrect — which is *also* the only red/green pair, and the classic CVD failure mode.
- **EC3 — Correct/incorrect coding.** `Responses.tsx` dims wrong answers to `opacity-65` and stamps `Check`/`X`; `Result.tsx` shows a full-screen green circle-check or red circle-xmark. Deck red is "bugs, pitfalls ONLY" — semantically aligned, but the green/red pairing needs the icon+shape redundancy kept, not dropped for a cleaner look.
- **EC4 — Phone viewport vs. slide type scale.** STYLE.md's STANDARD register is 74px H2 with 92/110/84 padding on a 1920px stage. A 390px-wide phone playing `Answers.tsx` needs the DENSE analogue and then some. The two-register density flag transfers as a concept; the numbers do not.
- **EC5 — Motion coupled to game feel.** `Start.tsx` rotates a square 45° per second as the countdown; `Prepared.tsx` does a 3D card flip-in; `Podium.tsx` runs a 4-beat reveal gated on SFX timing (`usePodiumAnimation`, 2000ms interval, four sound cues). Calming the motion without desyncing it from the audio cues is a real coupling, not a style choice.
- **EC6 — Confetti and spotlight.** `react-confetti` at `apparition >= 4` and the `.spotlight` radial sweep are the loudest party-game signals. They are also the emotional payoff of the podium. Removing them is a *product* decision leaking out of a *visual* task.
- **EC7 — Font loading in an offline Docker deployment.** Slide tokens `@import` Google Fonts. Razzia must self-host. `@fontsource-variable/space-grotesk` and `@fontsource-variable/jetbrains-mono` exist, but adding two families where one lives today changes bundle weight and first-paint on a phone joining over conference wifi.
- **EC8 — Tailwind v4 `@theme` vs. raw CSS custom properties.** Tailwind v4 generates utilities from `@theme` entries. Vendoring `tokens/colors.css` as plain `:root` vars gives `var(--accent-teal)` but *no* `bg-accent-teal` utility. Mixing the two idioms in one codebase is the standard drift vector.
- **EC9 — `twMerge` and arbitrary values.** Components merge caller classes through `twMerge` (`Card`, `Button`, `AnswerButton` via `clsx`). Arbitrary-value classes (`bg-[#E69F00]`) do not merge/override the same way named tokens do; a token migration silently changes override precedence at every call site.
- **EC10 — Radix portal surfaces.** `AlertDialog`, `Select`, `Switch` render into portals outside the app tree. A theme scoped to a wrapper element (rather than `:root`/`<html>`) leaves dialogs and the QR modal (`states/Room.tsx:668-685`) unstyled — the classic half-themed-app tell.
- **EC11 — In-flight task 0001.** Phase 5 (README docs + manual acceptance evidence) is open, and `ConfigVisuals.tsx` / `QuizzBackgroundControl.tsx` are recently landed. A concurrent restyle of those exact files creates rework and muddies task 0001's acceptance evidence.
- **EC12 — Upstream merge surface.** 73 files touched across every feature directory maximizes conflict with upstream `Ralex91/Razzia`. Localized token changes conflict in one file; a full component rewrite conflicts in all of them.
- **EC13 — i18n string length.** German and Japanese labels are materially longer/shorter than English. Mono, letter-spaced (2–6px) uppercase kickers are the *most* length-sensitive type role in the system, and the deck language uses them everywhere.
- **EC14 — `_ds_bundle.js` is compiled-only.** No JSX sources. Adopting components means either running a global-scope IIFE inside a Vite/React 19 app or hand-porting from minified-ish output. There is no supported import path.
- **EC15 — Existing accessibility posture.** The Okabe-Ito answer palette suggests a deliberate prior accessibility choice. Deck accents were never contrast-audited against WCAG for *UI text* (they were audited by eye, at 1920×1080, for projection). Body copy at `--text-body #e7edf5` on `#0a0e16` is fine; `--text-faint #8995ad` on `--surface-panel #0c1322` is ~5.2:1 and fails on small text over tinted fills.

---

# Phase B — Enumerate

Twenty-one options, grouped by subsystem (token layer → component layer → typography → motion/depth → color semantics → verification → sequencing). Order is for readability only.

### O1 — Retarget the existing Tailwind `@theme` block in place

- **Idea** — Keep every utility class in the codebase; change what those classes *mean* by redefining the theme.
- **What it changes** — `packages/web/src/index.css` `@theme` only. `--color-primary` moves off `#ff9900`; `--color-secondary` becomes the canvas; `--font-display` swaps.
- **How it would work** — Tailwind v4 regenerates `bg-primary`, `text-primary`, `border-primary` from the new values. Surfaces that use `bg-white`/`bg-gray-*` literals stay as-is until separately swept. A follow-on pass replaces literal grays with new named tokens.
- **Preconditions** — Applies when the desired change is expressible as a palette substitution over the existing structure.

### O2 — Vendor the `_ds` token CSS files and bridge them into `@theme`

- **Idea** — Copy `tokens/{colors,typography,spacing,effects}.css` into the web package verbatim, then declare Tailwind theme entries that reference those custom properties.
- **What it changes** — New `packages/web/src/styles/ds/*.css`; `index.css` imports them and maps `--color-accent-teal: var(--accent-teal)` etc. `tokens/fonts.css` is replaced with `@fontsource` imports.
- **How it would work** — One vendored copy is the single source of truth for values; Tailwind utilities are generated names pointing at it. Refreshing from slide-gen is a file copy plus a diff of the bridge map.
- **Preconditions** — Applies when value parity with slide-gen is wanted and a vendored-copy provenance note is acceptable.

### O3 — Author a Razzia-native token file transcribed from `STYLE.md`

- **Idea** — Hand-write a token set for an *app*, using STYLE.md's tables as the source of truth for hues and recipes but choosing app-appropriate scales.
- **What it changes** — One new `index.css` `@theme` block plus a short `packages/web/STYLE.md` recording the derivations and where they intentionally diverge.
- **How it would work** — Colors, borders, radii, and the depth recipes copy across at parity; type scale, spacing, and density registers are re-derived for a responsive viewport range rather than a fixed 1920px stage.
- **Preconditions** — Applies when divergence from the slide numbers is expected and the divergence should be documented rather than accidental.

### O4 — Two-dialect split: dark for play, Canvas light/slate for authoring

- **Idea** — Use the slide dialect on player/game surfaces and the `Design/Canvas Design` light dialect on manager/editor surfaces, with a shared accent-role vocabulary.
- **What it changes** — Two theme scopes; `features/game/**` + `pages/(auth)`/`pages/party` on one, `features/manager/**` + `features/quizz/**` on the other. `QuestionEditor/index.tsx` sits on the boundary (light chrome, dark live preview).
- **How it would work** — A `data-surface="stage|studio"` attribute on the route layout selects one of two token sets that share hue *roles* (teal = brand, green = success, red = error) but differ in surface/text/border values, exactly as the two shipped slide-gen dialects already do.
- **Preconditions** — Applies when authoring ergonomics (long editing sessions, dense forms, room lighting) are weighted separately from stage presentation.

### O5 — Introduce a Razzia primitive kit (`src/components/ds/`)

- **Idea** — Add a small set of styled primitives that encode the recipes once, then move screens onto them.
- **What it changes** — New `Surface`, `Panel`, `Kicker`, `AccentChip`, `StatBadge`, `SectionHeading`, `Divider` components; existing `Card`/`Button`/`Input` re-implemented on top; call sites updated across `features/**`.
- **How it would work** — Each primitive takes an `accent` prop and emits the full triple (fill gradient + 1.5px accent border + inset bloom) so a recipe change is a one-file edit. Screens compose primitives instead of hand-assembling utility strings.
- **Preconditions** — Applies when the recipes (§5 of STYLE.md) are meant to be reused rather than re-typed per screen.

### O6 — Consume the compiled `_ds_bundle.js` directly

- **Idea** — Load the existing global-scope component bundle in the Razzia app and render its 21 components.
- **What it changes** — A vendored `_ds_bundle.js` + `styles.css` in `public/`, a `window.React` shim, and a thin React wrapper resolving `window.SlideDesignMaster_9f587e.<Name>`.
- **How it would work** — The bundle is an IIFE that attaches `React.createElement`-built components with inline styles referencing the token custom properties; wrappers pass props through and let the inline styles do the work.
- **Preconditions** — Applies when component-level parity with the decks is the goal and the components' fixed-px inline styling suits the target surfaces.

### O7 — Hand-port selected `_ds` components to idiomatic React + Tailwind

- **Idea** — Read the compiled bundle, reimplement the handful of components Razzia actually needs as normal Razzia components.
- **What it changes** — New components under `src/components/ds/` mirroring `FeatureCard`, `KeyInsightBar`, `MisconceptionBox`, `IconListRow`, `StepList`, `PulseBadge` semantics; the bundle itself is never shipped.
- **How it would work** — Each port keeps the visual recipe and the `accent` prop contract, drops the fixed-px slide sizing, and gains responsive classes. `_ds_bundle.js` serves as the reference implementation during the port and is then discarded.
- **Preconditions** — Applies when a subset of the component vocabulary maps to real Razzia surfaces and long-term ownership sits in Razzia.

### O8 — Pure class-level restyle, no structural change

- **Idea** — Walk the 73 `.tsx` files and rewrite utility class strings only; leave component boundaries, props, and markup structure untouched.
- **What it changes** — `className` strings across `components/`, `features/game/`, `features/manager/`, `features/quizz/`.
- **How it would work** — Per-file passes: replace `bg-white` with the surface token, `drop-shadow-lg` with the scrim/glow treatment, `font-bold` with the role-appropriate weight/face, `rounded-*` with the strict radius scale. No new files.
- **Preconditions** — Applies when minimizing diff shape (and therefore review and merge cost) is weighted above reuse.

### O9 — Full two-font swap: Space Grotesk + JetBrains Mono, self-hosted

- **Idea** — Replace Rubik with the slide system's exact two-face pairing, self-hosted for offline deployment.
- **What it changes** — `package.json` (add `@fontsource-variable/space-grotesk`, `@fontsource-variable/jetbrains-mono`; drop `@fontsource-variable/rubik`), `main.tsx` imports, `@theme` `--font-display`/`--font-mono`, and every numeral/label/badge site (`GameWrapper` counter, points chips, PIN display, timer, percentages, streaks).
- **How it would work** — Space Grotesk carries headings and body; JetBrains Mono carries kickers, badges, code, and *all numerals* per STYLE.md §1.2. `font-synthesis: none` is set so out-of-range weights fail visibly.
- **Preconditions** — Applies when the two-font rule is treated as a non-negotiable rather than a preference.

### O10 — Partial font adoption: keep Rubik for prose, add mono for numerals and kickers

- **Idea** — Add JetBrains Mono only, assigning it the numeral/label/kicker roles, and leave Rubik as the sans face.
- **What it changes** — One added `@fontsource` dependency, `--font-mono` in `@theme`, and the numeral/label sites; body and heading type is untouched.
- **How it would work** — The mono-numeral convention is what visually reads as "technical"; the sans face carries less of that signal, so the register shifts substantially for one added font's weight.
- **Preconditions** — Applies when bundle size or a deliberate distinction from the lecture decks matters.

### O11 — Motion re-registration to the calm set

- **Idea** — Replace overshoot/bounce/wiggle with the slide system's sparse-and-continuous motion vocabulary.
- **What it changes** — `index.css` keyframes (`show`, `quizz`, `quizzButton`, `balanced`, `timer`, `spotlightAnim`) and every consumer class; `motion` spring configs in `Leaderboard.tsx` (`stiffness: 1000/400`) and `StreakBadge`; the `Podium` reveal timing; the `Start` rotating square.
- **How it would work** — Entrances become `0.5s cubic-bezier(0.16,1,0.3,1)` fade + 16px rise (`sc-slide-in`); emphasis becomes `sc-pulse-glow`; loading becomes `sc-shimmer`; ambient becomes `sc-corner-halo`. Sound-cue timing (`usePodiumAnimation`'s 2000ms beats) is preserved as the outer schedule while inner easing changes.
- **Preconditions** — Applies when "elementary-school" is read to include the motion register, not just the palette.

### O12 — Depth re-registration: kill neutral shadows, adopt accent-tinted inset bloom

- **Idea** — Remove every neutral drop shadow and replace elevation with the tinted-fill + 1.5px accent border + inset-glow recipe.
- **What it changes** — 31 `drop-shadow*` occurrences, `shadow-sm`/`shadow-xl`/`shadow-2xl`/`shadow-md`, the `.anim-quizz` `box-shadow: 10px 10px 0 rgba(20,24,29,1)` hard shadow, and the `Medal` `textShadow`.
- **How it would work** — Cards take `linear-gradient(160deg, rgba(accent,.15), rgba(10,14,21,.22))` + `1.5px rgba(accent,.4)` + `inset 0 -2px 30px rgba(accent,.17), 0 0 26px rgba(accent,.07)`. Text legibility over imagery is handled by a surface layer rather than per-glyph shadow.
- **Preconditions** — Applies once a non-shadow answer to text-over-photo legibility exists (see O13).

### O13 — Atmosphere subsystem: hero radial, vignette, dot-matrix, and a background scrim contract

- **Idea** — Build the deck's background layering as an app subsystem, and define how a host-uploaded image participates in it.
- **What it changes** — `Background.tsx` (auth shell), `GameWrapper.tsx` (game shell), `QuestionEditor/index.tsx` (editor preview); a new atmosphere component.
- **How it would work** — Layer order becomes: base canvas → optional host image → token-defined scrim/vignette (page-bg color, opaque toward content, transparent at edges) → faint ambient decoration (dot-matrix field, corner radials) → content. The scrim is a token, so the contrast floor is guaranteed regardless of what the host uploads; the two rotated `bg-primary/15` blocks in `Background.tsx` are replaced by the hero radial.
- **Preconditions** — Applies when host-supplied backgrounds (task 0001) stay a supported feature.

### O14 — Answer identity mapped onto deck accents, with non-color redundancy

- **Idea** — Retire the Okabe-Ito hexes; assign A/B/C/D to four deck accent triples and strengthen the non-color channel.
- **What it changes** — `ANSWERS_COLORS` in `features/game/utils/constants.ts`; consumers `Answers.tsx`, `Responses.tsx`, `Prepared.tsx`, `AnswerButton.tsx`, and the editor's `QuestionEditorAnswers.tsx`.
- **How it would work** — Each answer becomes a full triple (tinted gradient fill, 1.5px accent border, accent-colored mono label badge) rather than a flat saturated fill; the A/B/C/D mono badge becomes the primary discriminator with hue as reinforcement; correct/incorrect keeps its icon stamp.
- **Preconditions** — Applies when whole-system hue coherence is weighted above preserving the existing palette's measured CVD separation.

### O15 — Keep the Okabe-Ito hues, restyle them into deck recipes

- **Idea** — Treat the four answer hues as a protected, out-of-system palette and only change *how* they are rendered.
- **What it changes** — `AnswerButton.tsx` and `ANSWERS_COLORS`'s class shape (from `bg-[#hex] text-white` to a triple), not the hues themselves. Derived border/tint values are computed per hue.
- **How it would work** — Each Okabe-Ito hue gets a generated accent/border/tint row matching the deck formula (border ≈ desaturated-darkened accent, tint ≈ `rgba(accent, .12–.15)`), so answers look like deck cards while keeping their measured separation.
- **Preconditions** — Applies when the existing palette's accessibility properties are treated as a preserved invariant.

### O16 — Screenshot verification harness for every game state

- **Idea** — Mirror the slide package's "verify by rendering" gate (`screenshot_slide.py`, `render_metrics.py`) with an app equivalent.
- **What it changes** — New dev dependency (Playwright), a script under `packages/web/`, a fixture/route that can force any `STATUS` with canned data, and a `screenshots/` output directory.
- **How it would work** — Drive the 11 game states + join + manager config + editor at two viewports (≈390×844 phone, ≈1920×1080 projector), emit PNGs, and diff against a committed baseline. Feeds both review and the adherence checklist.
- **Preconditions** — Applies when the retheme is expected to span multiple sessions or PRs.

### O17 — Adherence doc + lint gate

- **Idea** — Give Razzia its own short style bible plus mechanical enforcement, mirroring `STYLE.md` §12 and `_adherence.oxlintrc.json`.
- **What it changes** — New `packages/web/STYLE.md`; additions to `.oxlintrc.json` and/or a `stylelint`-equivalent check in CI.
- **How it would work** — Rules ban raw hex in `className`, `bg-white`/`bg-gray-*` literals, `drop-shadow*`, and `shadow-{sm,md,lg,xl,2xl}` outside an allowlist; the doc records the accent-role table, the density registers, and the checklist to run against screenshots.
- **Preconditions** — Applies when preventing drift back is part of the deliverable rather than a follow-up.

### O18 — In-app design-reference route

- **Idea** — Port the idea of `Design/Slide Design Master/index.html` — a live taxonomy of every component in every accent — into a dev-only route.
- **What it changes** — A new route (e.g. `pages/dev/ds.tsx`) excluded from production builds, rendering the primitive kit and every game-state shell with fixture data.
- **How it would work** — One page shows all surfaces side by side, making register drift visible at a glance and giving the screenshot harness a single stable target in addition to the real screens.
- **Preconditions** — Applies when a primitive kit exists to be catalogued (O5/O7).

### O19 — Single big-bang retheme PR

- **Idea** — Land tokens, fonts, motion, depth, and all 73 files' restyle in one change.
- **What it changes** — Everything at once; one review, one merge point.
- **How it would work** — Theme and all consumers move together, so there is never an intermediate state where half the app is themed; the old tokens are deleted in the same commit.
- **Preconditions** — Applies when no concurrent work touches `packages/web` during the window.

### O20 — Runtime-switchable theme with both registers live

- **Idea** — Ship the new language behind a switchable theme attribute with the current look retained as the alternate.
- **What it changes** — A `data-theme` attribute on `<html>`, two complete token sets, and a manager-facing (or env-flagged) selector; every component styles from tokens only.
- **How it would work** — Both palettes are defined as custom-property sets; the attribute selects one; portal surfaces are covered because the attribute sits on the root element. Rollout and rollback are a one-attribute change.
- **Preconditions** — Applies when the old look must remain reachable (upstream parity, host preference, staged rollout).

### O21 — Strangler migration under an explicit grandfather policy

- **Idea** — Adopt the slide system's own migration ruling: new and *touched* surfaces use the new language; untouched surfaces are grandfathered until deliberately swept.
- **What it changes** — Tokens and primitives land first with zero consumer changes; each subsequent PR converts one surface group (join → game shell → game states → manager → editor).
- **How it would work** — Each PR is independently reviewable and shippable; the adherence lint runs in warn mode on legacy files and error mode on converted ones, so drift is visible without blocking.
- **Preconditions** — Applies when the app must stay releasable throughout and concurrent feature work (task 0001 Phase 5) continues in parallel.

---

# Phase C — Evaluate

## C1) Per-option pros, cons, risks

**O1 — retarget `@theme` in place**
- *Pros*: smallest possible diff; instantly reversible; zero merge surface; produces a visible directional change in one file.
- *Cons*: cannot express the language — accent triples, inset glow, mono roles, and density registers have no home; the 27 `bg-white` and 26 `bg-gray-200` literals are untouched, so the result is a recolored children's app.
- *Failure modes*: reads as "orange became teal"; invites the conclusion that the port was tried and didn't help.
- *Phase fit*: Phase 0 only as a spike, not as the deliverable.

**O2 — vendor `_ds` tokens + Tailwind bridge**
- *Pros*: exact value parity with the decks; refresh is a file copy; provenance is legible; the bridge map documents every mapping.
- *Cons*: imports slide-context tokens (`--layout-slide-width`, `--text-slide-h1-size`, `--layout-slide-padding-title`) that are meaningless in an app; two idioms (`var(--accent-teal)` and `bg-accent-teal`) coexist (EC8).
- *Failure modes*: dead tokens accumulate; contributors pick the wrong idiom; the vendored copy silently drifts from slide-gen with no diff signal.
- *Phase fit*: Phase 0 for the color/effects subsets; the typography/spacing files need pruning first.

**O3 — Razzia-native transcription**
- *Pros*: every token earns its place; the type/spacing scale is designed for the real viewport range; divergences are recorded rather than accidental; no dead slide-geometry tokens.
- *Cons*: hand transcription can introduce value drift; no mechanical refresh path from slide-gen; costs a careful pass over STYLE.md §2–§5.
- *Failure modes*: a mistyped hex or alpha propagates everywhere; "derived for an app" becomes cover for arbitrary deviation.
- *Phase fit*: Phase 0, and it is the artifact everything else builds on.

**O4 — dark stage / light studio split**
- *Pros*: matches how the authoring surfaces already behave (light forms); precedent exists inside slide-gen (Canvas dialect); dense editor forms are genuinely better in light mode; the boundary is a clean route split.
- *Cons*: two token sets to maintain and keep role-consistent; the editor's live preview is dark inside light chrome (a deliberate but odd seam); doubles the adherence checklist.
- *Failure modes*: the two dialects drift apart; shared components (`Button`, `Input`, `AlertDialog`) need to work in both, which is where half-themed bugs live.
- *Phase fit*: a Phase 0 *decision*, even if the light half lands later — it determines the token architecture.

**O5 — primitive kit**
- *Pros*: recipes live in one place, so §5's exact glow/gradient formulas are applied consistently; future screens are cheap; makes O17's lint rules enforceable (ban raw recipes, require primitives).
- *Cons*: touches every call site; adds an abstraction layer to a codebase that currently has almost none; over-abstraction risk if primitives are designed before enough screens are converted.
- *Failure modes*: primitives that don't fit real screens get bypassed with `className` overrides, and `twMerge` precedence (EC9) makes those overrides subtly inconsistent.
- *Phase fit*: after 2–3 screens are converted by hand and the real vocabulary is known.

**O6 — consume `_ds_bundle.js`**
- *Pros*: 21 components for near-zero authoring; guaranteed visual parity with the decks.
- *Cons*: global IIFE + `window.React` shim inside a Vite/React 19 SSR-less-but-modern app; inline fixed-px styles sized for a 1920px stage; no types; no tree-shaking; no source to fix bugs in (EC14); components are slide furniture (`FormulaBar`, `ComparisonTable`, `CodeBlock`) that Razzia has no use for.
- *Failure modes*: React duplication or version mismatch; components that can't respond to a phone viewport; a permanently unmaintainable vendored blob.
- *Phase fit*: none — this is a deck-authoring path, not an app path.

**O7 — hand-port selected components**
- *Pros*: keeps the recipes and the `accent` prop contract; drops the slide sizing; owned in-repo, typed, responsive.
- *Cons*: the bundle is the only reference and it is compiled; only a handful of the 21 map to Razzia surfaces (`FeatureCard`, `KeyInsightBar`, `PulseBadge`, `IconListRow` at best); the rest is wasted reading.
- *Failure modes*: porting components Razzia never needs; subtle recipe drift during transcription.
- *Phase fit*: opportunistic — port a component when a screen needs it, not up front.

**O8 — pure class-level restyle**
- *Pros*: smallest structural risk; reviewable file by file; no new abstractions; each file's diff is self-contained.
- *Cons*: the same 6-property recipe gets retyped ~30 times; guaranteed inconsistency without a lint gate; no mechanism to re-tune a recipe later.
- *Failure modes*: recipe values drift between screens; the next contributor copies whichever variant they saw first.
- *Phase fit*: viable for the first 2–3 screens as vocabulary discovery; not viable as the whole strategy.

**O9 — full two-font swap**
- *Pros*: the mono-numeral convention is the single highest-signal change in the whole port — timers, scores, PINs, percentages, and `NN / TOTAL` all become technical instantly; satisfies non-negotiable #2; `font-synthesis: none` turns weight errors into visible failures.
- *Cons*: two variable font families instead of one on a phone joining over conference wifi; Space Grotesk's tight tracking at small sizes needs checking against German/Japanese strings (EC13).
- *Failure modes*: FOUT on the join screen; mono digits at small sizes in narrow HUD chips overflowing in `de`/`ja`.
- *Phase fit*: Phase 0 — it is cheap, isolated, and carries a disproportionate share of the perceived change.

**O10 — mono numerals only, keep Rubik**
- *Pros*: one added font instead of two; captures most of the technical signal; smaller bundle delta; deliberate distinction from the lecture decks.
- *Cons*: Rubik's rounded, geometric friendliness is itself part of the "elementary-school" read; violates the two-fonts-only non-negotiable in letter while claiming it in spirit.
- *Failure modes*: the result reads as "half ported"; Rubik + JetBrains Mono is not a pairing anyone designed.
- *Phase fit*: a fallback if bundle size measurement rules O9 out.

**O11 — motion re-registration**
- *Pros*: bounce/wiggle/overshoot is arguably the loudest "elementary-school" signal after the orange; the replacement vocabulary is already specified with exact keyframes; `sc-*` classes drop in.
- *Cons*: `usePodiumAnimation` couples reveal beats to four SFX cues (EC5); `Start.tsx`'s rotating square *is* the countdown, not decoration; over-calming a party game can flatten the payoff (EC6).
- *Failure modes*: audio/visual desync on the podium; the game stops feeling like a game.
- *Phase fit*: Phase 1, after the static register is settled and can be judged.

**O12 — depth re-registration**
- *Pros*: removes the single most-cited off-system tell; 31 `drop-shadow*` sites are mechanically findable; the replacement recipe is exactly specified.
- *Cons*: blocked on EC1 — those shadows are load-bearing for text legibility over an arbitrary host photo; removing them before O13 lands makes text unreadable on bright backgrounds.
- *Failure modes*: a host uploads a white slide-photo and every screen becomes unreadable; the failure only appears with real host content, not in dev.
- *Phase fit*: strictly after the scrim contract exists.

**O13 — atmosphere subsystem + scrim contract**
- *Pros*: solves EC1 structurally rather than per-glyph; makes the contrast floor a token; lets O12 proceed; replaces the rotated-square auth shell with the hero radial; ambient decoration is specified (§6) including the "fade around content" vignette rule.
- *Cons*: new subsystem in the middle of the shell components that task 0001 just modified (EC11); the scrim reduces the visual impact of the host's chosen image, which is a feature the host explicitly opted into.
- *Failure modes*: scrim too heavy → the background feature becomes pointless; too light → EC1 returns; interacts with `QuestionEditor`'s preview, which must match the live game exactly.
- *Phase fit*: Phase 0/1 — it gates O12 and touches contested files, so it should land early and deliberately.

**O14 — answers on deck accents**
- *Pros*: one hue system across the whole app; answers become deck cards; the mono A/B/C/D badge becomes a stronger discriminator than it is today.
- *Cons*: directly contradicts non-negotiable #6 (accents are semantic) by spending four hues on identity; consumes teal/blue/orange/purple, leaving green/red for correct/incorrect — the one pair CVD users most often can't separate (EC2, EC3); discards a measured accessibility choice.
- *Failure modes*: colorblind players lose answer separation on the phone view where the badge is smallest (`size-5` at base breakpoint); the semantic meaning of accents becomes unlearnable.
- *Phase fit*: only viable if paired with a formal semantic/identity namespace split.

**O15 — keep Okabe-Ito, restyle into recipes**
- *Pros*: preserves the accessibility property; still delivers the visual change (flat saturated fills → tinted gradient + accent border + inset bloom is most of the perceived difference); leaves all six semantic hues free for their actual jobs.
- *Cons*: four out-of-system hues permanently live in the palette; requires deriving border/tint rows the slide system never specified for these hues; a purist reading of §1.6 is violated either way.
- *Failure modes*: derived tints clash with the semantic accents when both appear on screen (`Responses.tsx` shows answer colors and correct/incorrect stamps simultaneously).
- *Phase fit*: Phase 0 for the recipe restyle; the hue question can stay open.

**O16 — screenshot harness**
- *Pros*: the slide system's own gate is "verify by rendering", and this port has no other way to see 11 states × 2 viewports; catches EC13 (i18n overflow) and EC1 (background contrast) mechanically; makes review possible without a live game.
- *Cons*: needs a fixture route that can force arbitrary `STATUS` values with canned data — a real (if small) piece of scaffolding in a socket-driven app; Playwright is a new dev dependency in a package with no test infrastructure.
- *Failure modes*: the fixture route drifts from real socket payload shapes and starts certifying a UI that never renders in production.
- *Phase fit*: Phase 0 if the port spans more than one session — the cost is front-loaded and amortizes.

**O17 — adherence doc + lint gate**
- *Pros*: without it the port decays, exactly as STYLE.md §3.4 documents happening inside slide-gen's own 1.1 deck; the rules are mechanical (ban raw hex, `bg-white`, `drop-shadow*`); the doc is where the "why" for divergences lives.
- *Cons*: lint rules against Tailwind class *contents* are awkward in oxlint and may need a custom check; over-strict rules block legitimate one-offs; a doc nobody reads is overhead.
- *Failure modes*: warn-only rules get ignored; error-level rules land before the codebase is clean and get disabled wholesale.
- *Phase fit*: doc in Phase 0 (it captures the decisions this deep dive surfaces); lint in warn mode from the first converted surface, error mode per-directory as each is converted.

**O18 — in-app design reference route**
- *Pros*: single stable screenshot target; makes register drift obvious; onboarding surface for contributors; mirrors a pattern already proven useful in slide-gen.
- *Cons*: only pays off once a primitive kit exists; another surface to keep current; risk of the reference and the real screens diverging.
- *Failure modes*: becomes stale and starts documenting a language the app no longer uses.
- *Phase fit*: after O5, if at all. Lowest-urgency item in the corpus.

**O19 — big-bang PR**
- *Pros*: no intermediate half-themed state; one coherent design decision reviewed as a whole; old tokens deleted immediately.
- *Cons*: a 73-file diff is effectively unreviewable; collides head-on with task 0001 Phase 5 (EC11); maximum upstream conflict (EC12); no rollback granularity.
- *Failure modes*: the PR stalls; regressions can't be bisected to a cause; task 0001's acceptance evidence is invalidated mid-flight.
- *Phase fit*: not recommended at any phase.

**O20 — runtime-switchable dual theme**
- *Pros*: rollback is one attribute; forces genuine token discipline (a component that hardcodes a color visibly breaks under switching); root-level attribute covers Radix portals (EC10); keeps upstream parity reachable.
- *Cons*: two complete palettes maintained indefinitely; every new surface must be checked in both; doubles the screenshot matrix; the old theme is the thing being deliberately removed, so preserving it is odd.
- *Failure modes*: the legacy theme rots and its screens break, but nobody notices until someone flips the switch.
- *Phase fit*: worth adopting the root-attribute *mechanism* even if only one theme is ever defined.

**O21 — strangler with grandfather policy**
- *Pros*: the app stays releasable; each PR is small and reviewable; task 0001 finishes undisturbed; it is exactly the migration policy the source design system uses on itself (§11); lint can be warn-on-legacy / error-on-converted.
- *Cons*: an extended period where the app looks visibly inconsistent; risk of stalling half-done; the conversion order needs deliberate choice so the visible half is the important half.
- *Failure modes*: the last 30% never lands; users see a Frankenstein app for weeks.
- *Phase fit*: the default sequencing unless there is a hard demo deadline.

## C2) Trade-off matrix

Scales: L/M/H (low/medium/high). "Blast radius" = files touched. "Phase 0 fit" = can land immediately and independently.

| ID | Complexity | Design-fidelity risk | Accessibility risk | Blast radius | Phase 0 fit | Debuggability | Verifiability |
|---|---|---|---|---|---|---|---|
| O1 retarget `@theme` | L | H (can't express the language) | L | L (1 file) | Yes | H | H |
| O2 vendor `_ds` tokens | L | L | M (unaudited for UI text) | L (2–3 files) | Partial (needs pruning) | M (two idioms) | H |
| O3 native transcription | M | L–M (manual drift) | L (audited on transcribe) | L (1–2 files) | Yes | H | H |
| O4 dark/light split | M–H | M (two dialects drift) | L | M (route layouts) | Decision only | M | M (2× matrix) |
| O5 primitive kit | M–H | L | L | H (all call sites) | No | H | H |
| O6 `_ds_bundle.js` | H | L on desktop, H responsive | M | M | No | L (no source) | L |
| O7 hand-port components | M | M | L | M | No | H | H |
| O8 class-level restyle | M | H (per-file drift) | M | H (73 files) | Yes | M | M |
| O9 two-font swap | L | L | M (small-size legibility, i18n) | M (numeral sites) | Yes | H | H |
| O10 mono numerals only | L | M (half-ported read) | L | L–M | Yes | H | H |
| O11 motion re-registration | M | L | L (calmer = safer) | M (+ SFX coupling) | No (needs static base) | M | M (motion is hard to screenshot) |
| O12 depth re-registration | M | L | **H if before O13** | H (31+ sites) | No (gated) | M | H |
| O13 atmosphere + scrim | M–H | L | L (raises the floor) | M (3 shells) | Yes | M | H |
| O14 answers on accents | L | L (system-coherent) | **H** (CVD, EC2/EC3) | L (1 const + 5 files) | Yes | H | H |
| O15 Okabe-Ito + recipes | L–M | M (out-of-system hues) | L (preserves invariant) | L–M | Yes | H | H |
| O16 screenshot harness | M | n/a | n/a | L (+ fixture route) | Yes | H | n/a |
| O17 doc + lint gate | M | n/a (prevents drift) | n/a | L–M | Yes (doc) | H | n/a |
| O18 reference route | L–M | n/a | n/a | L | No (needs O5) | H | H |
| O19 big-bang | H | M | M | H (73 files) | No | L | L |
| O20 runtime dual theme | M–H | L | L | M (+ discipline) | Yes (mechanism) | H | M (2× matrix) |
| O21 strangler | L | M (interim inconsistency) | L | Spread | Yes | H | H |

Composites (C6) added on the same axes:

| ID | Complexity | Design-fidelity risk | Accessibility risk | Blast radius | Phase 0 fit | Debuggability | Verifiability |
|---|---|---|---|---|---|---|---|
| S1 Stage & Studio | M–H | L | L | M | Decision Phase 0, build later | M | M |
| S2 Spine → Kit → Gate | M | L | L | Spread (strangler) | Yes (spine) | H | H |
| S3 Scrim Contract | M | L | L (raises floor) | M | Yes | M | H |
| S4 Two Color Namespaces | L–M | L | L | L–M | Yes | H | H |

## C3) Diagnostics & evidence plan

Fast probes (cheap, high signal)

- **P1 — Background contrast census.** Composite the current `background.png` and 3–4 realistic host uploads (bright photo, white slide, dark texture, busy screenshot) behind a mock of `Answers.tsx`; measure text contrast at the worst 5% of pixels. Decides how heavy the O13 scrim must be, and whether EC1 is a real or theoretical hazard.
- **P2 — Font bundle delta.** Add `@fontsource-variable/space-grotesk` + `jetbrains-mono` in a scratch branch, run `pnpm -F @razzia/web build`, and compare transferred bytes and font-file count against Rubik-only. Decides O9 vs O10.
- **P3 — CVD simulation of both answer palettes.** Render the four answer buttons under deuteranopia/protanopia/tritanopia simulation for (a) current Okabe-Ito, (b) an O14 deck-accent mapping. Decides O14 vs O15 on evidence rather than principle.
- **P4 — Grep census as a work estimate.** Already run: 27 `bg-white`, 26 `bg-gray-200`, 47 `text-white`, 31 `drop-shadow*`, 15 `bg-primary`, 47 `font-bold` across 73 `.tsx`. Refine per-directory to size each strangler slice.

Deep probes (more work, more certainty)

- **P5 — Two-screen vertical slice.** Fully convert exactly two screens — one play (`Answers.tsx`, phone-first) and one authoring (`configurations/index.tsx`, desktop) — to the new language by hand, with no abstractions. Produces the real component vocabulary for O5 and an honest per-screen cost.
- **P6 — Screenshot matrix baseline (O16).** Build the fixture route and capture all 11 states × 2 viewports × `en`/`de`/`ja` *before* any restyle. Gives a before/after artifact, a regression baseline, and immediate EC13 evidence.
- **P7 — Token audit against WCAG.** Run every text-on-surface pairing in the proposed token set through a contrast checker at the actual rendered sizes (not slide sizes). Expected finding: `--text-faint` and `--text-muted` on tinted panels need lifting for small UI text (EC15).

Suggested artifact: `packages/web/.design/audit.json` — `{ pairing, fg, bg, size, ratio, wcagAA, verdict }` rows emitted by P7, plus P1's worst-case measurements, committed alongside the screenshots so the adherence checklist has data behind it.

## C4) Hazard scoring + policy mapping

| Hazard class | Condition | Policy |
|---|---|---|
| **H1 — Legibility floor breach** | Any text/background pairing below WCAG AA at its rendered size, including over a host-uploaded image | **Blocking.** No surface converts until the scrim contract (O13) guarantees the floor. Mitigated by O13; merely re-labelled by adding shadows back. |
| **H2 — Answer discriminability loss** | Two answer options indistinguishable under any CVD simulation on the phone viewport | **Blocking.** Requires evidence (P3) before touching `ANSWERS_COLORS`. O15 avoids the hazard; O14 must prove parity plus non-color redundancy. |
| **H3 — Half-themed app** | A shipped state where converted and legacy surfaces are both reachable in one session | **Accepted with policy.** Inherent to O21; bounded by converting whole route groups per PR and by conversion order (join → game shell → states → manager → editor). |
| **H4 — Recipe drift** | The same visual recipe implemented with different values in different files | **Mitigate first.** O5 primitives + O17 lint. Warn-only lint merely re-labels the hazard; a primitive that call sites actually use reduces it. |
| **H5 — Task 0001 collision** | Concurrent edits to `GameWrapper.tsx`, `QuestionEditor/index.tsx`, `ConfigVisuals.tsx`, `QuizzBackgroundControl.tsx` | **Sequence.** Let task 0001 Phase 5 close, or explicitly hand those four files to this task with 0001's acceptance evidence captured first. |
| **H6 — Upstream divergence** | Merge conflicts against `Ralex91/Razzia` | **Accept and record.** Reduced by concentrating value changes in `index.css` and by preferring token/primitive edits over markup rewrites. Not eliminable. |
| **H7 — Motion/audio desync** | Podium reveal beats drift from SFX cues after easing changes | **Mitigate.** Keep `usePodiumAnimation`'s 2000ms schedule as the contract; change only inner easing. Verify by recording, not by reasoning. |
| **H8 — i18n overflow** | Mono, letter-spaced uppercase labels overflow in `de`/`ja` | **Mitigate.** Cap tracking on UI labels (2px, not the 4–6px slide values); include `de`/`ja` in the screenshot matrix. |

## C5) Minimal experiments

1. **X1 — Scrim ladder.** Render `Answers.tsx` over the four test backgrounds at scrim opacities 0 / 0.35 / 0.55 / 0.75 with all `drop-shadow` removed. *Signal*: lowest opacity meeting AA at every text size. *Decision*: the scrim token value; whether O12 can proceed. *Falsifier*: if no opacity satisfies both AA and "the host's image is still recognizable", the host-background feature and the dark language are in genuine conflict and one must be constrained.
2. **X2 — Font swap spike.** Branch: swap to Space Grotesk + JetBrains Mono, assign mono to all numerals, change nothing else. *Signal*: subjective register shift per unit of effort; measured bundle delta. *Decision*: O9 vs O10, and how much of the perceived change comes from type alone. *Falsifier*: if the app still reads elementary-school with the fonts swapped, type is not the dominant lever and effort should go to O12/O13 first.
3. **X3 — CVD A/B.** P3's simulations, judged blind. *Decision*: O14 vs O15. *Falsifier*: if a deck-accent mapping matches or beats Okabe-Ito separation under all three simulations, the accessibility objection to O14 dissolves.
4. **X4 — Two-screen vertical slice.** P5. *Signal*: which recipes repeat, which don't; hours per screen. *Decision*: whether O5 is worth building, and the strangler slice size. *Falsifier*: if fewer than three recipes repeat across the two screens, a primitive kit is premature and O8 is the honest strategy.
5. **X5 — Podium under calm motion.** Re-time `Podium.tsx`/`Prepared.tsx`/`Start.tsx` to `cubic-bezier(0.16,1,0.3,1)`, keep SFX schedule, record. *Signal*: does the reveal still land emotionally; is audio still synced. *Decision*: how far O11 goes, and whether confetti/spotlight survive (EC6). *Falsifier*: if the podium reads flat, the party-game energy is load-bearing and needs a restyled — not removed — expression.
6. **X6 — Dual-dialect mock.** Mock `configurations/index.tsx` twice: once in the dark slide dialect, once in the Canvas light/slate dialect, both with the new fonts and accent roles. *Signal*: which is more usable for a 20-minute authoring session and which reads more coherent next to the dark play surfaces. *Decision*: O4 / S1. *Falsifier*: if the dark version is equally comfortable, the split is unnecessary complexity and a single dialect wins.
7. **X7 — Lint feasibility spike.** Attempt the "no raw hex / no `bg-white` / no `drop-shadow*` in `className`" rules in oxlint against the current tree. *Signal*: whether oxlint can express them or a custom script is needed; the true violation count. *Decision*: O17's mechanism and whether it is Phase 0 or later.

## C6) Synthesized composite directions

### S1 — "Stage & Studio": one language, two dialects, one accent-role table

- **Source options**: O4 + O3 + O9 + O20's root-attribute mechanism + O17.
- **What makes it a new possibility**: not "dark theme plus a light theme". The emergent artifact is a **role table that is dialect-independent** — `brand`, `success`, `authority`, `warning`, `sequence`, `error` — with each dialect supplying its own accent/border/tint row for every role. Components then reference *roles*, never dialects, which means a shared `Button` or `AlertDialog` is written once and is correct in both. Slide-gen has two dialects (slide, Canvas) that were derived independently and share only fonts and vibe; this composite is what those two would have been if designed together.
- **How it would work**: `<html data-surface="stage|studio">` set by the route layout group (`pages/(auth)` + `pages/party/**` → stage; `pages/manager/**` → studio). One `@theme` block defines role-named Tailwind colors bound to custom properties; two `[data-surface=…]` blocks supply the values. The attribute sits on the root element, so Radix portals inherit (EC10). Ownership boundary: the role table is the contract; dialect hexes are implementation.
- **Pros**: solves the authoring-ergonomics objection to a fully dark app; makes every shared component dialect-safe by construction; the role table is a much better adherence artifact than a hex list; the editor's dark live preview inside light chrome becomes *intentional* (the preview shows the stage, because that is what it is).
- **Cons**: two palettes to keep contrast-audited; doubles the screenshot matrix; requires discipline that a codebase with one `@theme` line today has never needed.
- **Failure modes**: a contributor writes a dialect-specific value into a component and it only breaks on the other surface; the studio dialect drifts toward plain Tailwind grays (i.e. back to today).
- **Vs. best single option**: O3 alone gives one coherent dark app and forces the manager/editor into dark forms — defensible, but it discards the fact that slide-gen *itself* concluded light-mode was right for the non-slide artifact (Canvas assignments). S1 keeps that conclusion and pays for it with a role indirection that is useful anyway.

### S2 — "Spine → Kit → Gate": a token spine that is enforced, migrated by strangler

- **Source options**: O3 (+O2 for value provenance) + O5 + O16 + O17 + O21.
- **What makes it a new possibility**: each part alone is a half-measure — tokens without a gate decay (STYLE.md §3.4 documents exactly this happening inside slide-gen); a kit without screenshots can't be judged; a strangler without lint produces a permanently mixed codebase with no signal about which half is which. Combined, the emergent property is a **per-directory adherence state machine**: a directory is `legacy` (lint warns), `converting` (lint warns, screenshots captured), or `converted` (lint errors, screenshots baselined). Migration status becomes a mechanically-checkable property of the tree, not a memory.
- **How it would work**: Phase 0 lands the token spine (`index.css` + `packages/web/STYLE.md`) with zero consumer changes, plus the fixture route and screenshot baseline. Each subsequent PR takes one route group, converts it onto the primitive kit, flips that directory's lint config to error, and re-baselines its screenshots. The kit grows only from recipes proven repeated by X4.
- **Pros**: app stays releasable throughout; task 0001 finishes undisturbed; reviewable PRs; drift is mechanically visible; the primitive kit is discovered rather than designed up front; mirrors the source system's own migration policy ("canonicalize forward, never backfill unprompted").
- **Cons**: the most machinery of any direction; the interim mixed look is visible to users; requires the lint spike (X7) to succeed or degrades to a docs-and-discipline approach.
- **Failure modes**: conversion stalls at 60% and the tree keeps two languages indefinitely; the fixture route drifts from real payloads and certifies fiction.
- **Vs. best single option**: O8 (pure restyle) reaches a similar visual endpoint faster and with less scaffolding, but has no defense against the exact decay the source system documents in its own history, and no way to review 73 files honestly. S2 trades ~1 extra session of setup for a port that is checkable and survives contact with the next contributor.

### S3 — "Scrim Contract": the host background becomes a layer, not the canvas

- **Source options**: O13 + O12 + O15 + the task 0001 `ResolvedVisuals` payload.
- **What makes it a new possibility**: this is not "add a vignette". The emergent artifact is a **contrast contract**: the theme guarantees a minimum text-legibility floor *independently of what the host uploads*, which is precisely what unblocks the removal of all 31 neutral drop shadows. Neither O12 nor O13 alone can do this — O12 removes the crutch and breaks on bright images; O13 adds atmosphere but, without committing to a measured floor, leaves per-glyph shadows as the only guarantee. Together they convert an *unbounded* input (arbitrary host photo) into a *bounded* surface, and the boundedness is what lets the rest of the dark language apply at all. A secondary emergent effect: once the canvas is bounded, answer buttons can drop `text-white drop-shadow-md` flat fills for tinted gradient + accent border (O15) — which is impossible over an unbounded background.
- **How it would work**: a single `<Atmosphere>` component owns the layer stack (base canvas → host image → scrim token → ambient decoration → content vignette) and is used by all three shells (`Background.tsx`, `GameWrapper.tsx`, `QuestionEditor/index.tsx`), so the editor preview and the live game are guaranteed identical. The scrim value is a token derived from X1, not a per-screen judgment. Optionally the backend's `ResolvedVisuals` payload gains an advisory field (e.g. measured mean luminance at upload time) so the scrim can adapt — but the *floor* is enforced client-side regardless, so the backend stays optional.
- **Pros**: turns the hardest edge case (EC1) from a blocker into a solved subsystem; makes O12 safe; unifies three shells that currently duplicate background logic; gives the host-background feature a defensible contract instead of an unbounded promise; the floor is measurable, so H1 becomes a test rather than a taste argument.
- **Cons**: touches exactly the files task 0001 just modified (H5); dampens the host's uploaded image by design, which some hosts will read as a regression; the adaptive-luminance variant adds backend surface.
- **Failure modes**: scrim tuned on the bundled `background.png` alone and never tested against real uploads; the editor preview and live game diverge if only one shell adopts `<Atmosphere>`.
- **Vs. best single option**: O13 alone produces prettier backgrounds and still needs the shadows. S3 is the only direction in the corpus that makes the dark language *actually applicable* to this app rather than applicable-in-principle.

### S4 — "Two Color Namespaces": semantic accents and categorical identity, formally separated

- **Source options**: O15 + O14's badge-strengthening + O17.
- **What makes it a new possibility**: the source system has one color namespace because slides never need to say "this is option B". Razzia needs two, and the conflict between them (EC2) is currently unnamed, which is why any single option resolves it by accident. The emergent artifact is an explicit rule — **`accent-*` tokens carry meaning and may never be used for identity; `answer-*` tokens carry identity and may never be used for meaning** — plus a redundancy requirement: identity is always carried by at least two channels (mono letter badge + hue), never hue alone. This is a genuine extension to the design language, not a compromise within it, and it is the kind of rule that would have to be written back into a Razzia-side STYLE.md.
- **How it would work**: `ANSWERS_COLORS` becomes `answer-a…answer-d` tokens keeping the Okabe-Ito hues, each with a derived border/tint row so answer buttons render as deck cards (`linear-gradient(160deg, rgba(hue,.15), rgba(canvas,.22))` + 1.5px `rgba(hue,.4)` + inset bloom). The A/B/C/D badge becomes JetBrains Mono, larger, and accent-bordered — promoted from decoration to the primary discriminator. Semantic accents stay reserved: green = correct, red = incorrect, teal = brand/host, blue = information, orange = warning/time pressure, purple = sequence/streak. `Responses.tsx`, which shows both namespaces at once, becomes the canonical test case.
- **Pros**: preserves a measured accessibility property while still delivering the visual change; frees all six semantic hues for their real jobs; gives the correct/incorrect signal a non-color channel it partly lacks today; the rule is lintable (hue tokens are namespaced, so misuse is greppable).
- **Cons**: four out-of-system hues live permanently in the palette and must be visually reconciled with the six semantic ones; a purist reading of non-negotiable #6 is still bent; requires deriving eight new values (border + tint per answer hue) that nobody has designed.
- **Failure modes**: the two namespaces clash on `Responses.tsx` where answer hues, the dimming treatment, and correct/incorrect stamps all render simultaneously; contributors reach for `answer-b` because it looks nice.
- **Vs. best single option**: O15 alone quietly keeps the old hues and hopes nobody asks; O14 alone is coherent but trades away accessibility. S4 makes the tension explicit and resolves it with a rule that holds up under review — and it is required under *either* hue decision, which is what makes it a first-class direction rather than a variant.

---

# Phase D — Decide

## D1) Recommendations

**Top 3 viable directions** — the leading recommendation is a composite, and two of the three are.

1. **S2 — "Spine → Kit → Gate" (composite)** as the *how*. Land a Razzia-native token spine (O3, with `_ds` values as the reference) plus `packages/web/STYLE.md` and the screenshot fixture/baseline in Phase 0, then strangle surface-group by surface-group with lint escalating per directory. This is the backbone; everything else plugs into it.
2. **S3 — "Scrim Contract" (composite)** as the *unlock*. It is the only direction that makes the dark language applicable over a host-uploaded background, and it gates the single highest-value cleanup (removing 31 neutral drop shadows). It should land early — in Phase 0 or immediately after — because it also determines whether O12 and O15 are even possible.
3. **S4 — "Two Color Namespaces" (composite)** as the *rule that must exist regardless*. Whichever hue decision X3 produces, the semantic/identity split has to be written down or the palette will be misused within two PRs. Cheap to adopt; expensive to retrofit.

**S1 ("Stage & Studio")** is a strong fourth and is really a *scope decision* rather than a work item — but it must be made before the token spine is written, because it determines whether tokens are named by role (dialect-independent) or by value. Recommend adopting the **role-named token architecture unconditionally** (it costs almost nothing) and deciding the light-studio question after X6.

**Rejected directions**

- **O6 (consume `_ds_bundle.js`)** — compiled-only, global IIFE, `window.React` shim, fixed-px slide sizing, and most of the 21 components are slide furniture Razzia has no use for. No supported path.
- **O19 (big-bang PR)** — unreviewable at 73 files, collides with task 0001 Phase 5, maximum upstream conflict, no rollback granularity.
- **O1 as a deliverable** — fine as a 10-minute spike to see the direction; cannot express accent triples, inset glow, mono roles, or density registers, so it cannot be the port.
- **O10 (mono numerals, keep Rubik)** — demoted, not rejected: Rubik's rounded geometry is itself part of the problem being solved. Revisit only if X2 shows an unacceptable bundle delta.
- **O18 (in-app reference route)** — deferred. Real value, but only after a primitive kit exists and only if the port spans enough sessions to need it.

**"Phase 0 honest" sequencing** — safety and observability first, no overcommitment:

- **Phase 0 (evidence + spine, no visible change):** X1 (scrim ladder), X2 (font spike), X3 (CVD A/B), X7 (lint feasibility). Land the role-named token spine + `packages/web/STYLE.md` + the fixture route and pre-change screenshot baseline (`en`/`de`/`ja` × 2 viewports). Nothing user-visible ships.
- **Phase 1 (unlock + type):** `<Atmosphere>` / scrim contract across all three shells (S3); the two-font swap (O9) with mono assigned to every numeral. These two changes alone should carry most of the perceived register shift, and both are independently reviewable.
- **Phase 2 (vertical slice):** X4 — convert `Answers.tsx` and `configurations/index.tsx` fully by hand. Extract the primitive kit only from recipes that actually repeated. Adopt S4's namespace rule with whichever hue decision X3 produced.
- **Phase 3 (strangle):** convert route groups in order — join/auth → game shell → remaining game states → manager config → quiz editor — flipping lint to error per directory as each lands. Motion re-registration (O11, X5) rides along with the game states, keeping the podium's SFX schedule fixed.
- **Deferred:** light studio dialect (pending X6), in-app reference route, confetti/spotlight product decision.

**Canonical plan deltas** — this deep dive should feed a *new* `plan.md` in this task folder, not task 0001's. Two hard interlocks to record there:

- Task 0001 Phase 5 (README docs + manual acceptance evidence) must close, or explicitly hand `GameWrapper.tsx`, `QuestionEditor/index.tsx`, `ConfigVisuals.tsx`, and `QuizzBackgroundControl.tsx` to this task with 0001's evidence captured first (H5).
- The scrim contract changes what the host-background feature *promises*. Task 0001's intent says "background is fixed when a game starts"; S3 adds "and is composited under a guaranteed contrast floor". That is a contract amendment and belongs in 0001's docs as well as this task's.

**What still needs evidence before planning commits**

- The dialect scope question (dark everywhere vs. Stage & Studio) — **the single highest-value open question**; blocks token naming. X6 answers it; a direct user answer answers it faster.
- Whether host-uploaded backgrounds survive as-is, get the scrim contract, or get deprecated (X1 may force this).
- Whether the party-game energy (confetti, spotlight, SFX, podium reveal) is *restyled* or *removed* — a product call hiding inside a visual task (EC6).
- Font bundle delta on a phone-over-conference-wifi budget (X2).
- CVD parity for any answer-palette change (X3).
- Whether oxlint can express the adherence rules or a custom check is needed (X7).

---

## Appendix — conflict register (slide-gen rule → Razzia reality)

| STYLE.md rule | Razzia today | Resolution path |
|---|---|---|
| §1.2 two fonts only | Rubik only, no mono | O9 (Phase 1) |
| §1.3 dark only | Play surfaces dark-ish; authoring surfaces light-gray Tailwind defaults | S1 role table; X6 decides the studio dialect |
| §1.4 no neutral drop shadows | 31 `drop-shadow*` + `shadow-*` + hard `box-shadow` | S3 unlocks, then O12 |
| §1.5 borders are desaturated accent | `border-gray-200/300`, `border-2` | O5 primitives + O17 lint |
| §1.6 accents are semantic | `bg-primary` used for leaderboard, podium, chips, countdown, progress bar indiscriminately; answers are categorical | S4 |
| §1.7 no emoji | Compliant (lucide + local SVGs) | — |
| §2 density registers | Free-floating `text-2xl…text-5xl`, 47 `font-bold` | O3 re-derives registers for a responsive range |
| §4 strict radius scale | `rounded-{sm,md,lg,xl,2xl,4xl,full,t-xl}` mixed | O3 + O17 |
| §5 inset bloom depth | `shadow-sm`/`2xl`, flat saturated fills | O12 + O15 |
| §6 background atmosphere | Raster photo + two rotated `bg-primary/15` blocks | S3 |
| §8 calm motion, no bounce | Scale-overshoot, 3D flip, ±10° wiggle, `stiffness: 1000` springs | O11 + X5 |
| §9 kicker → H2 → rule chrome | Bare centered `<h2>` on every state | Phase 2 vertical slice |
| §11 canonicalize forward, never backfill | n/a | Adopted as O21/S2's grandfather policy |
| §12 verify by rendering | No screenshot capability at all | O16 (Phase 0) |
