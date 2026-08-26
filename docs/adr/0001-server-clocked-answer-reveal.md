# 0001. Server-clocked answer reveal on SELECT_ANSWER

Date: 2026-08-26  
Status: Accepted

## Context

The answering screen used to mount every option at once, start `question.time` immediately, and accept `PLAYER.SELECTED_ANSWER` during `SHOW_QUESTION`. A client-only stagger cannot keep scoring fair or reconnect into the same slot. A new `SHOW_ANSWERS` status would expand every status map and remount the shared player/manager surface.

## Decision

Keep one `SELECT_ANSWER` status with a two-phase payload.

- Required fields: `revealStartedAt`, `unlockAt`, `serverNow`, `answeringOpen`.
- `@razzia/common/utils/answer-reveal` owns schedule math. Current constants: 1000 ms initial delay, 2000 ms fade, 1000 ms hold (3000 ms start-to-start). Duration includes the initial delay: 6 s / 9 s / 12 s for 2 / 3 / 4 answers. Unlock is the last fade end.
- `RoundManager` is the only authority that may open answering. Natural timeout and host fast-forward both go through one generation-guarded `commitUnlock()`. That call stamps `startTime`, rebroadcasts `answeringOpen: true`, and starts the full cooldown once.
- Host Skip while revealing emits `EVENTS.MANAGER.UNLOCK_ANSWERS` (`manager:unlockAnswers`) and only interrupts the reveal waiter. Host Skip while answering emits the existing `ABORT_QUIZ`. `unlockAt` is never an answering gate.
- Clients project visible count from restamped server time. Reduced motion may show every reserved slot immediately. Neither path may submit, start the HUD, or start answers music until `answeringOpen`.
- Reconnect selects per-socket status first (so `WAIT` stays `WAIT`), then clones a selected `SELECT_ANSWER` to refresh only `serverNow`.

Visual pacing, locked/active chrome, shared question morph, and the number-only intro live in `packages/web/STYLE.md`.

## Alternatives considered

- **CSS or client-only stagger.** Rejected: the scoring clock and forged socket submissions would stay open.
- **New `SHOW_ANSWERS` status.** Rejected: every status map, reconnect cache, and remount boundary would grow without changing authority.
- **Reuse `ABORT_QUIZ` for reveal Skip.** Rejected: a duplicate or stale abort during reveal would race into results instead of opening answering.

## Consequences

- Common, socket, and web must ship together; the new payload fields are required. Mixed-version rolling deploys are unsupported.
- Quiz JSON and saved results are unchanged. Reveal phase is in-memory only.
- Future pacing changes must update the common timing table, `RoundManager` unlock expectation, web projection tests, and `STYLE.md` together.
- Reconnect remaining-seconds accuracy after answering has opened is intentionally unchanged.
