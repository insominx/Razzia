import { EVENTS, LECTURE_TEXT } from "@razzia/common/constants"
import type { GameResult, Player, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS } from "@razzia/common/types/game/status"
import type { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import type { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const makePlayer = (id: string, username: string): Player => ({
  id,
  clientId: `${id}-client`,
  connected: true,
  username,
  points: 0,
  streak: 0,
})

const makeSocket = (id: string) => {
  const emit = vi.fn()

  return {
    socket: {
      id,
      emit,
      to: vi.fn(() => ({ emit: vi.fn() })),
    } as unknown as Socket,
    emit,
  }
}

interface HarnessOptions {
  questionCount?: number
  lecture?: boolean
  playerCount?: number
}

// Unlike the reveal harness, every answer window gets its own timer, so a
// lecture can run several questions in one test.
const createLectureHarness = ({
  questionCount = 3,
  lecture = true,
  playerCount = 2,
}: HarnessOptions = {}) => {
  const quizz: Quizz = {
    subject: "Lecture",
    questions: Array.from({ length: questionCount }, () => ({
      question: "Pick one",
      answers: ["No", "Yes"],
      solutions: [1],
      cooldown: 1,
      time: 10,
    })),
  }
  const state = {
    players: [makePlayer("p1", "One"), makePlayer("p2", "Two")].slice(
      0,
      playerCount,
    ),
  }
  const playerManager = {
    count: () => state.players.length,
    findById: (id: string) => state.players.find((player) => player.id === id),
    getAll: () => state.players,
    getExpected: () => state.players.filter((player) => player.connected),
    broadcastCount: vi.fn(),
    replace: (players: Player[]) => {
      state.players = players
    },
  } as unknown as PlayerManager
  const timers: { finish: (() => void) | null } = { finish: null }
  const start = vi.fn((seconds: number) => {
    if (seconds === 3) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      timers.finish = resolve
    })
  })
  const abort = vi.fn(() => {
    timers.finish?.()
    timers.finish = null
  })
  const cooldown = { start, abort } as unknown as CooldownTimer
  const ioEmit = vi.fn()
  const io = { to: vi.fn(() => ({ emit: ioEmit })) } as unknown as Server
  const broadcast = vi.fn()
  const send = vi.fn()
  const onGameFinished = vi.fn<(_result: GameResult) => void>()
  const manager = makeSocket("manager")
  const round = new RoundManager({
    quizz,
    players: playerManager,
    cooldown,
    io,
    gameId: "game-1",
    getManagerId: () => "manager",
    isManager: (socket: Socket) => socket.id === "manager",
    broadcast,
    send,
    onNewQuestion: vi.fn(),
    onGameFinished,
    lecture,
  })

  return {
    round,
    state,
    broadcast,
    send,
    ioEmit,
    onGameFinished,
    managerSocket: manager.socket,
    managerEmit: manager.emit,
  }
}

type Harness = ReturnType<typeof createLectureHarness>

// A phone that came back on a new socket during a hold.
const moveSocket = (harness: Harness, ids: { from: string; to: string }) => {
  harness.state.players.forEach((player) => {
    if (player.id === ids.from) {
      player.id = ids.to
    }
  })
}

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// From SHOW_PREPARED, past the question number, the prompt and its cooldown,
// into the staggered answer reveal.
const enterReveal = async () => {
  await vi.advanceTimersByTimeAsync(3_500)
}

const enterAnswering = async (harness: Harness) => {
  await enterReveal()
  harness.round.unlockAnswers(harness.managerSocket)
  await flushAsync()
}

const enterResults = async (harness: Harness) => {
  await enterAnswering(harness)
  harness.round.abortQuestion(harness.managerSocket)
  await flushAsync()
}

// Plays a question from the lobby (with the start countdown) or between
// questions, and runs it to its results.
const playToResults = async (harness: Harness, index: number) => {
  const fromLobby = !harness.round.isStarted()

  expect(harness.round.playQuestion(harness.managerSocket, index)).toBe(
    "accepted",
  )

  if (fromLobby) {
    await vi.advanceTimersByTimeAsync(3_000)
  }

  await enterResults(harness)
}

const preparedQuestionNumbers = (harness: Harness) =>
  harness.broadcast.mock.calls
    .filter(([status]) => status === STATUS.SHOW_PREPARED)
    .map(([, data]) => (data as { questionNumber: number }).questionNumber)

const sentTo = (harness: Harness, target: string, status: string) =>
  harness.send.mock.calls
    .filter(
      ([sentTarget, sentStatus]) =>
        sentTarget === target && sentStatus === status,
    )
    .map(([, , data]) => data as Record<string, unknown>)

describe("RoundManager lecture mode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-23T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("plays the asked question from the lobby after the start countdown", async () => {
    const harness = createLectureHarness()

    expect(harness.round.playQuestion(harness.managerSocket, 2)).toBe(
      "accepted",
    )
    expect(harness.broadcast).toHaveBeenCalledWith(
      STATUS.SHOW_START,
      expect.anything(),
    )
    expect(preparedQuestionNumbers(harness)).toEqual([])
    // The countdown already names the question it leads into.
    expect(harness.round.getLectureProgress()).toMatchObject({
      played: [],
      current: 2,
    })

    await vi.advanceTimersByTimeAsync(3_000)

    expect(preparedQuestionNumbers(harness)).toEqual([3])
    expect(harness.ioEmit).toHaveBeenCalledWith(EVENTS.GAME.UPDATE_QUESTION, {
      current: 3,
      total: 3,
    })
  })

  it("refuses to start a question with nobody in the game", () => {
    const harness = createLectureHarness({ playerCount: 0 })

    expect(harness.round.playQuestion(harness.managerSocket, 0)).toBe(
      "noPlayers",
    )
    expect(harness.managerEmit).toHaveBeenCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:game.noPlayersConnected",
    )
    expect(harness.broadcast).not.toHaveBeenCalled()
  })

  it("takes lecture commands only from its manager", () => {
    const harness = createLectureHarness()
    const player = makeSocket("p1").socket

    expect(harness.round.playQuestion(player, 0)).toBe("notManager")
    expect(harness.round.finish(player)).toBe("notManager")
    expect(harness.broadcast).not.toHaveBeenCalled()
  })

  it("ignores played, out-of-range and fractional indices", async () => {
    const harness = createLectureHarness()

    await playToResults(harness, 0)

    expect(harness.round.playQuestion(harness.managerSocket, 0)).toBe(
      "alreadyPlayed",
    )
    expect(harness.round.playQuestion(harness.managerSocket, 3)).toBe(
      "invalidIndex",
    )
    expect(harness.round.playQuestion(harness.managerSocket, -1)).toBe(
      "invalidIndex",
    )
    expect(harness.round.playQuestion(harness.managerSocket, 1.5)).toBe(
      "invalidIndex",
    )
    expect(preparedQuestionNumbers(harness)).toEqual([1])
  })

  it("never starts a question over a running one", async () => {
    const harness = createLectureHarness()

    harness.round.playQuestion(harness.managerSocket, 0)
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe("busy")

    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe("busy")

    await enterReveal()
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe("busy")

    harness.round.unlockAnswers(harness.managerSocket)
    await flushAsync()
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe("busy")

    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe(
      "accepted",
    )
    expect(preparedQuestionNumbers(harness)).toEqual([1, 2])
  })

  it("plays questions out of order", async () => {
    const harness = createLectureHarness()

    await playToResults(harness, 2)
    await playToResults(harness, 0)
    await playToResults(harness, 1)

    expect(preparedQuestionNumbers(harness)).toEqual([3, 1, 2])
    expect(harness.round.getLectureProgress().played).toEqual([0, 1, 2])
  })

  it("keeps going past the last question's leaderboard", async () => {
    const harness = createLectureHarness({ questionCount: 1 })

    await playToResults(harness, 0)
    harness.round.showLeaderboard(harness.managerSocket)

    expect(sentTo(harness, "manager", STATUS.SHOW_LEADERBOARD)).toHaveLength(1)
    expect(sentTo(harness, "manager", STATUS.FINISHED)).toEqual([])
    expect(harness.onGameFinished).not.toHaveBeenCalled()
  })

  it("finishes with the questions played, ranked across everyone in the game", async () => {
    const harness = createLectureHarness()

    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe(
      "accepted",
    )
    await vi.advanceTimersByTimeAsync(3_000)
    await enterAnswering(harness)
    harness.round.selectAnswer(makeSocket("p2").socket, 1)
    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()

    // Joined after the last results: still in the final standings.
    harness.state.players.push(makePlayer("p3", "Three"))

    expect(harness.round.finish(harness.managerSocket)).toBe("accepted")
    expect(harness.onGameFinished).toHaveBeenCalledTimes(1)

    const [[result]] = harness.onGameFinished.mock.calls

    expect(result.questions).toHaveLength(1)
    expect(result.partial).toBeUndefined()
    expect(result.players.map(({ username }) => username)).toEqual([
      "Two",
      "One",
      "Three",
    ])
    expect(sentTo(harness, "manager", STATUS.FINISHED)).toHaveLength(1)
    expect(sentTo(harness, "p3", STATUS.FINISHED)).toEqual([
      expect.objectContaining({ rank: 3 }),
    ])
    expect(sentTo(harness, "p2", STATUS.FINISHED)).toEqual([
      expect.objectContaining({ rank: 1 }),
    ])
  })

  it("finishes only between questions, and only once", async () => {
    const harness = createLectureHarness()

    expect(harness.round.finish(harness.managerSocket)).toBe("nothingPlayed")

    harness.round.playQuestion(harness.managerSocket, 0)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.round.finish(harness.managerSocket)).toBe("busy")

    await enterResults(harness)
    expect(harness.round.finish(harness.managerSocket)).toBe("accepted")
    expect(harness.round.finish(harness.managerSocket)).toBe("finished")
    expect(harness.round.playQuestion(harness.managerSocket, 1)).toBe(
      "finished",
    )
    expect(harness.onGameFinished).toHaveBeenCalledTimes(1)
  })

  it("lets the host's own Next walk the unplayed questions, then finish", async () => {
    const harness = createLectureHarness()

    await playToResults(harness, 1)
    harness.round.nextQuestion(harness.managerSocket)
    await enterResults(harness)

    expect(preparedQuestionNumbers(harness)).toEqual([2, 3])

    harness.round.nextQuestion(harness.managerSocket)

    expect(harness.onGameFinished).toHaveBeenCalledTimes(1)
    expect(sentTo(harness, "manager", STATUS.FINISHED)).toHaveLength(1)
  })

  it("lets newcomers in only between questions", async () => {
    const harness = createLectureHarness()

    expect(harness.round.acceptsNewPlayers()).toBe(true)

    harness.round.playQuestion(harness.managerSocket, 0)
    expect(harness.round.acceptsNewPlayers()).toBe(false)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.round.acceptsNewPlayers()).toBe(false)

    await enterAnswering(harness)
    expect(harness.round.acceptsNewPlayers()).toBe(false)

    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()
    expect(harness.round.acceptsNewPlayers()).toBe(true)

    harness.round.finish(harness.managerSocket)
    expect(harness.round.acceptsNewPlayers()).toBe(false)
  })

  it("keeps a normal game's lobby-only joining", async () => {
    const harness = createLectureHarness({ lecture: false })

    void harness.round.start(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(3_000)
    await enterResults(harness)

    expect(harness.round.acceptsNewPlayers()).toBe(false)
  })

  it("matches the old leaderboard to players who reconnected", async () => {
    const harness = createLectureHarness()

    await playToResults(harness, 0)
    moveSocket(harness, { from: "p1", to: "p1-new" })
    harness.round.showLeaderboard(harness.managerSocket)

    const [payload] = sentTo(harness, "manager", STATUS.SHOW_LEADERBOARD) as [
      { oldLeaderboard: Array<{ id: string }> },
    ]
    const oldIds = payload.oldLeaderboard.map(({ id }) => id)

    expect(oldIds).toContain("p1-new")
    expect(oldIds).not.toContain("p1")
  })

  it("tells players what comes next after each question", async () => {
    const harness = createLectureHarness({ questionCount: 2 })

    await playToResults(harness, 0)
    expect(sentTo(harness, "p1", STATUS.SHOW_RESULT)[0]).toMatchObject({
      note: LECTURE_TEXT.NEXT_QUESTION,
    })

    await playToResults(harness, 1)
    expect(sentTo(harness, "p1", STATUS.SHOW_RESULT)[1]).toMatchObject({
      note: LECTURE_TEXT.FINAL_STANDINGS,
    })
  })

  it("adds no note to a normal game's results", async () => {
    const harness = createLectureHarness({ lecture: false })

    void harness.round.start(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(3_000)
    await enterResults(harness)

    expect(sentTo(harness, "p1", STATUS.SHOW_RESULT)[0]).not.toHaveProperty(
      "note",
    )
  })

  it("reports which questions have run", async () => {
    const harness = createLectureHarness()

    expect(harness.round.getLectureProgress()).toEqual({
      total: 3,
      played: [],
      current: null,
      finished: false,
    })

    await playToResults(harness, 2)
    expect(harness.round.getLectureProgress()).toEqual({
      total: 3,
      played: [2],
      current: 2,
      finished: false,
    })

    harness.round.finish(harness.managerSocket)
    expect(harness.round.getLectureProgress().finished).toBe(true)
  })

  it("plays the first question from Start in a lecture lobby", async () => {
    const harness = createLectureHarness()

    void harness.round.start(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(3_000)

    expect(preparedQuestionNumbers(harness)).toEqual([1])
    expect(harness.round.getLectureProgress().played).toEqual([0])
  })

  it("keeps a partial result only for an unfinished lecture", async () => {
    const harness = createLectureHarness()

    expect(harness.round.getUnfinishedResult()).toBeNull()

    await playToResults(harness, 0)
    expect(harness.round.getUnfinishedResult()).toMatchObject({
      partial: true,
      questions: [expect.anything()],
    })

    harness.round.finish(harness.managerSocket)
    expect(harness.round.getUnfinishedResult()).toBeNull()
  })

  it("refuses lecture commands in a normal game", () => {
    const harness = createLectureHarness({ lecture: false })

    expect(harness.round.playQuestion(harness.managerSocket, 0)).toBe(
      "notLecture",
    )
    expect(harness.round.finish(harness.managerSocket)).toBe("notLecture")
    expect(harness.round.getUnfinishedResult()).toBeNull()
  })
})
