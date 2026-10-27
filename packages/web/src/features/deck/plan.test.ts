import type { LectureState } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import {
  buildBridgeState,
  planRoundCommand,
  type StateInputs,
} from "@razzia/web/features/deck/plan"
import type { RoundCommand } from "@razzia/web/features/deck/protocol"
import { describe, expect, it } from "vitest"

const lectureState = (overrides: Partial<LectureState> = {}): LectureState => ({
  inviteCode: "123456",
  total: 6,
  played: [],
  current: null,
  finished: false,
  ...overrides,
})

const play = (question: number): RoundCommand => ({
  source: "cst426-deck",
  v: 1,
  type: "play",
  question,
})

const leaderboard: RoundCommand = {
  source: "cst426-deck",
  v: 1,
  type: "leaderboard",
}

const finish: RoundCommand = { source: "cst426-deck", v: 1, type: "finish" }

describe("planRoundCommand", () => {
  it("holds plays and finishes until this page is the game's manager", () => {
    const view = { attached: false, lecture: null, screen: null }

    expect(planRoundCommand(play(0), view)).toEqual({ kind: "queue" })
    expect(planRoundCommand(finish, view)).toEqual({ kind: "queue" })
    expect(planRoundCommand(leaderboard, view)).toEqual({
      kind: "ignore",
      reason: "notAttached",
    })
  })

  it("will not drive a game the deck did not start", () => {
    expect(
      planRoundCommand(play(0), {
        attached: true,
        lecture: null,
        screen: STATUS.SHOW_ROOM,
      }),
    ).toEqual({ kind: "notLectureGame" })
  })

  it("starts an unplayed question from the lobby or between questions", () => {
    const lecture = lectureState({ played: [0] })

    expect(
      planRoundCommand(play(0), {
        attached: true,
        lecture: lectureState(),
        screen: STATUS.SHOW_ROOM,
      }),
    ).toEqual({ kind: "emit" })
    expect(
      planRoundCommand(play(1), {
        attached: true,
        lecture,
        screen: STATUS.SHOW_RESPONSES,
      }),
    ).toEqual({ kind: "emit" })
    expect(
      planRoundCommand(play(1), {
        attached: true,
        lecture,
        screen: STATUS.SHOW_LEADERBOARD,
      }),
    ).toEqual({ kind: "emit" })
  })

  it("never replays a question", () => {
    expect(
      planRoundCommand(play(0), {
        attached: true,
        lecture: lectureState({ played: [0] }),
        screen: STATUS.SHOW_LEADERBOARD,
      }),
    ).toEqual({ kind: "ignore", reason: "alreadyPlayed" })
  })

  it.each([
    STATUS.SHOW_START,
    STATUS.SHOW_PREPARED,
    STATUS.SHOW_QUESTION,
    STATUS.SELECT_ANSWER,
  ])("waits while a question is on %s", (screen) => {
    const view = { attached: true, lecture: lectureState(), screen }

    expect(planRoundCommand(play(1), view)).toEqual({
      kind: "ignore",
      reason: "questionLive",
    })
    expect(planRoundCommand(leaderboard, view)).toEqual({
      kind: "ignore",
      reason: "questionLive",
    })
  })

  it("shows the leaderboard only from a question's results", () => {
    const lecture = lectureState({ played: [0] })

    expect(
      planRoundCommand(leaderboard, {
        attached: true,
        lecture,
        screen: STATUS.SHOW_RESPONSES,
      }),
    ).toEqual({ kind: "emit" })
    expect(
      planRoundCommand(leaderboard, {
        attached: true,
        lecture,
        screen: STATUS.SHOW_LEADERBOARD,
      }),
    ).toEqual({ kind: "ignore", reason: "alreadyShown" })
    expect(
      planRoundCommand(leaderboard, {
        attached: true,
        lecture: lectureState(),
        screen: STATUS.SHOW_ROOM,
      }),
    ).toEqual({ kind: "ignore", reason: "notInResults" })
  })

  it("finishes only once a question has run", () => {
    expect(
      planRoundCommand(finish, {
        attached: true,
        lecture: lectureState(),
        screen: STATUS.SHOW_ROOM,
      }),
    ).toEqual({ kind: "ignore", reason: "nothingPlayed" })
    expect(
      planRoundCommand(finish, {
        attached: true,
        lecture: lectureState({ played: [3] }),
        screen: STATUS.SHOW_LEADERBOARD,
      }),
    ).toEqual({ kind: "emit" })
  })

  it("does nothing more once the game has finished", () => {
    const view = {
      attached: true,
      lecture: lectureState({ played: [0], finished: true }),
      screen: STATUS.FINISHED,
    }

    expect(planRoundCommand(play(1), view)).toEqual({
      kind: "ignore",
      reason: "finished",
    })
    expect(planRoundCommand(finish, view)).toEqual({
      kind: "ignore",
      reason: "finished",
    })
  })
})

const inputs = (overrides: Partial<StateInputs> = {}): StateInputs => ({
  connected: true,
  loggedIn: true,
  pending: null,
  reattaching: false,
  attached: true,
  gameId: "g1",
  lecture: null,
  status: null,
  players: 0,
  visible: false,
  ...overrides,
})

describe("buildBridgeState", () => {
  it("reports a lecture's progress and its PIN", () => {
    const state = buildBridgeState(
      inputs({
        lecture: lectureState({ played: [0, 2], current: 2 }),
        status: {
          name: STATUS.SELECT_ANSWER,
          data: { questionNumber: 3, answeringOpen: true },
        },
        players: 24,
        visible: true,
      }),
    )

    expect(state).toMatchObject({
      gameId: "g1",
      inviteCode: "123456",
      lecture: true,
      screen: STATUS.SELECT_ANSWER,
      answeringOpen: true,
      question: 2,
      total: 6,
      played: [0, 2],
      finished: false,
      players: 24,
      visible: true,
    })
  })

  it("reads the question and PIN off the screen without lecture state", () => {
    expect(
      buildBridgeState(
        inputs({
          status: {
            name: STATUS.SHOW_ROOM,
            data: { text: "game:waitingForPlayers", inviteCode: "654321" },
          },
        }),
      ),
    ).toMatchObject({ inviteCode: "654321", lecture: false, question: null })
    expect(
      buildBridgeState(
        inputs({
          status: { name: STATUS.SHOW_PREPARED, data: { questionNumber: 4 } },
        }),
      ),
    ).toMatchObject({ question: 3, answeringOpen: false })
  })

  it("shows no game or screen until this page is attached", () => {
    expect(
      buildBridgeState(
        inputs({
          attached: false,
          status: { name: STATUS.SHOW_RESPONSES, data: {} },
        }),
      ),
    ).toMatchObject({ gameId: null, screen: null })
  })

  it("calls a game on its podium finished", () => {
    expect(
      buildBridgeState(inputs({ status: { name: STATUS.FINISHED, data: {} } })),
    ).toMatchObject({ finished: true })
  })
})
