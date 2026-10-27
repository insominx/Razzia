# 0002. Lecture mode and the deck bridge

Date: 2026-10-23  
Status: Accepted

## Context

A course lecture deck plays one quiz across a 90-minute lecture: students join near the start, each question runs on its own slide, the leaderboard follows, and the room holds for 10 to 25 minutes until the next quiz slide. Normal games assume a quiz played start to finish. Their lobby closes the moment the host's socket drops and removes players whose phones sleep, late joiners are refused after the start (0075c91: they would be counted as expected for a question they never saw), the host gets 5 minutes to come back, and nothing is saved unless the last question's podium is reached.

## Decision

A per-game `lecture` flag, set only by `game:createLecture` (manager auth as for `game:create`). Normal games behave exactly as before.

- **Questions by index.** `manager:playQuestion { gameId, index }` plays a question once, from the lobby (after the start countdown) or from results; any other phase answers `busy`, so the shared cooldown timer is never restarted under a running question. The ack returns a `LectureOutcome`. The host's own Next walks the unplayed questions and, past the last, finishes.
- **Ending.** `manager:showLeaderboard` never ends a lecture game. `manager:finishGame` sends FINISHED to everyone in the game and saves a result with the questions played. A lecture game that closes first (expiry, Exit, server shutdown) saves a `partial: true` result once.
- **Joining.** Members rejoin in any phase. Newcomers join in the lobby or between questions (phase `results`), never during one, so 0075c91's rule holds. A latecomer starts at 0 points and waits on `game:lectureNextQuestion`.
- **Holding.** A dropped host connection, lobby included, marks the game empty for 30 minutes; the host's explicit Exit still closes it at once. A dropped player in the lobby stays a member. A reconnecting lecture player's newest socket replaces the old one, which the server may not have noticed is dead for 45 s.
- **State for the host.** `manager:lectureState` (`inviteCode`, `total`, `played`, `current`, `finished`) rides on `gameCreated` and `successReconnect` and is pushed when a question starts and on finish. Between questions the host's results and leaderboard screens repeat the PIN.
- **Deck bridge.** In a frame opened with `/manager?embed=deck` by an allowed parent (`https://426.csumb.workers.dev`, `http://localhost:*`, `http://127.0.0.1:*`) and only as a direct child of the top window, `features/deck` accepts `postMessage` commands (`hello`, `ensureGame`, `close`, `play`, `leaderboard`, `finish`, `review`, `visibility`, `controls`) and posts `ready`, `status` (on change and every 5 s), `result`, `error` and forwarded navigation keys. `review { question | null }` shows a played question's results screen again (kept in memory per game, silent, with the host controls off) in place of the live screen, without touching the game; the next screen from the game, or `null`, ends it, and `status` reports `reviewing` and `reviewable`. It remembers its game per quiz in the frame's storage, retries `manager:reconnect` for 90 s when the server still holds the frame's old connection, and keeps Razzia silent while the deck hides it. The deck's side of the contract is `razzia-host.js` in the CST 426 Lecture 4.1 deck folder; change both together.

## Alternatives considered

- **Drive the existing events from the deck (startGame / nextQuestion).** Rejected: the lobby would not survive the first 20 minutes of a lecture, late joiners would be refused, and re-entering a slide would advance the game.
- **A separate hold status between questions.** Rejected: the existing `results` phase already holds indefinitely; joining is gated on it instead.
- **Server-side takeover by the same clientId for the host.** Rejected for now: two hosting tabs would steal the game back and forth. The bridge retries instead.
- **A `frame-ancestors` header.** Not added: a third-party frame gets a partitioned identity with no manager login, and the header could block other embeds.

## Consequences

- Common, socket and web ship together (new events, payload fields and statuses' optional `note`).
- A server restart still loses live games and logins; the deck recreates a lobby on its next Razzia slide and the room rejoins.
- Saved results may now be partial; `GameResult.partial` marks them.
