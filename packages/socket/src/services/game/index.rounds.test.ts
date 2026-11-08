import { EVENTS } from "@razzia/common/constants"
import type { GameResult, PublicPlayer } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  saveResult: vi.fn<(_result: GameResult) => void>(),
}))

vi.mock("@razzia/socket/services/config", () => ({
  saveResult: mocks.saveResult,
}))

interface Emitted {
  target: string
  event: string
  payload: unknown
}

const createIo = () => {
  const emitted: Emitted[] = []
  const io = {
    to: vi.fn((target: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ target, event, payload })
      },
    })),
    in: vi.fn(() => ({ socketsLeave: vi.fn() })),
  } as unknown as Server

  return { io, emitted }
}

const createClient = (id: string, clientId: string) => {
  const emitted: Array<Omit<Emitted, "target">> = []
  const socket = {
    id,
    handshake: { auth: { clientId } },
    join: vi.fn(),
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }),
    to: vi.fn(() => ({ emit: vi.fn() })),
  } as unknown as Socket

  return { socket, emitted }
}

// Alice, Bobby and Carol in a game of one or more "Pick one" questions,
// where "Yes" (slot 1) is right.
const play = (questions = 1) => {
  const { io, emitted } = createIo()
  const host = createClient("manager", "manager-client")
  const game = new Game({
    io,
    socket: host.socket,
    quizz: {
      subject: "Rounds",
      questions: Array.from({ length: questions }, () => ({
        question: "Pick one",
        answers: ["No", "Yes"],
        solutions: [1],
        cooldown: 1,
        time: 60,
      })),
    },
    visuals: {},
  })
  const alice = createClient("p1", "alice-client")
  const bobby = createClient("p2", "bobby-client")
  const carol = createClient("p3", "carol-client")

  game.join(alice.socket, "Alice")
  game.join(bobby.socket, "Bobby")
  game.join(carol.socket, "Carol")

  const statuses = <T extends keyof StatusDataMap>(target: string, name: T) =>
    emitted
      .filter(
        ({ target: to, event, payload }) =>
          to === target &&
          event === EVENTS.GAME.STATUS &&
          (payload as { name: string }).name === name,
      )
      .map(({ payload }) => (payload as { data: StatusDataMap[T] }).data)

  const reveal = () =>
    statuses(game.gameId, STATUS.SELECT_ANSWER).find(
      ({ answeringOpen }) => !answeringOpen,
    )
  const open = () =>
    statuses(game.gameId, STATUS.SELECT_ANSWER).find(
      ({ answeringOpen }) => answeringOpen,
    )

  // Runs the clock on in small steps until the round gets there.
  const until = async (reached: () => unknown, waited = 0): Promise<void> => {
    if (reached() || waited >= 60_000) {
      expect(reached()).toBeTruthy()

      return
    }

    await vi.advanceTimersByTimeAsync(50)
    await until(reached, waited + 50)
  }

  return {
    game,
    host,
    alice,
    bobby,
    carol,
    statuses,
    reveal,
    open,
    untilReveal: () => until(reveal),
    untilAnswering: () => until(open),
    start: () => {
      void game.start(host.socket)
    },
  }
}

const names = (players: PublicPlayer[]) =>
  players.map(({ username }) => username)

describe("Game with a player kicked mid-game", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.saveResult.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("names a remaining player as fastest and leaves the kicked answer out of the count", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()

    await vi.advanceTimersByTimeAsync(1_000)
    round.game.selectAnswer(round.alice.socket, 1)
    await vi.advanceTimersByTimeAsync(1_000)
    round.game.kickPlayer(round.host.socket, "p1")
    round.game.selectAnswer(round.bobby.socket, 1)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)

    const [responses] = round.statuses("manager", STATUS.SHOW_RESPONSES)

    expect(responses).toMatchObject({
      responses: { 0: 1, 1: 1 },
      totalPlayers: 2,
      fastest: { username: "Bobby" },
    })
  })

  it("keeps a player kicked after the results off the podium and the saved result", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 1)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)
    round.game.kickPlayer(round.host.socket, "p1")
    round.game.showLeaderboard(round.host.socket)

    const [podium] = round.statuses("manager", STATUS.FINISHED)
    const [bobby] = round.statuses("p2", STATUS.FINISHED)
    const [[saved]] = mocks.saveResult.mock.calls

    expect(names(podium.top)).toEqual(["Bobby", "Carol"])
    expect(bobby).toMatchObject({ rank: 1, total: 2 })
    expect(saved.players).toEqual([
      expect.objectContaining({ username: "Bobby", rank: 1 }),
      expect.objectContaining({ username: "Carol", rank: 2 }),
    ])
  })

  it("keeps a player kicked after the results off the leaderboard and the standings", async () => {
    const round = play(2)
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 1)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)
    round.game.kickPlayer(round.host.socket, "p1")
    round.game.showLeaderboard(round.host.socket)

    const [board] = round.statuses("manager", STATUS.SHOW_LEADERBOARD)
    const [bobby] = round.statuses("p2", STATUS.SHOW_STANDING)

    expect(names(board.oldLeaderboard)).not.toContain("Alice")
    expect(names(board.leaderboard)).toEqual(["Bobby", "Carol"])
    expect(bobby).toMatchObject({ rank: 1, total: 2 })
    expect(bobby.ladder.map(({ username }) => username)).not.toContain("Alice")
  })
})

describe("Game leaderboard after a player reconnects", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("gives a player who came back between results and leaderboard one id on both boards", async () => {
    const round = play(2)
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 0)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)

    round.game.setPlayerDisconnected("p1")
    round.game.reconnectPlayer(createClient("p1-again", "alice-client").socket)
    round.game.showLeaderboard(round.host.socket)

    const [board] = round.statuses("manager", STATUS.SHOW_LEADERBOARD)
    const idOf = (players: PublicPlayer[]) =>
      players.find(({ username }) => username === "Alice")?.id

    expect(idOf(board.leaderboard)).toBe("p1-again")
    expect(idOf(board.oldLeaderboard)).toBe("p1-again")
  })
})

describe("Game answering once it is over", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ends answering the moment the host skips, and turns a late answer away", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()
    // Between two ticks of the clock.
    await vi.advanceTimersByTimeAsync(1_500)

    const skippedAt = Date.now()
    round.game.abortRound(round.host.socket)
    round.game.selectAnswer(round.alice.socket, 1)

    const [responses] = round.statuses("manager", STATUS.SHOW_RESPONSES)

    expect(responses).toMatchObject({ resultsAt: skippedAt, responses: {} })
    expect(round.statuses("p1", STATUS.WAIT)).toEqual([])
    expect(round.statuses("p1", STATUS.SHOW_RESULT)).toEqual([
      expect.objectContaining({ picked: null, correct: false }),
    ])
  })

  it("ends answering the moment the last player is in", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()
    await vi.advanceTimersByTimeAsync(1_500)

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 1)
    const allInAt = Date.now()
    round.game.selectAnswer(round.carol.socket, 0)

    const [responses] = round.statuses("manager", STATUS.SHOW_RESPONSES)

    expect(responses).toMatchObject({ resultsAt: allInAt })
  })
})

describe("Game host returning mid-answering", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("tells a reconnected host how many have answered", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()
    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 0)

    round.game.setManagerDisconnected()
    const back = createClient("manager-2", "manager-client")
    round.game.reconnectManager(back.socket)
    const events = back.emitted.map(({ event }) => event)

    expect(back.emitted).toContainEqual({
      event: EVENTS.GAME.PLAYER_ANSWER,
      payload: 2,
    })
    expect(events.indexOf(EVENTS.GAME.PLAYER_ANSWER)).toBeGreaterThan(
      events.indexOf(EVENTS.MANAGER.SUCCESS_RECONNECT),
    )
  })

  it("sends no count when answering is not open", async () => {
    const round = play()
    round.start()
    await round.untilReveal()

    round.game.setManagerDisconnected()
    const back = createClient("manager-2", "manager-client")
    round.game.reconnectManager(back.socket)

    expect(back.emitted.map(({ event }) => event)).not.toContain(
      EVENTS.GAME.PLAYER_ANSWER,
    )
  })
})

describe("Game answers opened early by the host", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("gives a phone that reconnects the moment answers really opened", async () => {
    const round = play()
    round.start()
    await round.untilReveal()
    const scheduled = round.reveal()?.unlockAt ?? 0

    await vi.advanceTimersByTimeAsync(1_000)
    const unlockedAt = Date.now()
    round.game.unlockAnswers(round.host.socket)
    await vi.advanceTimersByTimeAsync(0)
    expect(unlockedAt).toBeLessThan(scheduled)

    round.game.setPlayerDisconnected("p1")
    const back = createClient("p1-again", "alice-client")
    round.game.reconnectPlayer(back.socket)
    const reconnect = back.emitted.find(
      ({ event }) => event === EVENTS.PLAYER.SUCCESS_RECONNECT,
    )?.payload as {
      status: { name: string; data: StatusDataMap["SELECT_ANSWER"] }
    }

    expect(reconnect.status.name).toBe(STATUS.SELECT_ANSWER)
    expect(reconnect.status.data).toMatchObject({
      answeringOpen: true,
      unlockAt: unlockedAt,
    })
  })
})

describe("Game kick and leaderboard bookkeeping", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.saveResult.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("tells the room the new answer count when an answered player is kicked", async () => {
    const { io, emitted } = createIo()
    const host = createClient("manager", "manager-client")
    const game = new Game({
      io,
      socket: host.socket,
      quizz: {
        subject: "Count",
        questions: [
          {
            question: "Pick one",
            answers: ["No", "Yes"],
            solutions: [1],
            cooldown: 1,
            time: 60,
          },
        ],
      },
      visuals: {},
    })
    const alice = createClient("p1", "alice-client")
    const bobby = createClient("p2", "bobby-client")
    const carol = createClient("p3", "carol-client")
    for (const [client, name] of [
      [alice, "Alice"],
      [bobby, "Bobby"],
      [carol, "Carol"],
    ] as const) {
      game.join(client.socket, name)
    }
    void game.start(host.socket)
    await vi.advanceTimersByTimeAsync(20_000)

    game.selectAnswer(alice.socket, 1)
    game.selectAnswer(bobby.socket, 1)
    emitted.length = 0
    game.kickPlayer(host.socket, "p1")

    expect(
      emitted.filter(({ event }) => event === EVENTS.GAME.PLAYER_ANSWER),
    ).toEqual([
      { target: game.gameId, event: EVENTS.GAME.PLAYER_ANSWER, payload: 1 },
    ])
  })

  it("drops a kicked player's earlier answers from the saved result", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 1)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)
    round.game.kickPlayer(round.host.socket, "p1")
    round.game.showLeaderboard(round.host.socket)

    const [[saved]] = mocks.saveResult.mock.calls

    expect(saved.questions[0].playerAnswers.map((a) => a.playerName)).toEqual([
      "Bobby",
      "Carol",
    ])
  })

  it("shows the leaderboard once per results, not again against itself", async () => {
    const round = play(2)
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 0)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)

    round.game.showLeaderboard(round.host.socket)
    round.game.showLeaderboard(round.host.socket)

    const boards = round.statuses("manager", STATUS.SHOW_LEADERBOARD)

    expect(boards).toHaveLength(1)
    expect(round.statuses("p1", STATUS.SHOW_STANDING)).toHaveLength(1)
  })

  it("sends the final podium to a player who reconnected after the results", async () => {
    const round = play()
    round.start()
    await round.untilAnswering()

    round.game.selectAnswer(round.alice.socket, 1)
    round.game.selectAnswer(round.bobby.socket, 0)
    round.game.selectAnswer(round.carol.socket, 0)
    await vi.advanceTimersByTimeAsync(1_000)

    round.game.setPlayerDisconnected("p1")
    round.game.reconnectPlayer(createClient("p1-again", "alice-client").socket)
    round.game.showLeaderboard(round.host.socket)

    expect(round.statuses("p1-again", STATUS.FINISHED)).toHaveLength(1)
    expect(round.statuses("p1", STATUS.FINISHED)).toHaveLength(0)
  })
})
