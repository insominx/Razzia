// oxlint-disable typescript/no-unnecessary-condition
import { EVENTS, MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import type {
  Answer,
  GameResult,
  Player,
  Question,
  QuestionResult,
  Quizz,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import {
  getQuestionPromptRevealMs,
  QUESTION_NUMBER_INTRO_MS,
} from "@razzia/common/utils/question-transition"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import {
  PlayerManager,
  toPublicPlayer,
} from "@razzia/socket/services/game/player-manager"
import { orderToPoint, timeToPoint } from "@razzia/socket/utils/game"
import {
  createInterruptibleDelay,
  type InterruptibleDelay,
} from "@razzia/socket/utils/interruptible-delay"
import sleep from "@razzia/socket/utils/sleep"
import { nanoid } from "nanoid"

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void
type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface RoundManagerOptions {
  quizz: Quizz
  players: PlayerManager
  cooldown: CooldownTimer
  io: Server
  gameId: string
  getManagerId: () => string
  isManager: (_socket: Socket) => boolean
  broadcast: BroadcastFn
  send: SendFn
  onNewQuestion: () => void
  onGameFinished: (_result: GameResult) => void
}

type RoundPhase =
  | "idle"
  | "starting"
  | "prompt"
  | "revealing"
  | "answering"
  | "results"
  | "over"

interface UnlockContext {
  generation: number
  question: Question
  revealStartedAt: number
  unlockAt: number
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private currentQuestion = 0
  private playersAnswers: Answer[] = []
  private startTime = 0
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private phase: RoundPhase = "idle"
  private questionGeneration = 0
  private revealWaiter: InterruptibleDelay | null = null

  constructor(opts: RoundManagerOptions) {
    this.opts = opts
  }

  // A round is live from the start countdown until the podium or a close.
  private get started(): boolean {
    return this.phase !== "idle" && this.phase !== "over"
  }

  isStarted(): boolean {
    return this.started
  }

  getReconnectInfo() {
    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    }
  }

  async start(socket: Socket): Promise<void> {
    if (!this.opts.isManager(socket)) {
      return
    }

    if (this.phase !== "idle") {
      return
    }

    if (this.opts.players.count() === 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

      return
    }

    this.phase = "starting"

    this.opts.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await sleep(3)

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    await this.opts.cooldown.start(3)

    void this.newQuestion()
  }

  async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.questionGeneration += 1
    const generation = this.questionGeneration
    this.revealWaiter?.interrupt()
    this.revealWaiter = null
    this.phase = "prompt"
    this.startTime = 0
    this.playersAnswers = []

    const question = this.opts.quizz.questions[this.currentQuestion]
    const questionNumber = this.currentQuestion + 1

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.opts.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers.length,
      questionNumber,
    })

    await sleep(QUESTION_NUMBER_INTRO_MS / 1_000)

    if (!this.started || generation !== this.questionGeneration) {
      return
    }

    const imageMedia =
      question.media?.type === MEDIA_TYPES.IMAGE ? question.media : undefined

    const promptStartedAt = Date.now()

    this.opts.broadcast(STATUS.SHOW_QUESTION, {
      questionNumber,
      question: question.question,
      media: imageMedia,
      cooldown: question.cooldown,
      promptStartedAt,
      serverNow: promptStartedAt,
    })

    await sleep(getQuestionPromptRevealMs(question.question) / 1_000)

    if (!this.started || generation !== this.questionGeneration) {
      return
    }

    await sleep(question.cooldown)

    if (!this.started || generation !== this.questionGeneration) {
      return
    }

    const revealStartedAt = Date.now()
    const unlockAt =
      revealStartedAt + getAnswerRevealDuration(question.answers.length)
    this.phase = "revealing"

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      questionNumber,
      question: question.question,
      answers: question.answers,
      media: question.media,
      time: question.time,
      totalPlayer: this.opts.players.count(),
      revealStartedAt,
      unlockAt,
      serverNow: revealStartedAt,
      answeringOpen: false,
    })

    const revealWaiter = createInterruptibleDelay(unlockAt - revealStartedAt)
    this.revealWaiter = revealWaiter
    await revealWaiter.promise

    if (this.revealWaiter === revealWaiter) {
      this.revealWaiter = null
    }

    await this.commitUnlock({
      generation,
      question,
      revealStartedAt,
      unlockAt,
    })
  }

  private async commitUnlock({
    generation,
    question,
    revealStartedAt,
    unlockAt,
  }: UnlockContext): Promise<void> {
    if (
      !this.started ||
      generation !== this.questionGeneration ||
      this.phase !== "revealing"
    ) {
      return
    }

    this.phase = "answering"
    const serverNow = Date.now()
    this.startTime = serverNow

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      questionNumber: this.currentQuestion + 1,
      question: question.question,
      answers: question.answers,
      media: question.media,
      time: question.time,
      totalPlayer: this.opts.players.count(),
      revealStartedAt,
      unlockAt,
      serverNow,
      answeringOpen: true,
    })

    await this.opts.cooldown.start(question.time)

    if (
      !this.started ||
      generation !== this.questionGeneration ||
      this.phase !== "answering"
    ) {
      return
    }

    this.phase = "results"
    this.showResults(question)
  }

  private showResults(question: Question): void {
    const currentPlayers = this.opts.players.getAll()

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const totalType = this.playersAnswers.reduce(
      (acc: Record<number, number>, { answerId }) => {
        acc[answerId] = (acc[answerId] || 0) + 1

        return acc
      },
      {},
    )

    const sortedPlayers = currentPlayers
      .map((player) => {
        const playerAnswer = this.playersAnswers.find(
          (a) => a.playerId === player.id,
        )

        const isCorrect = playerAnswer
          ? question.solutions.includes(playerAnswer.answerId)
          : false

        const points =
          playerAnswer && isCorrect ? Math.round(playerAnswer.points) : 0

        player.points += points
        player.streak = isCorrect ? player.streak + 1 : 0

        return { ...player, lastCorrect: isCorrect, lastPoints: points }
      })
      .sort((a, b) => b.points - a.points)

    this.opts.players.replace(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const rank = index + 1
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "game:correct" : "game:wrong",
        points: player.lastPoints,
        myPoints: player.points,
        rank,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...question,
      questionNumber: this.currentQuestion + 1,
      responses: totalType,
    })

    this.questionsHistory.push({
      ...question,
      playerAnswers: currentPlayers.map((player) => ({
        playerName: player.username,
        answerId:
          this.playersAnswers.find((a) => a.playerId === player.id)?.answerId ??
          null,
      })),
    })

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard
    this.playersAnswers = []
  }

  stop(): void {
    this.phase = "over"
    this.revealWaiter?.interrupt()
    this.opts.cooldown.abort()
  }

  selectAnswer(socket: Socket, answerId: number): void {
    const player = this.opts.players.findById(socket.id)
    const question = this.opts.quizz.questions[this.currentQuestion]

    if (
      this.phase !== "answering" ||
      !player ||
      !Number.isInteger(answerId) ||
      answerId < 0 ||
      answerId >= question.answers.length
    ) {
      return
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return
    }

    const points = (() => {
      if (question.time === NO_TIME_LIMIT) {
        return orderToPoint(
          this.playersAnswers.length,
          this.opts.players.count(),
        )
      }

      return timeToPoint(this.startTime, question.time)
    })()

    this.playersAnswers.push({
      playerId: player.id,
      answerId,
      points,
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    socket
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.opts.players.broadcastCount()

    if (this.playersAnswers.length === this.opts.players.count()) {
      this.opts.cooldown.abort()
    }
  }

  nextQuestion(socket: Socket): void {
    if (!this.started || this.phase !== "results") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    if (!this.opts.quizz.questions[this.currentQuestion + 1]) {
      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  abortQuestion(socket: Socket): void {
    if (!this.started || this.phase !== "answering") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    this.opts.cooldown.abort()
  }

  unlockAnswers(socket: Socket): void {
    if (!this.started || this.phase !== "revealing") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    this.revealWaiter?.interrupt()
  }

  showLeaderboard(socket: Socket): void {
    if (!this.started || this.phase !== "results") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    const isLastRound =
      this.currentQuestion + 1 === this.opts.quizz.questions.length

    if (isLastRound) {
      this.phase = "over"

      const top = this.leaderboard.slice(0, 3).map(toPublicPlayer)

      this.opts.onGameFinished({
        id: `${Date.now()}-${nanoid(8)}`,
        subject: this.opts.quizz.subject,
        date: new Date().toISOString(),
        players: this.leaderboard.map((player, index) => ({
          username: player.username,
          points: player.points,
          rank: index + 1,
        })),
        questions: this.questionsHistory,
      })

      this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
      })

      this.leaderboard.forEach((player, index) => {
        this.opts.send(player.id, STATUS.FINISHED, {
          subject: this.opts.quizz.subject,
          top,
          rank: index + 1,
        })
      })

      return
    }

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5).map(toPublicPlayer),
      leaderboard: this.leaderboard.slice(0, 5).map(toPublicPlayer),
    })

    this.tempOldLeaderboard = null
  }
}
