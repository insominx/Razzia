// oxlint-disable typescript/no-unnecessary-condition
import {
  EVENTS,
  LECTURE_TEXT,
  MEDIA_TYPES,
  NO_TIME_LIMIT,
} from "@razzia/common/constants"
import type {
  Answer,
  GameResult,
  GameUpdateQuestion,
  LectureOutcome,
  LectureState,
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
  // A lecture game plays questions by index whenever its host asks, holds
  // between them, and ends only when the host finishes it.
  lecture?: boolean
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

// The places of players already sorted by points. Players level on points
// share a place and the next place skips one for each of them (1, 1, 3).
const placesOf = (sorted: ReadonlyArray<{ points: number }>): number[] =>
  sorted.reduce<number[]>((places, player, index) => {
    const level = index > 0 && sorted[index - 1].points === player.points

    places.push(level ? places[index - 1] : index + 1)

    return places
  }, [])

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private currentQuestion = 0
  private playersAnswers: Answer[] = []
  private startTime = 0
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  // False for the first scored question: its "before" is only the join order,
  // which is no place a player was ever in.
  private previousPlaceKnown = false
  private questionsHistory: QuestionResult[] = []
  private phase: RoundPhase = "idle"
  private questionGeneration = 0
  private revealWaiter: InterruptibleDelay | null = null
  private readonly played = new Set<number>()

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

  isLobby(): boolean {
    return this.phase === "idle"
  }

  // Where the game is, for every screen. A lecture deck plays questions in any
  // order, so it also says which have been played: a phone has no other way to
  // draw its pips or know the final question.
  getReconnectInfo(): GameUpdateQuestion {
    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
      ...(this.opts.lecture
        ? { played: [...this.played].sort((a, b) => a - b) }
        : {}),
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

    await this.countdownThenPlay()
  }

  private async countdownThenPlay(): Promise<void> {
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
    this.played.add(this.currentQuestion)
    this.startTime = 0
    this.playersAnswers = []

    const question = this.opts.quizz.questions[this.currentQuestion]
    const questionNumber = this.currentQuestion + 1

    this.opts.onNewQuestion()

    this.opts.io
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.UPDATE_QUESTION, this.getReconnectInfo())

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
      answerCount: question.answers.length,
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
      cooldown: question.cooldown,
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
      cooldown: question.cooldown,
      totalPlayer: this.opts.players.count(),
      revealStartedAt,
      // When the host skipped the reveal, the moment answers really opened.
      // This payload is what a reconnecting screen gets back, and it times
      // its burn line and music from here.
      unlockAt: Math.min(unlockAt, serverNow),
      serverNow,
      answeringOpen: true,
    })

    await this.opts.cooldown.start(question.time)

    if (!this.started || generation !== this.questionGeneration) {
      return
    }

    this.closeAnswering()
  }

  // Ends answering and shows the results at once, whether the clock ran out,
  // the host skipped, or everyone is in. A skip or the last answer closes it
  // there and then, so no answer slips in before the results are stamped.
  private closeAnswering(): void {
    if (this.phase !== "answering") {
      return
    }

    this.phase = "results"
    this.opts.cooldown.abort()
    this.showResults(this.opts.quizz.questions[this.currentQuestion])
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

    const resultsAt = Date.now()
    const previousPlaces = placesOf(this.leaderboard)
    const previousRanks = new Map(
      this.leaderboard.map((player, index) => [
        player.clientId,
        previousPlaces[index],
      ]),
    )
    const sortedPlayers = currentPlayers
      .map((player) => {
        const playerAnswer = this.playersAnswers.find(
          (a) => a.clientId === player.clientId,
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
    const places = placesOf(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const rank = places[index]
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "game:correct" : "game:wrong",
        points: player.lastPoints,
        myPoints: player.points,
        rank,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
        resultsAt,
        serverNow: resultsAt,
        picked:
          this.playersAnswers.find((a) => a.clientId === player.clientId)
            ?.answerId ?? null,
        correctAnswers: question.solutions.map(
          (slot) => question.answers[slot],
        ),
        previousRank: previousRanks.get(player.clientId) ?? null,
        streak: player.streak,
        totalPlayers: sortedPlayers.length,
        behind: aheadPlayer ? aheadPlayer.points - player.points : null,
        ...this.lectureNote(),
      })
    })

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...question,
      questionNumber: this.currentQuestion + 1,
      responses: totalType,
      resultsAt,
      serverNow: resultsAt,
      totalPlayers: sortedPlayers.length,
      fastest: this.fastestRightAnswer(question, sortedPlayers),
    })

    this.questionsHistory.push({
      ...question,
      playerAnswers: currentPlayers.map((player) => ({
        playerName: player.username,
        answerId:
          this.playersAnswers.find((a) => a.clientId === player.clientId)
            ?.answerId ?? null,
      })),
    })

    this.previousPlaceKnown = this.leaderboard.length > 0
    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard
    this.playersAnswers = []
  }

  /** The player who gave a right answer soonest, for the results headline. */
  private fastestRightAnswer(
    question: Question,
    players: ReadonlyArray<{ clientId: string; username: string }>,
  ): { username: string; seconds: number } | null {
    const rightAnswers = this.playersAnswers.filter(
      (answer) =>
        question.solutions.includes(answer.answerId) &&
        answer.elapsedMs !== undefined,
    )

    if (rightAnswers.length === 0) {
      return null
    }

    const quickest = rightAnswers.reduce((best, answer) =>
      (answer.elapsedMs ?? Infinity) < (best.elapsedMs ?? Infinity)
        ? answer
        : best,
    )
    const player = players.find(
      (candidate) => candidate.clientId === quickest.clientId,
    )

    return player
      ? {
          username: player.username,
          seconds: Math.round((quickest.elapsedMs ?? 0) / 100) / 10,
        }
      : null
  }

  // A kicked player leaves the boards, the podium and the saved result, and
  // their answer leaves the count and the race for fastest.
  forgetPlayer(clientId: string): void {
    const others = (entry: { clientId: string }) => entry.clientId !== clientId

    this.leaderboard = this.leaderboard.filter(others)
    this.tempOldLeaderboard = this.tempOldLeaderboard?.filter(others) ?? null
    this.playersAnswers = this.playersAnswers.filter(others)
  }

  // How many are in while answering is open, for a host back mid-question;
  // null at any other time.
  getAnswerCount(): number | null {
    return this.phase === "answering" ? this.playersAnswers.length : null
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

    if (this.playersAnswers.find((a) => a.clientId === player.clientId)) {
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
      clientId: player.clientId,
      answerId,
      points,
      elapsedMs: Math.max(0, Date.now() - this.startTime),
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
      answered: this.playersAnswers.length,
      total: this.opts.players.count(),
    })

    socket
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.opts.players.broadcastCount()

    this.endIfEveryoneAnswered()
  }

  // Answering ends early once every player the round still expects has
  // answered; a player who dropped out stops being expected after a grace.
  endIfEveryoneAnswered(): void {
    if (this.phase !== "answering") {
      return
    }

    const answered = new Set(
      this.playersAnswers.map(({ clientId }) => clientId),
    )
    const expected = this.opts.players.getExpected()

    // With nobody left (e.g. the venue Wi-Fi dropped), keep the timer: they
    // may all be on their way back.
    if (
      expected.length > 0 &&
      expected.every(({ clientId }) => answered.has(clientId))
    ) {
      this.closeAnswering()
    }
  }

  nextQuestion(socket: Socket): void {
    if (!this.started || this.phase !== "results") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    if (this.opts.lecture) {
      this.playNextUnplayed()

      return
    }

    if (!this.opts.quizz.questions[this.currentQuestion + 1]) {
      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  // The host's own Next button in a lecture game: the next question not yet
  // played, or the podium after the last one.
  private playNextUnplayed(): void {
    const total = this.opts.quizz.questions.length
    let next = this.currentQuestion + 1

    while (next < total && this.played.has(next)) {
      next += 1
    }

    if (next >= total) {
      this.endGame(this.rankedPlayers())

      return
    }

    this.currentQuestion = next
    void this.newQuestion()
  }

  // Lecture games only: plays the question at that index, once. It starts
  // only from the lobby or between questions, never over a running round.
  playQuestion(socket: Socket, index: number): LectureOutcome {
    if (!this.opts.lecture) {
      return "notLecture"
    }

    if (!this.opts.isManager(socket)) {
      return "notManager"
    }

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.opts.quizz.questions.length
    ) {
      return "invalidIndex"
    }

    if (this.phase === "over") {
      return "finished"
    }

    if (this.played.has(index)) {
      return "alreadyPlayed"
    }

    if (this.phase === "idle") {
      if (this.opts.players.count() === 0) {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

        return "noPlayers"
      }

      this.currentQuestion = index
      void this.countdownThenPlay()

      return "accepted"
    }

    if (this.phase !== "results") {
      return "busy"
    }

    this.currentQuestion = index
    void this.newQuestion()

    return "accepted"
  }

  // Lecture games only: the podium, and the result of the questions played.
  finish(socket: Socket): LectureOutcome {
    if (!this.opts.lecture) {
      return "notLecture"
    }

    if (!this.opts.isManager(socket)) {
      return "notManager"
    }

    if (this.phase === "over") {
      return "finished"
    }

    if (this.phase === "idle") {
      return "nothingPlayed"
    }

    if (this.phase !== "results") {
      return "busy"
    }

    this.endGame(this.rankedPlayers())

    return "accepted"
  }

  // Newcomers join in the lobby. A lecture game also lets them in between
  // questions, never during one, so no round waits on a player who never saw
  // its question.
  acceptsNewPlayers(): boolean {
    return (
      this.phase === "idle" ||
      (this.opts.lecture === true && this.phase === "results")
    )
  }

  // `current` is set from the start countdown on: the deck must know the
  // question it asked for is the one starting.
  getLectureProgress(): Omit<LectureState, "inviteCode"> {
    const known = this.played.size > 0 || this.phase === "starting"

    return {
      total: this.opts.quizz.questions.length,
      played: [...this.played].sort((a, b) => a - b),
      current: known ? this.currentQuestion : null,
      finished: this.phase === "over",
    }
  }

  // A lecture game that closes before its podium still keeps what was played.
  getUnfinishedResult(): GameResult | null {
    if (
      !this.opts.lecture ||
      this.phase === "over" ||
      this.questionsHistory.length === 0
    ) {
      return null
    }

    return { ...this.buildResult(this.rankedPlayers()), partial: true }
  }

  private lectureNote(): { note?: string } {
    if (!this.opts.lecture) {
      return {}
    }

    const allPlayed = this.played.size >= this.opts.quizz.questions.length

    return {
      note: allPlayed
        ? LECTURE_TEXT.FINAL_STANDINGS
        : LECTURE_TEXT.NEXT_QUESTION,
    }
  }

  // Each phone's own place, so nobody outside the top five is left guessing.
  // A lecture game holds between questions on its own note instead.
  private sendStandings(previous: Player[]): void {
    if (this.opts.lecture) {
      return
    }

    const previousPlaces = placesOf(previous)
    const previousRanks = new Map(
      this.previousPlaceKnown
        ? previous.map((player, index) => [
            player.clientId,
            previousPlaces[index],
          ])
        : [],
    )
    const current = new Map(
      this.opts.players.getAll().map((player) => [player.clientId, player.id]),
    )
    const places = placesOf(this.leaderboard)

    this.leaderboard.forEach((player, index) => {
      const id = current.get(player.clientId)

      if (!id) {
        return
      }

      const ahead = this.leaderboard[index - 1]
      const shown = new Set([0, index - 1, index, index + 1])
      const ladder = this.leaderboard
        .map((entry, rowIndex) => ({
          rank: places[rowIndex],
          username: entry.username,
          points: entry.points,
          me: rowIndex === index,
        }))
        .filter((_row, rowIndex) => shown.has(rowIndex))

      this.opts.send(id, STATUS.SHOW_STANDING, {
        rank: places[index],
        previousRank: previousRanks.get(player.clientId) ?? null,
        points: player.points,
        gained: (player as Player & { lastPoints?: number }).lastPoints ?? 0,
        total: this.leaderboard.length,
        ladder,
        behind: ahead
          ? { username: ahead.username, points: ahead.points - player.points }
          : null,
      })
    })
  }

  // A copy: sorting PlayerManager's own array would reorder it.
  private rankedPlayers(): Player[] {
    return [...this.opts.players.getAll()].sort((a, b) => b.points - a.points)
  }

  private buildResult(ranked: Player[]): GameResult {
    const places = placesOf(ranked)

    return {
      id: `${Date.now()}-${nanoid(8)}`,
      subject: this.opts.quizz.subject,
      date: new Date().toISOString(),
      players: ranked.map((player, index) => ({
        username: player.username,
        points: player.points,
        rank: places[index],
      })),
      questions: this.questionsHistory,
    }
  }

  private endGame(ranked: Player[]): void {
    this.phase = "over"

    // Still the first three entries, however they are placed.
    const top = ranked.slice(0, 3).map(toPublicPlayer)
    const places = placesOf(ranked)

    this.opts.onGameFinished(this.buildResult(ranked))

    this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
      subject: this.opts.quizz.subject,
      top,
    })

    ranked.forEach((player, index) => {
      this.opts.send(player.id, STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
        rank: places[index],
        total: ranked.length,
        points: player.points,
      })
    })
  }

  // A phone that reconnected since the results has a new socket id, in any
  // game, and the leaderboard matches its rows by id: a stale one shows a
  // player overtaking themselves.
  private withCurrentIds(players: Player[]): Player[] {
    const ids = new Map(
      this.opts.players.getAll().map((player) => [player.clientId, player.id]),
    )

    return players.map((player) => ({
      ...player,
      id: ids.get(player.clientId) ?? player.id,
    }))
  }

  abortQuestion(socket: Socket): void {
    if (!this.started || this.phase !== "answering") {
      return
    }

    if (!this.opts.isManager(socket)) {
      return
    }

    this.closeAnswering()
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

    // A lecture game never ends on a leaderboard; its host finishes it.
    const isLastRound =
      !this.opts.lecture &&
      this.currentQuestion + 1 === this.opts.quizz.questions.length

    if (isLastRound) {
      this.endGame(this.leaderboard)

      return
    }

    const oldLeaderboard = this.withCurrentIds(
      this.tempOldLeaderboard ?? this.leaderboard,
    )

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5).map(toPublicPlayer),
      leaderboard: this.leaderboard.slice(0, 5).map(toPublicPlayer),
    })

    this.sendStandings(oldLeaderboard)

    this.tempOldLeaderboard = null
  }
}
