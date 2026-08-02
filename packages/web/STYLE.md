# Razzia design language

Authority for visual work in `packages/web`. Components consume semantic roles;
`src/index.css` is the only place a role resolves to a literal.

## Register

`document.documentElement.dataset.register` is `"dark"` or `"light"`.

It is light only when the operator dialect is `stage-studio` **and** the route
surface is studio (manager / quiz authoring). Every other combination is dark.
Players never choose a dialect. `useSurface` owns the DOM write.

## Role table

Semantic roles travel as accent / border / tint. Do not mix values across rows.

| role       | meaning                              | dark accent / border / tint                     | light accent / border / tint      |
| ---------- | ------------------------------------ | ----------------------------------------------- | --------------------------------- |
| `brand`    | Razzia identity, primary host action | `#46d5c0` / `#2c7a52` / `rgba(70,213,192,.08)`  | `#0d9488` / `#99f6e4` / `#f0fdfa` |
| `success`  | correct, complete, healthy           | `#3ecf8e` / `#2c7a52` / `rgba(62,207,142,.12)`  | `#15803d` / `#86efac` / `#f0fdf4` |
| `danger`   | incorrect, destructive, failed       | `#f5604d` / `#6e2a22` / `rgba(245,96,77,.10)`   | `#b91c1c` / `#fca5a5` / `#fef2f2` |
| `info`     | server authority, codes              | `#5b9dff` / `#2f5fb0` / `rgba(91,157,255,.12)`  | `#2563eb` / `#93c5fd` / `#eff6ff` |
| `warning`  | time pressure, caution               | `#f08a3c` / `#b5641f` / `rgba(240,138,60,.06)`  | `#c2410c` / `#fdba74` / `#fff7ed` |
| `sequence` | ordered steps, streaks               | `#b58af5` / `#4a3a6e` / `rgba(181,138,245,.06)` | `#7c3aed` / `#ddd6fe` / `#faf5ff` |

### Neutral roles

| role                | dark                       | light     |
| ------------------- | -------------------------- | --------- |
| `canvas`            | `#0a0e16`                  | `#ffffff` |
| `surface`           | `#111827`                  | `#ffffff` |
| `panel`             | `#0c1322`                  | `#f8fafc` |
| `border`            | `#1f2942`                  | `#e2e8f0` |
| `text-primary`      | `#f4f8fc`                  | `#0f172a` |
| `text-body`         | `#e7edf5`                  | `#334155` |
| `text-muted`        | `#9aa6bd`                  | `#334155` |
| `text-faint`        | `#8995ad`                  | `#475569` |
| `on-accent`         | `#06100e`                  | `#ffffff` |
| `on-answer`         | `#06100e`                  | `#06100e` |
| `overlay` / `scrim` | `rgba(6,9,15,.72)` / `.75` | same      |

## Answer identity

`ANSWER_IDENTITY` is the single A–D recipe: accent fill, border, `text-on-answer`.
Meaning roles (`success` / `danger` / …) must never identify answers. Mono A/B/C/D
badges sit on `border-current bg-canvas/25`.

| identity   | accent    | dark border / tint                  | light border / tint   |
| ---------- | --------- | ----------------------------------- | --------------------- |
| `answer-a` | `#e69f00` | `#8a5f00` / `rgba(230,159,0,.14)`   | `#f3cf73` / `#fffbeb` |
| `answer-b` | `#56b4e9` | `#2f6d8a` / `rgba(86,180,233,.14)`  | `#bae6fd` / `#f0f9ff` |
| `answer-c` | `#3dbfa0` | `#237565` / `rgba(61,191,160,.14)`  | `#99f6e4` / `#f0fdfa` |
| `answer-d` | `#cc79a7` | `#7a4864` / `rgba(204,121,167,.14)` | `#f5d0e2` / `#fdf2f8` |

## Typography, motion, depth, radius

- Space Grotesk display/body; JetBrains Mono for badges, codes, numerals.
- Calm motion: `--rz-dur-base: .5s`, `--rz-ease-calm: cubic-bezier(.16,1,.3,1)`.
  Respect `prefers-reduced-motion`.
- Depth: accent `shadow-bloom-*` only. New radius: `rounded-rz-sm/md/lg/xl`.

## Atmosphere / scrim

`<Atmosphere recipe="photo">`: canvas → image → `--rz-scrim` → content (`z-10`).
`--rz-scrim` is `rgba(6, 9, 15, 0.75)` (lowest opacity that met AA on the X1 fixtures).
`<Atmosphere recipe="ambient">` is the no-photo auth/config recipe.

## Banned patterns

- Dialect-specific values or raw hex in `className`.
- `bg-white` / `bg-gray-*` / `text-gray-*` where a role exists.
- Neutral `shadow-*` / `drop-shadow*`.
- New bounce or overshoot easing.
- Encoding meaning with `answer-*`, or identity with semantic accents.
- Local background stacks outside `<Atmosphere>`.
- User-visible literal copy instead of an i18n key.

## Recorded deviations

1. Unknown persisted dialect falls back via `.catch(DEFAULT_DIALECT)` without discarding password/background.
2. Celebration motion (confetti, spotlight, podium SFX schedule, frozen `anim-*`) stays as-is.
3. Quizzes never persist dialect — only `GameVisualsConfig` may.
4. Room QR modules stay black-on-white for scanner reliability.
