# 0003. Server-clocked staged result reveal

Date: 2026-11-06  
Status: Accepted

## Context

The results used to arrive as one frame: the votes, the right answer and the points together, the moment answering ended. The room never got a beat in which to wonder, and the phones changed colour whenever their own socket happened to deliver. The reveal is now a short performance (TIME, a count, a question, a strike), and the projector and every phone have to land each beat together without the server holding the room back or waiting on anyone.

## Decision

Keep the existing statuses and stamp them, as `0001` does for the answer reveal.

- `SHOW_RESULT` (a phone) and `SHOW_RESPONSES` (the projector) carry `resultsAt`, the moment answering ended, and `serverNow`, when that payload was sent. The server sends both at once, so `resultsAt === serverNow` on first delivery.
- `@razzia/common/utils/result-reveal` owns the schedule: TIME at 0 s, the count from 0.6 s (rails grow smallest first, 300 ms apart), the question (everything but the most-picked answer goes dark) from 2.25 s, the strike at 3.0 s with 1.5 s of flood, so the grid settles at 4.5 s. The headline lands at 4.45 s, the fastest player at 4.6 s and a phone's details at 5.0 s. Elapsed is `serverNow - resultsAt` plus the time since the payload arrived on this device's own clock, so a phone with a wrong clock agrees with the room.
- **The server never waits for it.** The staging adds about 4.5 s to a round only because a host naturally lets it play; pressing Next skips ahead, and `showLeaderboard` is unchanged. The clock decides only what to draw.
- Reconnect re-stamps `serverNow` (`restampReconnectStatus` now covers these two statuses too), so a client that returns mid-reveal joins part-way and one that returns after it is already settled.
- **Settled means silent.** A payload with no stamps (a lecture deck's saved result, one from before this) and a client that arrives after the beat it would have buzzed or sounded for make no flood, no sound and no haptic. A client sounds a beat only if it is there when the beat comes.
- **A kept result is settled.** The host page keeps each question's results so a deck can show them again (`review`) and so they survive a reload. It keeps them without `resultsAt` and `serverNow`: a stamped copy shown later would be taken as freshly arrived and replay the whole reveal. The live screen keeps its stamps.
- The phones need to know more than the room's chart, so `SHOW_RESULT` also carries `picked` (the slot tapped, or `null` for no answer), `correctAnswers`, `previousRank`, `streak`, `totalPlayers` and `behind`. `SHOW_RESPONSES` carries `totalPlayers` and `fastest`, the quickest right answer, recorded as `elapsedMs` on each `Answer`.
- All of these are optional on the wire, so older payloads, saved reviews and the Director's fixtures still render.
- The prompt's charge line gets the numbers it needs the same way: `SHOW_QUESTION.answerCount` and `SELECT_ANSWER.cooldown`, so the line can grow across both screens and finish exactly when answering opens.

## Alternatives considered

- **A new status per beat.** Rejected, as in `0001`: every status map, reconnect cache and remount boundary would grow, and the server would have to sleep between beats and race the host's Next.
- **The server sleeping through the beats before sending the verdict.** Rejected: it delays the host's controls, and a phone that reconnects during the sleep has nothing to show.
- **Client-only timing from the moment each socket delivers.** Rejected: the room and the phones would disagree by network latency, which is the whole of what the stamps remove.

## Consequences

- Common, socket and web ship together; mixed-version rolling deploys are unsupported, as in `0001`. Never deploy during a class.
- Quiz JSON and saved results are unchanged. A saved result has no stamps, so a lecture deck's review is the final grid with no flood and no sound.
- Calm, Silent and reduced motion keep the schedule but not the flood or the spotlight: the verdict happens on the tile.
- Pacing changes must update the common schedule, the web projection tests and `STYLE.md` together.
