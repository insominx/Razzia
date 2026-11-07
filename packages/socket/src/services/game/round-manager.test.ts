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
    getExpected: () => players.filter((player) => player.connected),
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
    isManager: (socket: Socket) => socket.id === "manager",
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
    players,
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

type Sent = [target: string, status: string, data: unknown]

const sentStatuses = (
  harness: ReturnType<typeof createHarness>,
  target: string,
  status: string,
): Sent[] =>
  harness.send.mock.calls.filter(
    ([sentTarget, sentStatus]) =>
      sentTarget === target && sentStatus === status,
  ) as Sent[]

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
      // The charge line spans the prompt's cooldown and the reveal, so the
      // answers screen needs to know how long that cooldown was.
      cooldown: expect.any(Number) as unknown,
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

  it("stamps the staged verdict for the room and for each phone", async () => {
    const harness = createHarness()
    await enterAnswering(harness)

    await vi.advanceTimersByTimeAsync(2_400)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    await vi.advanceTimersByTimeAsync(600)
    const endedAt = Date.now()
    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()

    const [[, , one]] = sentStatuses(harness, "p1", STATUS.SHOW_RESULT)
    const [[, , two]] = sentStatuses(harness, "p2", STATUS.SHOW_RESULT)
    const [[, , room]] = sentStatuses(harness, "manager", STATUS.SHOW_RESPONSES)

    // Every screen is told the same moment answering ended, and when this was
    // sent, so each works out how far into the reveal it is by itself.
    for (const payload of [one, two, room]) {
      expect(payload).toMatchObject({ resultsAt: endedAt, serverNow: endedAt })
    }

    // A phone is told what it picked and what was right, even if it missed.
    expect(one).toMatchObject({
      correct: true,
      picked: 1,
      correctAnswers: ["Yes"],
      previousRank: null,
      totalPlayers: 2,
      behind: null,
    })
    expect(two).toMatchObject({
      correct: false,
      picked: null,
      correctAnswers: ["Yes"],
      totalPlayers: 2,
    })
    expect((two as { behind: number }).behind).toBeGreaterThan(0)

    // The room is told how many are in it, and who was quickest and right.
    expect(room).toMatchObject({
      totalPlayers: 2,
      fastest: { username: "One", seconds: 2.4 },
    })
  })

  it("names nobody as fastest when nobody was right", async () => {
    const harness = createHarness()
    await enterAnswering(harness)

    harness.round.selectAnswer(harness.playerOne.socket, 0)
    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()

    const [[, , room]] = sentStatuses(harness, "manager", STATUS.SHOW_RESPONSES)

    expect(room).toMatchObject({ fastest: null })
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
      // So the question screen knows how long the reveal that follows lasts.
      answerCount: expect.any(Number) as unknown,
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

  it("tells a finished player where they came in and how many played", async () => {
    const harness = createHarness()

    await enterAnswering(harness)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    harness.round.selectAnswer(harness.playerTwo.socket, 0)
    await flushAsync()
    harness.round.showLeaderboard(harness.managerSocket)

    const [[, , one]] = sentStatuses(harness, "p1", STATUS.FINISHED)
    const [[, , two]] = sentStatuses(harness, "p2", STATUS.FINISHED)

    expect(one).toMatchObject({ rank: 1, total: 2, points: 1_000 })
    expect(two).toMatchObject({ rank: 2, total: 2, points: 0 })
  })

  it("ignores a second start during the countdown", async () => {
    const harness = createHarness()

    void harness.round.start(harness.managerSocket)
    void harness.round.start(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(
      harness.broadcast.mock.calls.filter(
        ([status]) => status === STATUS.SHOW_START,
      ),
    ).toHaveLength(1)
  })

  it("does not replay a finished game", async () => {
    const harness = createHarness()

    await enterResults(harness)
    harness.round.showLeaderboard(harness.managerSocket)
    void harness.round.start(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(
      harness.broadcast.mock.calls.filter(
        ([status]) => status === STATUS.SHOW_START,
      ),
    ).toHaveLength(1)
    expect(harness.onGameFinished).toHaveBeenCalledTimes(1)
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

describe("RoundManager standings on the phones", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Six players seeded with scores, so rank order holds whoever answers.
  const enterSeededResults = async (
    harness: ReturnType<typeof createHarness>,
  ) => {
    ;["p3", "p4", "p5", "p6"].forEach((id, index) => {
      harness.players.push(makePlayer(id, `Player ${index + 3}`))
    })
    harness.players.forEach((player, index) => {
      player.points = 900 - index * 100
    })
    await enterAnswering(harness)
    harness.round.abortQuestion(harness.managerSocket)
    await flushAsync()
    harness.round.showLeaderboard(harness.managerSocket)
  }

  const standingFor = (harness: ReturnType<typeof createHarness>, id: string) =>
    sentStatuses(harness, id, STATUS.SHOW_STANDING)[0]?.[2]

  it("counts the room in on the wait screen of a player who locked in", async () => {
    const harness = createHarness()
    await enterAnswering(harness)

    harness.round.selectAnswer(harness.playerOne.socket, 1)

    expect(harness.send).toHaveBeenCalledWith("p1", STATUS.WAIT, {
      text: "game:waitingForAnswers",
      answered: 1,
      total: 2,
    })
  })

  it("sends every phone its own place, not only the top five's", async () => {
    const harness = createHarness(10, "Pick one", 2)

    await enterSeededResults(harness)

    for (const id of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
      expect(standingFor(harness, id)).toBeDefined()
    }

    expect(standingFor(harness, "p6")).toMatchObject({
      rank: 6,
      total: 6,
      points: 400,
    })
  })

  it("shows the leader and the players either side of this one", async () => {
    const harness = createHarness(10, "Pick one", 2)

    await enterSeededResults(harness)

    const ranks = (id: string) =>
      (
        standingFor(harness, id) as { ladder: Array<{ rank: number }> }
      ).ladder.map((row) => row.rank)

    expect(ranks("p5")).toEqual([1, 4, 5, 6])
    expect(ranks("p3")).toEqual([1, 2, 3, 4])
    expect(ranks("p1")).toEqual([1, 2])
    expect(
      (
        standingFor(harness, "p5") as {
          ladder: Array<{ me: boolean; rank: number }>
        }
      ).ladder.find((row) => row.me)?.rank,
    ).toBe(5)
  })

  it("says how far behind the player in front, and nothing for the leader", async () => {
    const harness = createHarness(10, "Pick one", 2)

    await enterSeededResults(harness)

    expect(standingFor(harness, "p5")).toMatchObject({
      behind: { username: "Player 4", points: 100 },
    })
    expect(standingFor(harness, "p1")).toMatchObject({ behind: null })
  })

  it("carries the last question's gain and the earlier place", async () => {
    const harness = createHarness(10, "Pick one", 3)

    await enterAnswering(harness)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    harness.round.selectAnswer(harness.playerTwo.socket, 0)
    await flushAsync()
    harness.round.showLeaderboard(harness.managerSocket)

    expect(standingFor(harness, "p1")).toMatchObject({
      rank: 1,
      previousRank: null,
      gained: 1_000,
    })
    expect(standingFor(harness, "p2")).toMatchObject({
      rank: 2,
      gained: 0,
    })
  })

  it("keeps every other player's clientId out of a standing", async () => {
    const harness = createHarness(10, "Pick one", 2)

    await enterSeededResults(harness)

    expect(
      JSON.stringify(sentStatuses(harness, "p3", STATUS.SHOW_STANDING)),
    ).not.toContain("-client")
  })
})

describe("RoundManager player privacy", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps clientIds out of leaderboards and the podium", async () => {
    const harness = createHarness(10, "Pick one", 2)

    await enterResults(harness)
    harness.round.showLeaderboard(harness.managerSocket)
    harness.round.nextQuestion(harness.managerSocket)
    await vi.advanceTimersByTimeAsync(20_000)
    harness.round.showLeaderboard(harness.managerSocket)

    expect(
      sentStatuses(harness, "manager", STATUS.SHOW_LEADERBOARD),
    ).toHaveLength(1)
    expect(sentStatuses(harness, "p1", STATUS.FINISHED)).toHaveLength(1)
    expect(JSON.stringify(harness.send.mock.calls)).not.toContain("-client")
  })
})

describe("RoundManager players who drop out", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T17:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stops waiting for a player who is no longer expected", async () => {
    const harness = createHarness()
    await enterAnswering(harness)
    harness.players[1].connected = false

    harness.round.selectAnswer(harness.playerOne.socket, 1)

    expect(harness.abort).toHaveBeenCalledTimes(1)
  })

  it("rechecks when asked, once the last expected player has answered", async () => {
    const harness = createHarness()
    await enterAnswering(harness)
    harness.round.selectAnswer(harness.playerOne.socket, 1)
    expect(harness.abort).not.toHaveBeenCalled()

    harness.players[1].connected = false
    harness.round.endIfEveryoneAnswered()

    expect(harness.abort).toHaveBeenCalledTimes(1)
  })

  it("keeps the timer running when nobody is left to answer", async () => {
    const harness = createHarness()
    await enterAnswering(harness)
    harness.players[0].connected = false
    harness.players[1].connected = false

    harness.round.endIfEveryoneAnswered()

    expect(harness.abort).not.toHaveBeenCalled()
  })

  it("keeps a player's answer when they reconnect on a new socket", async () => {
    const harness = createHarness()
    await enterAnswering(harness)
    harness.round.selectAnswer(harness.playerOne.socket, 1)

    harness.players[0].id = "p1-again"
    const again = makeSocket("p1-again")
    harness.round.selectAnswer(again.socket, 0)
    harness.round.selectAnswer(harness.playerTwo.socket, 0)
    await flushAsync()

    expect(harness.send).toHaveBeenCalledWith(
      "p1-again",
      STATUS.SHOW_RESULT,
      expect.objectContaining({ correct: true, points: 1_000 }),
    )
    expect(again.roomEmit).not.toHaveBeenCalled()
  })
})
