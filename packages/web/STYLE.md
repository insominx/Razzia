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

An answer is a **letter block**: a solid square of its accent, the letter in
`on-answer` (near black, at least 7.9:1 on every accent). Beside it sit the
words in `text-primary` on **dark glass** (`glass`, `#101623`), a solid surface.
Identity is the block and nothing else, so no tint or hairline carries it: a
lit room lifts black to grey and would wash either one away. `AnswerTile` is the
only component that draws it, reading the accent from one `--c` property.

| answer | accent    | note                                 |
| ------ | --------- | ------------------------------------ |
| A      | `#ffb020` | amber                                |
| B      | `#4aaeff` | blue                                 |
| C      | `#ff82b9` | pink. Never green: green means right |
| D      | `#d7dce6` | ice                                  |

Green and red mean only right and wrong, and urgency is orange (`warning`).
Meaning roles must never identify answers, and answers never carry meaning,
though a verdict may layer on top (the success frame and check on a correct
tile). The accents are separated by at least 15 of colour difference under
deuteranopia, and their brightness differs by 1.8x at most, so no answer pulls
the eye.

`ANSWER_IDENTITY` / `ANSWER_BAR` / `ANSWER_INK` (`accent` + `border` + `tint` +
`ink` per answer) remain for the **studio** only: the quiz editor and result
modal, where a tinted tile on the light register is fine. The game never uses
them.

### Tile states

`data-state` on the tile drives everything:

- `locked`: shown, not yet answerable. The block is unlit (dark, low chroma) and
  the words stay at `text-primary`. Never blur or dim answer copy.
- `active`: answerable. The block is lit. Bright means go. A phone's tile gives
  press feedback on `:active`, before the server replies.
- `picked` / `faded`: this phone's own pick (white frame) and the others
  stepping back. Set on the tap itself; a pick is sent once.
- `result`: a vote count, no verdict yet. The share lands in the block and runs
  along a rail under the words, so nothing crosses the copy.
- `correct`: the success frame and glow plus a check badge. `wrong`: stepped
  back to 55%.

A tile is a real `button` only where somebody can tap it (a phone with answers
open). On the projector and in results it is a plain panel, so it takes no
hover or focus ring it has no use for.

### Answer reveal

The shared answer grid reserves every 2–4 answer slot from its first paint.
After a one-second pause, slots reveal in A–D order with a two-second opacity
fade each. Each fade starts three seconds after the previous one, leaving a
one-second beat after a fade completes.
`@razzia/common/utils/answer-reveal` is the timing authority. The server owns
the answering unlock, so visibility never opens submission, the timer HUD, or
the answers music by itself. Revealed tiles are `locked` until the server opens
answering, then every block lights together as the timer begins. Reduced-motion
surfaces show every reserved slot immediately and snap between states while
still waiting for that same server unlock. Protocol (same-status payload,
`manager:unlockAnswers` vs `manager:abortQuiz`, reconnect restamp) is in
`docs/adr/0001-server-clocked-answer-reveal.md`.

### Answer grid

`ANSWER_GRID_TRACKS` + `answerSlotPlacement` lay out every A–D grid. On the
stage the grid runs four tracks and each tile spans two, so the odd last tile of
a three-answer question starts on track two and sits centred under the pair. On
a phone the tiles are one column, pinned under the prompt. The editor breaks on
its `@container` (`@xl`) because its tiles sit between two side panels.

## Medals

`MEDAL` (gold / silver / bronze, `bg-medal-*` + `border-medal-*-border` +
`text-on-medal`) marks ranks 1–3 on the leaderboard badge and the podium, and
nothing else. They are physical metal colours, identical in both registers:
gold `#f5c542` / `#9a7412`, silver `#c7d0dc` / `#6b7688`, bronze `#d08a4c` /
`#7a4a22`, on-medal `#06100e`. Ranks 4+ use the neutral `border` / `surface` /
`text-muted` badge.

## Typography, motion, depth, radius

- Space Grotesk display/body; JetBrains Mono for badges, codes, numerals.
- **The stage.** The host's game page composes like a slide. `useSurface` sets
  `data-stage` on `<html>` for a landscape window 1024 px wide or more, and the
  root font size becomes `min(100vw / 120, 100vh / 67.5)`: exactly 16 px at
  1920x1080, 10.67 px at 1280x720. Every rem length scales with the frame, so
  the projector sees one composition at any size. Style it with the `stage:`
  variant, which applies only under `data-stage`. Do not use `xl:` / `2xl:` on
  a stage screen, because a viewport breakpoint would give 1280 and 1920
  different layouts. A narrow or portrait window, and every phone, fall back to
  the base (phone) styles.
- **Room-readable type.** Nothing the room has to read is under 2.6875 rem
  (43 px at 1080p, the smallest the back row can make out). Only labels
  (`text-xs`, the question label, HUD labels) may be smaller. Nothing important
  sits in the bottom 8% of the frame (heads in the front rows hide it), so the
  stage ends with a `5.4rem` spacer. The teacher's controls float over the top
  corners and take no layout room.
- **One type tier per question**, decided from its text alone
  (`utils/type-tier.ts`), so the prompt keeps its size from the question screen
  to the answers to the results and the shared-layout morph never reflows. The
  prompt is context lines (smaller, `text-body`) over the **ask**, the last
  line, which is the largest thing on screen. Answer copy steps 50 / 46 / 43 px
  by the longest answer. The tiers are an estimate; the Director's fit report
  measures the real layout of every real question and is the judge.
- **Phones keep the answers on screen.** The phone page is one screen tall
  (`h-dvh`): tiles are pinned under the prompt, which scrolls above them and
  rests on the real question at its end. The stage page instead grows, so a
  layout that does not fit shows as a page that scrolls and as a failure in the
  fit report.
- Dialogs and their overlays enter with `animate-rz-fade-in` (opacity only, so
  it composes with the centring translate). Toasts take the `surface` /
  `border` / `text-primary` roles in both registers.
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
- Manager results are the answer tiles themselves, with each share in its block
  and on its rail, in the same place the grid sits while answering. The row
  between the prompt and the grid is the clock while answering and the headline
  in results, the same height in both so the screen changes in place.
- Depth: accent `shadow-bloom-*` only. New radius: `rounded-rz-sm/md/lg/xl`.

## Atmosphere / scrim

`<Atmosphere recipe="photo">` is the light behind the show, made in code: a deep
navy gradient (`rz-backdrop`), one glow per **mood** (`rz-mood-*`) that
crossfades as the game moves, and, in the full show only, beams (`rz-beam`) at
the opening and the finale and embers (`rz-ember`) in the last seconds. There is
**no photo by default**, so a phone downloads nothing for it. A teacher's
uploaded background sits above the gradient and under the glow (the image is
positioned, because an unpositioned one paints under the layer behind it and an
upload would never show); its `--rz-scrim` wash for bright photos and
`--rz-dark-photo-lift` for dark ones are unchanged. The light register (the
studio) stays a plain canvas.

Moods follow the game's status (`stores/mood.ts`): `teal` for the lobby and the
title, `cool` while playing, `gold` for the finale. A screen may hold another
with `useMoodOverride`: the room runs `warm` for the last five seconds of
answering. Photo atmosphere placement defaults to `viewport` (`fixed`) for live
game screens; use `placement="container"` (`absolute`) only inside a
positioned, overflow-clipped preview. `<Atmosphere recipe="ambient">` is the
no-photo auth/config recipe.

## The line, the clock and the count

- **The line** (`ChargeLine`) is one bar of light between the question and the
  answers. It grows dim from the centre across the prompt's cooldown and the
  answer reveal, so it is whole exactly when answering opens; it then goes
  bright and burns in from both ends toward the clock for the length of the
  window, turning hot for the last five seconds. On the stage it runs along the
  bottom of the clock row; on a phone it crosses the top of the screen. It is
  plain CSS over the server's stamps (`charge-line.ts`), so it needs no timer
  and a screen that mounts late (or after a reconnect) starts partway along.
- **The clock** counts to the answers opening ("Opens in 7"), then the time
  left. In the last five seconds the digit swells, heats to `warning` and pulses
  on every tick, and the room runs warm. **The count** is how many are in.
  Each is one large number with one small label.
- The question screen holds the same bottom structure the answers screen has
  (the clock row, the room the tiles will fill, the bottom 8%), so the prompt
  never moves when the answers arrive.

## The reveal

The verdict is staged on one server-stamped clock (`result-reveal.ts`,
`docs/adr/0003-staged-result-reveal.md`), so the room and every phone land each
beat together. Big moments go **brighter, not darker**: in a lit room a
blackout dims the frame by a fifth, while a full-frame fill brightens it almost
five times. So TIME, the verdict and the winner each take the whole frame in one
solid colour with pure black type (`FrameHit`), and nothing moves or shakes over
text.

| beat     | at     | the projector                                                               | a phone                         |
| -------- | ------ | --------------------------------------------------------------------------- | ------------------------------- |
| TIME     | 0 s    | floods hot orange, "TIME" (or "ALL IN" if everyone answered)                | holds                           |
| count    | 0.6 s  | rails grow from the letter blocks, smallest first; shares count up inside   | holds                           |
| question | 2.25 s | everything but the most-picked answer goes dark; a heartbeat. Ties stay lit | holds                           |
| strike   | 3.0 s  | the right answer floods the frame from its tile, holds, collapses into it   | colour and glyph, nothing else  |
| settled  | 4.5 s  | the final grid; the headline ("Only 3 of 18 got it. 8 fell for B.")         | after 2 s: points, streak, rank |

The flood always leaves the **right** tile, so the room reads whether the light
stayed or jumped from what was lit during the question. A phone's colour is
success green, danger red, or grey for no answer. Calm, Silent and reduced
motion keep the schedule but drop the flood and the spotlight: the verdict
happens on the tile, and TIME is said in the headline's place. A client that
arrives after a beat (a reconnect, a woken phone, a lecture review) is settled:
no flood, no sound, no buzz.

## Phones

A phone's own game, in three screens beside the verdict (and the tap itself).

- **On the tap** (`Answers`): the tile you pressed is picked and the rest step
  back, and a "Locked in" pill appears between the clock and the count at once,
  before the server's own screen arrives.
- **Locked in** (`Wait`): the tile you picked, held, with "Locked in" over it
  and "N of M in" counting up as the room answers. Tapping it nudges it. Any
  other wait (the lobby, a lecture hold) is the plain spinner; in the lobby it
  also says "You're in, Ada" and how many are here.
- **Standing** (`Standing`, `SHOW_STANDING`): sent to every phone when the host
  shows the leaderboard, because `SHOW_LEADERBOARD` only reaches the host. Your
  place, ▲/▼ since the last question (nothing after the first one, whose
  "before" is only the join order), the leader and the players around you, and
  the gap to the next one up.
- **Ending** (`PlayerFinished`): a medal disc for ranks 1–3 with confetti that
  bursts and stops, a plain place for everyone else, and points and place among
  all who played.

## Board and ceremony

- **Leaderboard**: a bar race. A bar's length is a score, as a share of the
  longest new bar. It holds the old standing 1.5 s, grows the bars and rolls the
  odometers until 3 s (`BOARD_REORDER_MS`, the score's own overtake beat), swaps
  the rows, marks who moved, and then says one thing (`boardCommentary`: new
  leader, biggest climber, someone into the top five, biggest gain, a close
  race, or who leads). It works for a room of one.
- **Podium**: third, second, a roll, then first, on the score's clock
  (`podiumTimes`, pulled earlier for each place nobody holds). Blocks are solid
  medal colours risen on springs. First place takes the whole frame in gold with
  the winner's name (`FrameHit kind="winner"`), then clears to the podium while
  confetti bursts and stops. Calm and Silent keep the sequence but not the flood
  or the confetti.

## First impressions

- **Lobby** (`Room`): the join address without its scheme, the PIN on split-flap
  cards that flip in left to right, a QR, and a seat for every player that flips
  solid as the name arrives. Names shrink in three steps as the room fills; up to
  sixty seats are drawn (empty ones dashed) and the rest are counted as "+N more".
  Kicking still goes through a confirmation.
- **Start**: the title with a pass of light, then one lamp per second of the
  countdown. **GO** belongs to the first round card (`useLaunchStore`), because
  the lamps end exactly as it replaces them; a card nobody counted down to has
  no GO.
- **Round card** (`Prepared`): "Question 4 of 6" and "Final question" on the
  last (also on the question and answer screens, so the label never changes under
  the morph), the big number, and one pip per question; a deck of more than twelve
  draws a progress bar.
- **Join**: the PIN cell and the name field take focus on arrival, and a wrong
  PIN or a refused name shakes the field. The wordmark is the brand colour.

## The score

Sound is one adaptive WebAudio score (`features/game/audio/`), not per-screen
`useSound` calls. Screens ask for a scene (`score.start(...)`) or a cue
(`score.cue(...)`); they never touch a context. Scenes are stamped from the
server's clock, so the room's music and every phone's chord land together, and a
screen that arrives late finds its beats in the past and plays nothing. A
reviewed question is called with `silent: true` and cannot cut the live game's
bed. The score rises a semitone each round (capped at five) and the final
question adds a layer. The `classic` and `techno` packs play through the same
calls via a legacy adapter, loaded when they are about to play and unloaded after.
`show` is the default pack; it is a setting, so an old game keeps its own.
Volume, mute and the deck's suppression still go through Howler's master gain.

A question with its own audio or video keeps the answers bed out from under it,
as the answers loop always did.

## Rehearsal

The quiz editor's **Rehearse** button saves what is on screen (unsaved edits
included) to the browser's `localStorage` and opens `/rehearse` in a named tab.
That page plays the draft through the real screens (`FrameStage`, the same
composition the Director uses) in an iframe at the projector's true size, or a
phone's, scaled to fit: the question, the answers, the count with the room
right or wrong, and on the phone the locked-in screen and the three verdicts.
Arrow keys step screens and questions, `R` plays a screen again, `P` swaps
projector and phone; Show intensity applies. It needs no login and no game, it
warns about a question the projector may not hold (`question-fit`), and a second
Rehearse refreshes the open tab in place. Empty parts show a stand-in rather
than an empty tile. The shared builders (`features/rehearse/screens.ts`) take a
question, not a quiz id, which is what keeps the Director's real quiz text out
of the production bundle.

## Show intensity

A per-game setting in the Visuals tab, snapshotted at game creation like the
sound theme. **Full** is everything. **Calm** keeps the picture and drops the
full-frame hits, the spotlight, beams and embers (the verdict happens on the
tile); its music is 12 dB lower with no groove while answering. **Silent** is
Calm with no audio. A device set to reduced motion gets Calm's visuals, and
also drops the count animation; audio does not follow it. Read it with
`useShowIntensity` / `useCalmVisuals`.

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
2. The celebration is staged, not looped: the podium's roll, the winner's gold flood and a confetti burst that stops, and the same for a phone's top three. Confetti colours are read from the answer, brand and gold tokens instead of the library's rainbow.
3. Quizzes never persist dialect or sound theme — only `GameVisualsConfig` may.
4. Room QR modules stay black-on-white for scanner reliability.
