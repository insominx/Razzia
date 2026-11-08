# 0004. Polls as a room lane

Date: 2026-11-08  
Status: Proposed

## Context

A host wants to ask the room a question with no right answer (what to do first in the lab, who presents first) inside the room the students already joined. Students identify once, by the name they gave on joining, and must not be asked again. Polls have to work without slides now, and a lecture deck (`0002`) should be able to start them later.

A quiz room is built around a right answer: `solutions` is required on every question, `RoundManager` scores, streaks and standings follow, and the reconnect caches (`lastBroadcastStatus`, `playerStatus`, `managerStatus`) restore whatever status a client last had. A poll that borrowed any of that would put the quiz's state at risk, and a live classroom has no room for a quiz that drifts.

## Decision

A poll runs in a **lane** beside the quiz, with its own state on the server and its own store on the client. The quiz's status machine, scoring and caches are never touched.

- **Hosting.** A lecture room (`0002`) made from the manager's Play tab ("Start lecture room", `game:createLecture`), so students join once and may join late. Polls run in the lobby and between questions, never during one.
- **One activity at a time.** `Game` owns the lock. `startPoll` needs a lecture room, an idle lane, and the lobby or the `results` phase (`RoundManager.isBetweenQuestions()`); otherwise it answers `notLecture` or `busy`. While a poll is open or showing its result, `start`, `nextRound`, `showLeaderboard`, `playQuestion` and `finish` do nothing.
- **`PollManager` owns an open poll.** Phases `idle → open → closed → idle`; one poll at a time. Votes are keyed by `clientId`, may change until the host closes the poll (at most 30 changes per client), and nothing closes the poll but the host. It imports nothing from `RoundManager`, `Game` or storage; `Game` hands it an `onSettled(record)` callback.
- **Delivery.** `poll:state` goes to each connected player individually, shaped for that player (their own `mine`; counts only after close), and to the manager in the host shape. It is never broadcast, and a client replaces its snapshot wholesale. `poll:tally` goes to the host only. A screen that has just opened sends `poll:sync`, because the player page never re-asks the server on arrival; the same snapshot rides `SUCCESS_RECONNECT.poll?`. A reloaded host, a reconnecting phone and a student who joins mid-poll all see the poll as it stands.
- **Anonymity is a disclosure rule, not a storage rule.** To let a vote move, the server holds `clientId → option` in memory while the poll is open. An anonymous poll (the default) never sends or saves a name, in any payload or record. A named poll shows names to the host only, never to phones. The poll's definition fixes which it is; the host does not flip it at launch.
- **Storage.** Definitions are `config/polls/<id>.json`: a question (up to 500 characters), 2 to 6 options (up to 200 each, distinct ignoring case) and `anonymous`. They are written atomically, authored in a Polls tab, and named by the client so a repeated save cannot duplicate one. Results are `config/poll-results/<id>.json`, apart from quiz `results/`: a copy of the question and options, the counts, the room's subject, the date, and names only for a named poll. `close()` freezes the counts and saves a final record. A room that closes with a poll still open (including on server shutdown) saves a `partial: true` record once, and a failed save is retried at close. Editing or deleting a poll changes neither an open poll, which holds a copy, nor a saved record.
- **Client.** `features/poll` mounts through `PollShell` on both game pages: a `role="dialog"` overlay above the quiz screen, with the screen under it inert so a stray key cannot reach its controls. The host's launcher appears only in a lecture room, outside a deck embed, when the lane is idle and the screen is the lobby or one between questions. The projector view follows `STYLE.md`: text never below 2.6875rem, two columns from four options.
- **Listing never throws.** `getPollMeta` and `getPollResultsMeta` catch, log and return `[]`, because `emitConfig` calls them and a problem in the poll folders must not stop the manager receiving its quiz config.
- **Seams for a deck, none built.** A poll is plain JSON with an id. `startPoll { gameId, pollId }`, `closePoll` and `dismissPoll` answer a `PollOutcome` union, as `playQuestion` answers a `LectureOutcome`, so a bridge command can later call the same `Game` methods. The deck bridge, its `PROTOCOL_VERSION` and `razzia-host.js` are untouched.

## Alternatives considered

- **A poll as a kind of question** (`kind: "poll"`), or a game-wide `scored: false`. Rejected: they change the scoring class, the quiz validator, the quiz screens and the saved result shape, which is the surface the lane exists to leave alone.
- **New `POLL_*` statuses, or a `poll` flag on existing ones.** Rejected: every status map, reconnect cache, `MANAGER_SKIP_BTN` and remount boundary would grow, and a stale status could win on reconnect. With poll state outside the status machine that hazard does not arise.
- **An `Activity` interface with the quiz round as an adapter.** Not built: a lock and one read-only getter are all two activities need. Revisit with a third.
- **A second room or PIN, a Socket.IO namespace, or a separate service with a signed identity handoff.** Rejected: students would join twice or carry a token to a second origin, for nothing that events on the same socket do not give. A namespace is only a transport; what protects the quiz is the separate state.
- **A quiz-less poll room, or a placeholder quiz.** Deferred: `Game` assumes a round, and a lecture room hosts polls today. Revisit if choosing a quiz for a poll-only moment chafes.
- **A poll typed in at launch.** Deferred: stored polls give a deck an id to start later.
- **Poll results in `results/` in the `GameResult` shape.** Rejected: `getResultsMeta` lists every file there and the Results tab expects `solutions`.
- **Votes that cannot change, or closing when everyone has voted.** Rejected: changing a vote was a requirement, and closing on the last vote would forbid it.

## Consequences

- Common, socket and web ship together (new events, optional `poll?` on both reconnect payloads, `polls` and `pollResults` on `ManagerConfig`). Mixed-version rolling deploys are unsupported. Never deploy during a class.
- A server restart loses an open poll and its votes, as it loses live games (`0002`). Saved polls and results are in the config volume and survive. The Docker image does not seed polls, so a fresh volume has none until the editor writes one.
- A host who forgets **Done** leaves the lane `closed` and quiz commands do nothing. A reload shows **Done** again, and the room's expiry closes it.
- A result that cannot be saved (the config volume is full or read-only) is logged, offered again when the room closes, and lost on a restart. The host is not told, as with a quiz result.
- Listing reads every file in `config/polls/` and `config/poll-results/` on each config send, as the quiz lists do. Measured at about 0.25 ms per result (50 ms at 200 results, 250 ms at 1,000). A cache or a cap is the lever if that folder ever grows large.
- Phones see counts only after the close, to avoid a bandwagon. Showing them live is a change to the player's snapshot shape alone.
- Vote changes are capped per client. No limit is keyed by address anywhere, because a classroom shares one.
- Quiz JSON, saved quiz results, statuses and scoring are unchanged. The existing suites pass unmodified apart from typed `ManagerConfig` fixture fields.
- Poll copy is in `poll.json` in all six languages. The es, fr, it and ja strings are checked for key parity only and want a native reader.
