import type { LectureState } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import type { PollSnapshot } from "@razzia/common/types/poll"
import {
  buildBridgeState,
  planRoundCommand,
  type StateInputs,
} from "@razzia/web/features/deck/plan"
import type { RoundCommand } from "@razzia/web/features/deck/protocol"
import { describe, expect, it } from "vitest"

const words = {
  question: "Which one?",
  options: ["A", "B"],
  anonymous: true,
  live: false,
}

const lecture = (overrides: Partial<LectureState> = {}): LectureState => ({
  inviteCode: "123456",
  total: 6,
  played: [],
  current: null,
  finished: false,
  ...overrides,
})

const inputs = (overrides: Partial<StateInputs> = {}): StateInputs => ({
  connected: true,
  loggedIn: true,
  pending: null,
  reattaching: false,
  attached: true,
  gameId: "g1",
  lecture: lecture(),
  status: { name: STATUS.SHOW_ROOM, data: { inviteCode: "123456" } },
  players: 3,
  visible: true,
  review: null,
  reviewable: [],
  ...overrides,
})

const open = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "path-pick",
  question: "Which path?",
  options: ["Full game", "Minigame"],
  anonymous: true,
  phase: "open",
  total: 2,
  ...extra,
})

describe("buildBridgeState and polls", () => {
  it("says what this build can do, attached or not", () => {
    expect(buildBridgeState(inputs()).features).toEqual([
      "poll",
      "pollInline",
      "pollReview",
    ])
    expect(buildBridgeState(inputs({ attached: false })).features).toEqual([
      "poll",
      "pollInline",
      "pollReview",
    ])
  })

  it("reports no poll and none done when nothing has run", () => {
    expect(buildBridgeState(inputs())).toMatchObject({
      poll: null,
      pollsDone: [],
    })
  })

  it("reports a sealed open poll by how many voted, without counts", () => {
    const { poll } = buildBridgeState(inputs({ poll: open() }))

    expect(poll).toEqual({
      id: "path-pick",
      phase: "open",
      anonymous: true,
      live: false,
      voted: 2,
    })
    expect(poll).not.toHaveProperty("counts")
  })

  it("reports a live open poll with its counts", () => {
    const { poll } = buildBridgeState(
      inputs({ poll: open({ live: true, counts: [1, 1] }) }),
    )

    expect(poll).toMatchObject({ live: true, voted: 2, counts: [1, 1] })
  })

  it("reports a closed poll with its counts", () => {
    const { poll } = buildBridgeState(
      inputs({ poll: open({ phase: "closed", counts: [2, 0] }) }),
    )

    expect(poll).toMatchObject({ phase: "closed", voted: 2, counts: [2, 0] })
  })

  it("does not pass on counts an open sealed poll should not have", () => {
    const { poll } = buildBridgeState(
      inputs({ poll: open({ counts: [2, 0] }) }),
    )

    expect(poll).not.toHaveProperty("counts")
  })

  it("never carries a name, whatever the poll", () => {
    const state = buildBridgeState(
      inputs({
        lecture: lecture({
          pollsDone: [{ ...words, id: "one", counts: [1, 1], total: 2 }],
        }),
        poll: open({
          anonymous: false,
          phase: "closed",
          counts: [1, 1],
          voters: [
            { username: "Alice", option: 0 },
            { username: "Bobby", option: 1 },
          ],
        }),
      }),
    )

    expect(JSON.stringify(state)).not.toContain("Alice")
    expect(JSON.stringify(state)).not.toContain("Bobby")
    expect(JSON.stringify(state)).not.toContain("voters")
    expect(state.poll?.anonymous).toBe(false)
  })

  it("lists the polls that closed in this room, as copies", () => {
    const done = [
      { ...words, id: "one", counts: [1, 1], total: 2 },
      { ...words, id: "two", counts: [3, 0], total: 3, partial: true },
    ]
    const state = buildBridgeState(
      inputs({ lecture: lecture({ pollsDone: done }) }),
    )

    // The deck is told what ran and how it came out, not the wording.
    expect(state.pollsDone).toEqual([
      { id: "one", counts: [1, 1], total: 2 },
      { id: "two", counts: [3, 0], total: 3, partial: true },
    ])
    expect(state.pollsDone[0].counts).not.toBe(done[0].counts)
  })

  it("shows no poll and no history from a game this page is not attached to", () => {
    expect(
      buildBridgeState(
        inputs({
          attached: false,
          poll: open(),
          lecture: lecture({
            pollsDone: [{ ...words, id: "one", counts: [1, 1], total: 2 }],
          }),
        }),
      ),
    ).toMatchObject({ poll: null, pollsDone: [] })
  })
})

const round = (type: RoundCommand["type"]): RoundCommand =>
  type === "play"
    ? { source: "cst426-deck", v: 1, type, question: 0 }
    : ({ source: "cst426-deck", v: 1, type } as RoundCommand)

describe("planRoundCommand with a poll showing", () => {
  const view = (extra: object = {}) => ({
    attached: true,
    lecture: lecture(),
    screen: STATUS.SHOW_RESPONSES,
    pollShowing: true,
    ...extra,
  })

  it.each(["play", "leaderboard", "finish"] as const)(
    "ignores %s as busy, since the poll owns the room",
    (type) => {
      expect(planRoundCommand(round(type), view())).toEqual({
        kind: "ignore",
        reason: "busy",
      })
    },
  )

  it("plans nothing different when no poll shows", () => {
    expect(
      planRoundCommand(round("leaderboard"), view({ pollShowing: false })),
    ).toEqual({ kind: "emit" })
    expect(
      planRoundCommand(round("leaderboard"), {
        attached: true,
        lecture: lecture(),
        screen: STATUS.SHOW_RESPONSES,
      }),
    ).toEqual({ kind: "emit" })
  })

  it("still queues for a page that is not attached, and still reports a finished quiz first", () => {
    expect(planRoundCommand(round("play"), view({ attached: false }))).toEqual({
      kind: "queue",
    })
    expect(
      planRoundCommand(
        round("play"),
        view({ lecture: lecture({ finished: true }) }),
      ),
    ).toEqual({ kind: "ignore", reason: "finished" })
  })
})
