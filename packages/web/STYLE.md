# Razzia design language

This file is the authority for visual work in `packages/web`. Components consume semantic roles;
`src/index.css` is the only place where a role resolves to a color, depth recipe, motion value, or
dialect-specific literal.

## Registers

Two root attributes select the effective register:

- `data-surface="stage" | "studio"` describes the route. Play, auth, and live-game routes are stage;
  manager and quiz-authoring routes are studio.
- `data-dialect="dark-everywhere" | "stage-studio"` is the operator choice.

Only `data-dialect="stage-studio"` combined with `data-surface="studio"` resolves to the light/slate
register. Every other combination is dark. Players never receive or choose a dialect.

## Role table

Semantic roles always travel as an accent/border/tint triple. A component may use one, two, or all
three channels, but values from different rows must never be mixed.

| role | meaning | dark accent / border / tint | studio accent / border / tint |
|---|---|---|---|
| `brand` | Razzia identity, primary host action | `#46d5c0` / `#2c7a52` / `rgba(70,213,192,.08)` | `#0d9488` / `#99f6e4` / `#f0fdfa` |
| `success` | correct, complete, healthy | `#3ecf8e` / `#2c7a52` / `rgba(62,207,142,.12)` | `#15803d` / `#86efac` / `#f0fdf4` |
| `danger` | incorrect, destructive, failed | `#f5604d` / `#6e2a22` / `rgba(245,96,77,.10)` | `#b91c1c` / `#fca5a5` / `#fef2f2` |
| `info` | server authority, code targets, neutral information | `#5b9dff` / `#2f5fb0` / `rgba(91,157,255,.12)` | `#2563eb` / `#93c5fd` / `#eff6ff` |
| `warning` | time pressure, caution, host-only action | `#f08a3c` / `#b5641f` / `rgba(240,138,60,.06)` | `#c2410c` / `#fdba74` / `#fff7ed` |
| `sequence` | ordered steps, streaks, third actor | `#b58af5` / `#4a3a6e` / `rgba(181,138,245,.06)` | `#7c3aed` / `#ddd6fe` / `#faf5ff` |

Studio teal had no border/tint pair in the Canvas source, so `#99f6e4` / `#f0fdfa` are inferred
from the same Tailwind teal family. Canvas also defined no danger role; `#b91c1c` with
`#fca5a5` / `#fef2f2` is the inferred red family. These are Razzia additions, not quoted Canvas
tokens.

### Neutral roles

| role | dark | studio |
|---|---|---|
| `canvas` | `#0a0e16` | `#ffffff` |
| `surface` | `#111827` | `#ffffff` |
| `panel` | `#0c1322` | `#f8fafc` |
| `border` | `#1f2942` | `#e2e8f0` |
| `text-primary` | `#f4f8fc` | `#0f172a` |
| `text-body` | `#e7edf5` | `#334155` |
| `text-muted` | `#9aa6bd` | `#475569` |
| `text-faint` | `#8995ad` | `#64748b` |
| `on-accent` | `#06100e` | `#ffffff` |
| `on-answer` | `#06100e` | `#06100e` |
| `overlay` | `rgba(6,9,15,.72)` | `rgba(6,9,15,.72)` |

Tailwind utilities use the role names, for example `bg-panel`, `border-brand-border`,
`bg-brand-tint`, and `text-text-primary`. The former `primary` / `secondary` compatibility colors
were removed after the Slice 6 strangler conversion reached every web owner.

## Meaning and identity are separate namespaces

`brand`, `success`, `danger`, `info`, `warning`, and `sequence` communicate meaning. They must not
identify answer A, B, C, or D. `answer-a` through `answer-d` communicate categorical identity and
must not be used to imply success, failure, warning, or authority.

The answer namespace preserves the Okabe–Ito-derived hues:

| identity | accent | dark border / tint | studio border / tint |
|---|---|---|---|
| `answer-a` | `#e69f00` | `#8a5f00` / `rgba(230,159,0,.14)` | `#f3cf73` / `#fffbeb` |
| `answer-b` | `#56b4e9` | `#2f6d8a` / `rgba(86,180,233,.14)` | `#bae6fd` / `#f0f9ff` |
| `answer-c` | `#3dbfa0` | `#237565` / `rgba(61,191,160,.14)` | `#99f6e4` / `#f0fdfa` |
| `answer-d` | `#cc79a7` | `#7a4864` / `rgba(204,121,167,.14)` | `#f5d0e2` / `#fdf2f8` |

Answer identity always uses at least two channels: the hue plus a visible mono A/B/C/D badge.
Hue alone is never sufficient.

## Typography, motion, depth, and radius

- Space Grotesk is the self-hosted display/body face; JetBrains Mono is the self-hosted face for
  kickers, identity badges, codes, and numerals. Rubik was removed in Slice 3.
- Calm entrance motion is `--rz-dur-base: .5s` with
  `--rz-ease-calm: cubic-bezier(.16,1,.3,1)`. New bounce or overshoot easing is prohibited.
- Depth comes from the matching `shadow-bloom-*` accent utility. There is deliberately no neutral
  shadow token.
- New components use `rounded-rz-sm/md/lg/xl` (6 / 10 / 16 / 20px). The `rz-` utility suffix keeps
  the additive spine from silently changing legacy Tailwind `rounded-*` consumers before their
  directory is converted.

## Scrim contract

`<Atmosphere recipe="photo">` owns the layer order: canvas → host image → `--rz-scrim`
→ content (`z-10`). The editor preview and live game use that same recipe. `--rz-scrim` is
`rgba(6, 9, 15, 0.75)`: the lowest tested opacity that met WCAG AA over the four X1 fixtures
(minimum measured contrast 8.02:1) and passed the user-owned recognisability rubric at G4.
Photo text roles assume the dark stage register; studio authoring chrome should not place
`text-primary` directly on photo without that scrim.

No component may compensate for an unbounded photo with a local neutral text shadow after its
directory is converted. `<Atmosphere recipe="ambient">` is the separate no-photo composition for
auth/config chrome.

## Banned patterns in converted code

- Dialect-specific values or raw hex inside `className`.
- `bg-white`, `bg-gray-*`, `text-gray-*`, or another raw neutral where a role exists.
- `drop-shadow*` and neutral `shadow-*`. Accent-matched inset bloom is the depth vocabulary.
- New bounce, spring, or overshoot animation/easing.
- Meaning encoded with `answer-*`, or answer identity encoded with semantic accent roles.
- A local background layer stack outside `<Atmosphere>`.
- User-visible literal copy instead of an i18n key.

The frozen celebration motion cluster below is the only planned exception. All directories are now
converted and new work must use semantic roles.

## Recorded deviations

1. **Isolated dialect parse fallback.** `gameVisualsConfigValidator` uses `.catch()` on the dialect
   field so one unknown persisted value falls back without discarding the password/background.
   This is a deliberate local departure from task 0001's otherwise fail-closed parsing.
2. **Celebration motion freeze.** Confetti, spotlight, the 2000ms podium/SFX schedule, and the
   existing `anim-*` overshoot keyframes are frozen by D3. Slice 6 retired every neutral and drop
   shadow, including those formerly used by the celebration cluster; no shadow exception survives.
3. **Quiz dialect exclusion.** A quiz must never persist a dialect. `VisualsConfig` stays
   background-only while `GameVisualsConfig` is the sole shape that may add `dialect`.
4. **Gallery root ownership.** The DEV gallery temporarily overrides surface and dialect through
   `useSurface`'s shared override context. `useSurface` remains the sole DOM writer; the override
   is removed on unmount so two effects never compete for `document.documentElement`.
5. **QR paper is content, not chrome.** The two room QR renderers explicitly request black modules
   on white paper through `QRCodeSVG` props in both dialects. This fixed contrast is required for
   scanner reliability and does not style the surrounding dialog or stage surface.

## Migration status

| directory / owner | status | notes |
|---|---|---|
| `src/index.css` | `converted` | Complete role spine; legacy compatibility colors removed. |
| `src/pages/dev/gallery.tsx` | `converted` | Reference and fixture surface. |
| `src/components/Atmosphere.tsx` | `converted` | Sole owner of the ambient and photo layer recipes. |
| `src/components/**` | `converted` | Shared form, dialog, error, loading, background, and atmosphere owners use roles. |
| `src/features/game/components/AnswerButton.tsx`, `states/Answers.tsx`, `utils/constants.ts` | `converted` | Role-based deck cards; answer identity uses accent fill, border, `text-on-answer`, and a mono badge for stage mass under the scrim. |
| `src/features/game/**` | `converted` | Join chrome, all 11 states, and answer identity use role tokens. |
| `src/features/manager/components/configurations/**` | `converted` | Role-token studio surface verified in both dialects. |
| `src/features/manager/**` | `converted` | Configuration and result-modal owners use role tokens in both dialects. |
| `src/features/quizz/**` | `converted` | Editor, cards, sidebar, media, and controls use role tokens while preserving dnd/media behavior. |
| `src/pages/(auth)/**` | `converted` | Stage-register auth shell uses the ambient recipe and role tokens. |
| `src/pages/manager/**` | `converted` | Studio surface ownership and manager/quiz route chrome use roles. |
| `src/pages/party/**` | `converted` | Player and manager game routes remain stage-register surfaces. |

Slice 5 found no component recipe repeated at least three times across the converted stage and
studio screens. A shared `src/components/ds/*` kit would therefore freeze coincidence rather than
a demonstrated interface; Slice 6 therefore completed with class-level role conversion.
