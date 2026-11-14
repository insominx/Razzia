# 0005. Polls from a deck

Date: 2026-11-08  
Status: Proposed

## Context

A lecture deck (`0002`) holds a quiz and wants polls in the same room: a question near the start to learn about the audience ("what do you teach?"), then quiz questions for the content. The instructor drives everything from a clicker. Students join once. The polls lane (`0004`) already runs a poll beside the quiz, but from the manager page: its definition is a stored file, started by id, and its screen is built for the host's own monitor.

In a deck the host's screen is the projector. Four things follow:

- The question is slide text anyway (it is the fallback, the thumbnail and the printout), so a copy stored on the server is a second source that can drift, and changing a question would mean a data sync and a deploy.
- A screen the whole room watches invites following the crowd, may show names, and should not show a button.
- The deck must survive a Razzia that is old, down or confused, and a Razzia that is new must not break a deck that has never heard of polls.
- The slide's own picture should show behind the poll, as it does behind quiz screens, and nothing of the lobby (PIN, QR code, every player's name) may show through it.

## Decision

- **The poll definition rides the command.** `manager:startPoll` accepts `{ gameId, poll: { id, question, options, anonymous?, live? } }` as well as `{ gameId, pollId }`. The definition passes the same `pollValidator` as a stored poll (question up to 500 characters, 2 to 6 options of up to 200, distinct ignoring case), and its `id` is a slug (`POLL_SLUG`, 1 to 64 characters, also `isSafeId`). Nothing is written to `config/polls/`: the open poll holds a copy, and the result it leaves keeps the text that was asked under the deck's id. Only the five named fields are read, and a list longer than six options is refused before it is walked. Outcomes are the lane's `PollOutcome` plus `invalid`, checked in the order not a lecture room, not the manager, invalid, busy, so a stranger learns nothing about a definition. A definition wins over an id when both are sent.
- **What already ran.** `LectureState.pollsDone` lists the polls that closed in this room, oldest first, at most 50, each as `{ id, counts, total }` and never a name. It is absent until the first poll closes, so a lecture room without polls sends what it always did. It rides `gameCreated` and `successReconnect` and is pushed when a poll closes, so a reloaded frame, and the deck behind it, learn what already ran and do not run it again.
- **Three bridge commands, one block of state, protocol version 1.** `startPoll { poll }`, `closePoll` and `dismissPoll` map to the three events with acks. The state gains `features` (always sent: `poll`, `pollInline`), `poll` (null when polls are supported and none shows, absent when they are not) and `pollsDone`. Version stays 1: an old deck ignores the new fields, and an old Razzia ignores the new commands (`parseDeckCommand` returns `null`), so the deck reads `features` before sending one. A version bump would make every existing deck refuse a new Razzia. A command that would run late is never queued: a start that waited for the page to attach could open a vote on whatever slide the deck had reached, so an unattached page answers `ignored` with reason `notAttached`. `invalid` also posts `error { code: "pollInvalid" }`. Names never cross the bridge.
- **The projected view is made safe in Razzia, not left to deck CSS.** In a deck's frame: a sealed poll shows the question, the options and "n of m voted" and no bars until the close (`0004`); who voted for what is never drawn, even for a named poll (they are saved in the result and shown on the manager page afterwards, and the line above a named poll's question says so: names are saved and not shown here); Close and Done show only while the presenter has Razzia's controls up (the deck's Q key), because the deck closes and dismisses from the clicker; the poll frame's own fill goes clear under `data-backdrop="slide"` so the slide shows through; the quiz screen under the poll is hidden (`visibility`) and inert but stays mounted, so the lobby's PIN, QR code and names never show through a clear frame and the quiz's own state is untouched; the lobby's music bed and join chimes do not play under a poll, because the lobby stays mounted (until 2026-11-13 the page's sound was off while a poll showed; see that amendment); and the poll frame hands its keys back to the deck (`data-deck-keys`), because `PollFrame` is a dialog and the bridge drops keys from inside any dialog, which would otherwise stop Q and the forward keys reaching the deck after a click in the frame.
- **Where the deck's side lives.** The deck's half of the contract (the poll-face markup, the key table, the failure matrix) is in the course repository's shared host runtime, `Tools/razzia-host/`. As with `0002`, change both together.

## Alternatives considered

- **Stored polls started by id, as the lane does today.** Rejected for decks: the heaviest part of the quiz pipeline (a data sync and a publish per change) for a question that has no answer key and is public on the slide anyway.
- **Bump `PROTOCOL_VERSION` for the new commands.** Rejected: the envelope checks `v` is exactly 1, so every deck already taught would refuse the new Razzia. Additive fields and a `features` list cost nothing.
- **Queue a poll command like a question.** Rejected: a question queued past a slide change plays the wrong question, but a poll opened late is worse, because it holds the whole room and the phones.
- **Show names on the projector for a named poll.** Rejected: `0004` says "to the host only", and in a deck the host's screen is the room's. The names are saved, which is what the course's team polls need.
- **Unmount the quiz screen under a poll.** Rejected: the lobby's state (roster, PIN, countdown, audio) would restart when it came back. Hiding it keeps it intact.
- **Title-only rooms, so a deck with polls and no quiz can have a room.** Deferred, with the reasoning of `0004`: the first deck with polls also has a quiz. `game:createLecture` still takes a quiz id.

## Consequences

- Ships with the polls lane (`0004`) and the sealed default, in one publish; common, socket and web deploy together as before. A rolled-back Razzia leaves every deck usable: a poll face on an old Razzia is a slide with a question on it.
- A poll cannot start once the quiz has finished (the round is over, so `startPoll` answers `busy`); a closing poll goes before the podium.
- `pollsDone` is bounded at 50 entries. A runaway client cannot grow it further.
- A deck must read `features` before it sends a poll command, and treat `busy` for an id it just started as success.
- A poll's id is a label, and a deck keeps its labels unique. Two polls with the same id in one room would let a phone's late vote for the first land in the second, because a vote names its poll by id. A deck runs each poll once per room, so this does not arise; a room made by Restart is a new room.
- A start that is not even shaped like one (a field of the wrong type, a list far too long) is answered `error pollInvalid` by the page, so the deck can say why nothing opened. While a poll shows, the bridge answers a quiz step `ignored` with reason `busy` rather than reporting it done.
- The poll's own sealed or live setting is one rule for every start: a poll from a deck is sealed unless its slide says live.

## Amendment, 2026-11-10: a deck opens its polls directly and shows their results again

The instructor asked that, with Razzia working, the deck never stop on the authored question (forward onto a poll opens it) and that going back to a closed poll show its result as it was left. The deck side is the course runtime's (CST-426 task 0119, `plan.md` revision 2). Razzia's side, advertised as the feature `pollReview`:

- **A deck poll runs once per room.** `startInlinePoll` answers `alreadyRan` for an id that has closed in the room. `pollsDone` no longer drops its oldest entry; at 50 a new start answers `full`. Stored polls, started from the manager's own launcher, still repeat. This replaces "a deck runs each poll once per room" above as a rule the server keeps.
- **A new deck poll replaces a closed result in one step.** `startInlinePoll` accepts while the lane holds a _closed_ poll, and clears it as it opens the new one, with one state emit. A deck going from one poll's result to the next therefore never shows the lobby, its PIN or names in between. An open poll still answers `busy`, and the stored-poll launcher keeps `0004`'s idle-lane rule.
- **Close and dismiss can name their poll.** `manager:closePoll` and `manager:dismissPoll` accept an optional `pollId` (a slug). A name that is not the poll on the stage answers the new outcome `notCurrent` and changes nothing; a malformed one is refused the same way rather than run unscoped. Without it they act as before, which is what the host's own Close and Done send. The bridge's `closePoll` and `dismissPoll` also take an optional `gameId` and answer `notCurrent` without emitting when it is not the attached game, so a late command from before a Restart cannot reach the new room.
- **`pollsDone` keeps the wording.** Each entry now carries `question`, `options`, `anonymous` and `live` beside `id`, `counts` and `total`, built field by field at the close and never with a name. It lives only in the in-memory lecture state; no saved file changes. The bridge still tells the deck `{ id, counts, total, partial? }`.
- **`reviewPoll { id | null }`.** A bridge command that shows a poll from the room's `pollsDone` again on the manager page in the deck's frame, or (null) stops. It is local and silent: the room, its stage and the phones do not change. The state reports `reviewingPoll`. The review covers the stage and the lobby, and uses the live result's own layout with `PollBars settled` (final widths and numbers, no grow, tick-up, stagger or fade), so it looks exactly like the result after its reveal. It comes back after a manager page reload, from the lecture state, unlike a quiz question's review.

A deck needs all of `poll`, `pollInline` and `pollReview` to drive polls; on a Razzia without `pollReview` its poll faces are plain slides. Without Razzia, or after the room has closed, a closed poll's result cannot be shown again.

## Amendment, 2026-11-13: arrivals on the projector, and the poll's own sound

`0004`'s amendment of the same date lets the host's screen show each vote arrive. In a deck's frame that screen is the projector, so:

- **A sealed or named poll's arrivals name who has voted, on the projector.** Each voter's name appears under the options as they vote; their pick never does, and a named poll's names beside the votes are still not drawn here. The line above a named poll's question now says that who voted for what is saved and not shown here. An anonymous live poll's arrivals show no name; a named live poll's do, and its phones say the room may see their pick. A deck's live poll face also has no close step: forward leaves with the vote open, and the deck closes it as it goes (the deck runtime's row T28, CST-426 2026-11-13). Names still never cross the bridge: the deck is told nothing new.
- **A poll is no longer silent.** The bridge's silence is now only "the deck cannot see this page, or a review is up". Under a poll, or a result shown again, the poll lane holds the lobby's bed and join chimes (`pollStage`) and plays only the poll's own vote and heartbeat cues, which the deck's `sound` command mutes like any other.
