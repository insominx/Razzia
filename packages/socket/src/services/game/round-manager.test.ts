import { NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Player, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS } from "@razzia/common/types/game/status"
import { getQuestionPromptRevealMs } from "@razzia/common/utils/question-transition"
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
  const roomEmit = vi.fn()

  return {
    socket: {
      id,
      to: vi.fn(() => ({ emit: roomEmit })),
    } as unknown as Socket,
    roomEmit,
  }
}

const createHarness = (time = 10, question = "Pick one", questionCount = 1) => {
  const quizz: Quizz = {
    subject: "Reveal",
    questions: Array.from({ length: questionCount }, () => ({
      question,
      answers: ["No", "Yes"],
      solutions: [1],
      cooldown: 1,
      time,
    })),
  }
  const players = [makePlayer("p1", "One"), makePlayer("p2", "Two")]
  const broadcast = vi.fn()
  const send = vi.fn()
  const broadcastCount = vi.fn()
  const replace = vi.fn()
  const playerManager = {
    count: () => players.length,
    findById: (id: string) => players.find((player) => player.id === id),
    getAll: () => players,
    broadcastCount,
    replace,
  } as unknown as PlayerManager
  let finishAnswering: () => void = () => undefined
  const answeringDone = new Promise<void>((resolve) => {
    finishAnswering = resolve
  })
  const start = vi.fn((seconds: number) =>
    seconds === 3 ? Promise.resolve() : answeringDone,
  )
  const abort = vi.fn(() => finishAnswering())
  const cooldown = { start, abort } as unknown as CooldownTimer
  const ioEmit = vi.fn()
  const io = {
    to: vi.fn(() => ({ emit: ioEmit })),
  } as unknown as Server
  const managerSocket = makeSocket("manager")
  const playerOne = makeSocket("p1")
  const playerTwo = makeSocket("p2")
  const onGameFinished = vi.fn()
  const round = new RoundManager({
    quizz,
    players: playerManager,
    cooldown,
    io,
    gameId: "game-1",
    getManagerId: () => "manager",
    broadcast,
    send,
    onNewQuestion: vi.fn(),
    onGameFinished,
  })

  return {
    round,
    broadcast,
    send,
    start,
    abort,
    broadcastCount,
    onGameFinished,
    managerSocket: managerSocket.socket,
    playerOne,
    playerTwo,
  }
}

const enterPrepared = async (harness: ReturnType<typeof createHarness>) => {
  void harness.round.start(harness.managerSocket)
  await vi.advanceTimersByTimeAsync(3_000)
}

const enterQuestion = async (harness: ReturnType<typeof createHarness>) => {
  await enterPrepared(harness)
  await vi.advanceTimersByTimeAsync(1_000)
}

const enterReveal = async (harness: ReturnType<typeof createHarness>) => {
  await enterQuestion(harness)
  await vi.advanceTimersByTimeAsync(1_950)
}

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const enterAnswering = async (harness: ReturnType<typeof createHarness>) => {
  await enterReveal(harness)
  harness.round.unlockAnswers(harness.managerSocket)
  await flushAsync()
}

const enterResults = async (harness: ReturnType<typeof createHarness>) => {
  await enterAnswering(harness)
  harness.round.abortQuestion(harness.managerSocket)
  await flushAsync()
}

const sentStatuses = (
  harness: ReturnType<typeof createHarness>,
  target: string,
  status: string,
) =>
  harness.send.mock.calls.filter(
    ([sentTarget, sentStatus]) =>
      sentTarget === target && sentStatus === status,
  )

const preparedQuestionNumbers = (harness: ReturnType<typeof createHarness>) =>
  harness.broadcast.mock.calls
    .filter(([status]) => status === STATUS.SHOW_PREPARED)
    .map(([, data]) => (data as { questionNumber: number }).questionNumber)

describe("RoundManager answer reveal authority", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("rejects submissions during prepared, question, and reveal phases", async () => {
    const harness = createHarness()

    await enterPrepared(harness)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    await vi.advanceTimersByTimeAsync(1_000)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    await vi.advanceTimersByTimeAsync(950)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    await vi.advanceTimersByTimeAsync(1_000)
    harness.round.selectAnswer(harness.playerOne.socket, 1)

    expect(harness.send).not.toHaveBeenCalledWith(
      "p1",
      STATUS.WAIT,
      expect.anything(),
    )
    expect(harness.playerOne.roomEmit).not.toHaveBeenCalled()
    expect(harness.broadcastCount).not.toHaveBeenCalled()
  })

  it("opens exactly at the final fade end and starts the full answer time once", async () => {
    const harness = createHarness(10)

    await enterReveal(harness)
    const selectBroadcasts = harness.broadcast.mock.calls.filter(
      ([status]) => status === STATUS.SELECT_ANSWER,
    )
    expect(selectBroadcasts).toHaveLength(1)
    expect(selectBroadcasts[0]?.[1]).toMatchObject({
      questionNumber: 1,
      revealStartedAt: Date.parse("2026-08-26T17:00:05.950Z"),
      unlockAt: Date.parse("2026-08-26T17:00:11.950Z"),
      serverNow: Date.parse("2026-08-26T17:00:05.950Z"),
      answeringOpen: false,
    })

    await vi.advanceTimersByTimeAsync(5_999)
    expect(harness.start).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.start).toHaveBeenCalledTimes(2)
    expect(harness.start).toHaveBeenLastCalledWith(10)
    expect(
      harness.broadcast.mock.calls.filter(
        ([status]) => status === STATUS.SELECT_ANSWER,
      ),
    ).toEqual([
      expect.anything(),
      [
        STATUS.SELECT_ANSWER,
        expect.objectContaining({
          answeringOpen: true,
          questionNumber: 1,
          serverNow: Date.parse("2026-08-26T17:00:11.950Z"),
          unlockAt: Date.parse("2026-08-26T17:00:11.950Z"),
        }),
      ],
    ])
  })

  it("fast-forwards only for the manager and keeps unlock idempotent", async () => {
    const harness = createHarness()

    await enterReveal(harness)
    harness.round.abortQuestion(harness.managerSocket)
    harness.round.unlockAnswers(harness.playerOne.socket)
    expect(harness.abort).not.toHaveBeenCalled()
    expect(harness.start).toHaveBeenCalledTimes(1)

    harness.round.unlockAnswers(harness.managerSocket)
    harness.round.unlockAnswers(harness.managerSocket)
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.start).toHaveBeenCalledTimes(2)
    expect(
      harness.broadcast.mock.calls.filter(
        ([status, data]) =>
          status === STATUS.SELECT_ANSWER &&
          (data as { answeringOpen?: boolean }).answeringOpen === true,
      ),
    ).toHaveLength(1)

    harness.round.unlockAnswers(harness.managerSocket)
    expect(harness.start).toHaveBeenCalledTimes(2)
    harness.round.abortQuestion(harness.managerSocket)
    expect(harness.abort).toHaveBeenCalledTimes(1)
  })

  it("rejects invalid answers, accepts each player once, and aborts after the final legal answer", async () => {
    const harness = createHarness()
    await enterReveal(harness)
    harness.round.unlockAnswers(harness.managerSocket)
    await Promise.resolve()
    await Promise.resolve()

    harness.round.selectAnswer(harness.playerOne.socket, -1)
    harness.round.selectAnswer(harness.playerOne.socket, 2)
    harness.round.selectAnswer(harness.playerOne.socket, 1.5)
    expect(harness.send).not.toHaveBeenCalledWith(
      "p1",
      STATUS.WAIT,
      expect.anything(),
    )

    harness.round.selectAnswer(harness.playerOne.socket, 1)
    harness.round.selectAnswer(harness.playerOne.socket, 0)
    expect(
      harness.send.mock.calls.filter(
        ([target, status]) => target === "p1" && status === STATUS.WAIT,
      ),
    ).toHaveLength(1)
    expect(harness.abort).not.toHaveBeenCalled()

    harness.round.selectAnswer(harness.playerTwo.socket, 0)
    expect(harness.abort).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.send).toHaveBeenCalledWith(
      "p1",
      STATUS.SHOW_RESULT,
      expect.objectContaining({ correct: true, points: 1_000 }),
    )
    expect(harness.send).toHaveBeenCalledWith(
      "p2",
      STATUS.SHOW_RESULT,
      expect.objectContaining({ correct: false, points: 0 }),
    )
  })

  it("keeps untimed order scoring behind the same unlock", async () => {
    const harness = createHarness(NO_TIME_LIMIT)
    await enterReveal(harness)

    expect(harness.start).not.toHaveBeenCalledWith(NO_TIME_LIMIT)
    harness.round.unlockAnswers(harness.managerSocket)
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.start).toHaveBeenCalledWith(NO_TIME_LIMIT)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    harness.round.selectAnswer(harness.playerTwo.socket, 1)
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.send).toHaveBeenCalledWith(
      "p1",
      STATUS.SHOW_RESULT,
      expect.objectContaining({ points: 1_000 }),
    )
    expect(harness.send).toHaveBeenCalledWith(
      "p2",
      STATUS.SHOW_RESULT,
      expect.objectContaining({ points: 500 }),
    )
  })

  it("holds SELECT_ANSWER until the last sentence fade ends", async () => {
    const question =
      "A door is opened during the game. Players joining later should see that it is already open. How should its open/closed state normally be synchronized?"
    const harness = createHarness(10, question)

    await enterQuestion(harness)
    const prompt = harness.broadcast.mock.calls.find(
      ([status]) => status === STATUS.SHOW_QUESTION,
    )
    expect(prompt?.[1]).toMatchObject({
      question,
      promptStartedAt: Date.parse("2026-08-26T17:00:04.000Z"),
      serverNow: Date.parse("2026-08-26T17:00:04.000Z"),
    })

    await vi.advanceTimersByTimeAsync(1_950)
    expect(
      harness.broadcast.mock.calls.filter(
        ([status]) => status === STATUS.SELECT_ANSWER,
      ),
    ).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(
      getQuestionPromptRevealMs(question) + 1_000 - 1_950,
    )
    expect(
      harness.broadcast.mock.calls.filter(
        ([status]) => status === STATUS.SELECT_ANSWER,
      ),
    ).toHaveLength(1)
  })
})

describe("RoundManager manager authority over round flow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the leaderboard only to a manager request after the results", async () => {
    const harness = createHarness(10, "Pick one", 2)

    harness.round.showLeaderboard(harness.playerOne.socket)
    harness.round.showLeaderboard(harness.managerSocket)
    await enterAnswering(harness)
    harness.round.showLeaderboard(harness.managerSocket)
    expect(sentStatuses(harness, "manager", STATUS.SHOW_LEADERBOARD)).toEqual(
      [],
    )

    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()
    harness.round.showLeaderboard(harness.playerOne.socket)
    expect(sentStatuses(harness, "manager", STATUS.SHOW_LEADERBOARD)).toEqual(
      [],
    )

    harness.round.showLeaderboard(harness.managerSocket)
    expect(
      sentStatuses(harness, "manager", STATUS.SHOW_LEADERBOARD),
    ).toHaveLength(1)
  })

  it("does not let a player end the game during the last question", async () => {
    const harness = createHarness()

    harness.round.showLeaderboard(harness.playerOne.socket)
    await enterAnswering(harness)
    harness.round.showLeaderboard(harness.playerOne.socket)
    harness.round.showLeaderboard(harness.managerSocket)

    expect(harness.onGameFinished).not.toHaveBeenCalled()
    expect(sentStatuses(harness, "manager", STATUS.FINISHED)).toEqual([])
    expect(sentStatuses(harness, "p1", STATUS.FINISHED)).toEqual([])
  })

  it("finishes the game and saves its result exactly once", async () => {
    const harness = createHarness()

    await enterResults(harness)
    harness.round.showLeaderboard(harness.playerOne.socket)
    expect(harness.onGameFinished).not.toHaveBeenCalled()

    harness.round.showLeaderboard(harness.managerSocket)
    harness.round.showLeaderboard(harness.managerSocket)

    expect(harness.onGameFinished).toHaveBeenCalledTimes(1)
    expect(harness.onGameFinished).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Reveal",
        questions: [expect.objectContaining({ question: "Pick one" })],
      }),
    )
    expect(sentStatuses(harness, "manager", STATUS.FINISHED)).toHaveLength(1)
    expect(sentStatuses(harness, "p1", STATUS.FINISHED)).toHaveLength(1)
  })

  it("advances one question at a time and only from the results", async () => {
    const harness = createHarness(10, "Pick one", 3)

    await enterAnswering(harness)
    harness.round.nextQuestion(harness.managerSocket)
    expect(preparedQuestionNumbers(harness)).toEqual([1])

    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()
    harness.round.nextQuestion(harness.playerOne.socket)
    expect(preparedQuestionNumbers(harness)).toEqual([1])

    harness.round.nextQuestion(harness.managerSocket)
    harness.round.nextQuestion(harness.managerSocket)
    expect(preparedQuestionNumbers(harness)).toEqual([1, 2])
  })
})
