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

| role                | dark                                                     | light     |
| ------------------- | -------------------------------------------------------- | --------- |
| `canvas`            | `#0a0e16`                                                | `#ffffff` |
| `surface`           | `#111827`                                                | `#ffffff` |
| `panel`             | `#0c1322`                                                | `#f8fafc` |
| `border`            | `#1f2942`                                                | `#e2e8f0` |
| `text-primary`      | `#f4f8fc`                                                | `#0f172a` |
| `text-body`         | `#e7edf5`                                                | `#334155` |
| `text-muted`        | `#9aa6bd`                                                | `#334155` |
| `text-faint`        | `#8995ad`                                                | `#475569` |
| `on-accent`         | `#06100e`                                                | `#ffffff` |
| `on-answer`         | `#06100e`                                                | `#06100e` |
| `dot`               | `#29354d`                                                | `#cbd5e1` |
| `overlay` / `scrim` | overlay `rgba(6,9,15,.72)`; photo scrim is a radial wash | same      |

## Answer identity

`ANSWER_IDENTITY` is the single A–D tile recipe: **accent stroke, tinted fill,
`text-answer-*-ink`**. The dark tint is the accent composited at ~8% over
`canvas` rather than an alpha, so a tile still occludes the photo Atmosphere
behind it. `ink` is a separate role from `accent` because the light register
needs a darkened letter to stay legible on the pale tint.

`ANSWER_BAR` is the strokeless `accent` fill. Use it only where the mark's
_length_ carries the quantity, as the reveal chart's bars do: a tint there reads
as empty, and a stroke reads as a frame around a track a few pixels tall.

`ANSWER_INK` is identity carried by type alone — the chart's A–D letter, its
percentage and its count sit beside the bar with no fill or stroke to lean on.
A share of zero keeps `text-text-primary`; the percentage joins the slot's ink
only once it has weight.

Meaning roles (`success` / `danger` / …) must never identify answers, though
they may layer on top (the reveal check / cross). On the reveal chart that
means a filled success disc on every solution (danger mark on the rest), a
success-accent frame so a zero-share correct slot still reads as the answer,
and the incorrect quantity receding and desaturating. The bar fill itself stays
`ANSWER_BAR`.

Mono A/B/C/D badges sit on `border-current bg-canvas/25`, inheriting the ink.

### Answer reveal

The shared player/manager answer grid reserves every 2–4 answer slot from its
first paint. After a one-second pause, slots reveal in A–D order with a
two-second opacity fade each. Each fade starts three seconds after the previous
one, leaving a one-second beat after a fade completes.
`@razzia/common/utils/answer-reveal` is the timing authority. The server owns
the answering unlock, so visibility never opens submission, the timer HUD, or
the answers music by itself. While revealed but locked, keep answer copy at
`text-primary`, suppress hover movement, and render the identity border/tint on
a separate decorative layer at low opacity with a 2 px blur and low saturation.
Never blur the label or answer copy. When the server opens answering, transition
every decorative layer together through a brief brightness/saturation overshoot
before settling at its full identity surface as the timer begins. Locked tiles
must have no hover motion or glow. Active tiles also stay positionally stable,
but hover and keyboard focus immediately grow one soft A–D color-matched shadow
around the panel. Render that glow as a dedicated identity-colored halo layer:
reveal its strong 3 px edge immediately on hover/focus, then ease its 18 px blur
and 1.03× expansion outward over 300 ms. Fade it quickly on exit. Do not rely
on a delayed box-shadow interpolation, add a persistent second ring, or let the
halo blur the panel or answer copy. Reduced-motion surfaces show every reserved
slot immediately and snap between surface states while still waiting for that
same server unlock. Protocol (same-status payload, `manager:unlockAnswers` vs
`manager:abortQuiz`, reconnect restamp) is in
`docs/adr/0001-server-clocked-answer-reveal.md`.

| identity   | accent    | dark border / tint / ink       | light border / tint / ink         |
| ---------- | --------- | ------------------------------ | --------------------------------- |
| `answer-a` | `#ffab24` | `#8a5a18` / `#1e1b17` / accent | `#fcd34d` / `#fffbeb` / `#b45309` |
| `answer-b` | `#42aeff` | `#255f9c` / `#0e1b29` / accent | `#93c5fd` / `#eff6ff` / `#1d4ed8` |
| `answer-c` | `#40d693` | `#1f6f4d` / `#0e1e20` / accent | `#86efac` / `#f0fdf4` / `#047857` |
| `answer-d` | `#9370e7` | `#4a2f86` / `#151627` / accent | `#c4b5fd` / `#f5f3ff` / `#6d28d9` |

## Typography, motion, depth, radius

- Space Grotesk display/body; JetBrains Mono for badges, codes, numerals.
- Calm motion: `--rz-dur-base: .5s`, `--rz-ease-calm: cubic-bezier(.16,1,.3,1)`.
  Respect `prefers-reduced-motion`.
- The question intro renders only the localized `Question #N` label. Fade it in
  over 500 ms, keep the intro beat at one second total, then reuse the
  `game-question-number` layout identity to translate it above the question
  while the question text/media fade in. Keep that label above the
  question through answers and manager responses; do not duplicate progress in
  the top bar. The shared card fills the `max-w-7xl` game column. It always
  mounts every sentence so later lines are reserved in place: one measured
  lift to that finished center, then 500 ms linear fades. Earlier sentences
  stay and do not move. The server still waits 950 ms after a one-sentence
  entrance, or `500 + max(400, chars * 80)` after each earlier sentence of a
  longer prompt (last line is only the 500 ms fade), before the
  reading bar and prompt cooldown. Reduced motion skips the lift, shows every
  sentence immediately, and still waits for that same room clock. A reconnect
  with elapsed prompt time sits at the final position and does not replay the
  lift.
- The live `SHOW_QUESTION` → `SELECT_ANSWER` boundary reuses the
  `game-question` Motion layout identity. Keep identical width and padding in
  both states and translate it into its answer-screen position over 950 ms with
  the calm easing; size-changing layout animation can reflow the title before
  Motion applies its transform. Do not add a competing `anim-show` entrance.
  Reduced motion sets the layout transition duration to zero.
- Question text and media float directly on the atmosphere. The shared layout
  wrapper must not add a panel background, border, or rounded container.
- On manager responses, keep a deliberate vertical gutter between the response
  distribution and the answer-option cards (`gap-10`, increasing to
  `md:gap-12`). Let the response content remain the flexible region so this
  spacing comes from available whitespace instead of crowding or displacing the
  option grid.
- Depth: accent `shadow-bloom-*` only. New radius: `rounded-rz-sm/md/lg/xl`.
- `.rz-dotfield` is the only sanctioned decorative texture: a `--rz-dot`
  radial-gradient grid, kept low-opacity so it recedes behind a photo.

## Atmosphere / scrim

`<Atmosphere recipe="photo">`: canvas → `object-contain` image → optional `--rz-scrim` → content (`z-10`).
`--rz-scrim` is a light center wash for bright photos. Dark uploads skip the wash and use `--rz-dark-photo-lift` so gold/rim detail stays visible.
Photo atmosphere placement defaults to `viewport` (`fixed`) for live game screens.
Use `placement="container"` (`absolute`) only inside a positioned, overflow-clipped preview such as `/dev/gallery`.
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
3. Quizzes never persist dialect or sound theme — only `GameVisualsConfig` may.
4. Room QR modules stay black-on-white for scanner reliability.
