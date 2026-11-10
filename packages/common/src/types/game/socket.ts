import { EVENTS } from "@razzia/common/constants"
import type {
  GameResult,
  GameUpdateQuestion,
  LectureOutcome,
  LectureState,
  PublicPlayer,
  QuizzWithId,
} from "@razzia/common/types/game"
import type { Status, StatusDataMap } from "@razzia/common/types/game/status"
import type {
  ManagerConfig,
  ManagerMutationResponse,
} from "@razzia/common/types/manager"
import type {
  InlinePoll,
  PollOutcome,
  PollResultRecord,
  PollSnapshot,
  PollTally,
  PollVoteOutcome,
  PollWithId,
} from "@razzia/common/types/poll"
import type {
  BackgroundRef,
  Dialect,
  ResolvedVisuals,
  ShowIntensity,
  SoundTheme,
} from "@razzia/common/types/visuals"
import type { Server as ServerIO, Socket as SocketIO } from "socket.io"

export type Server = ServerIO<ClientToServerEvents, ServerToClientEvents>

export type Socket = SocketIO<ClientToServerEvents, ServerToClientEvents>

export interface Message<K extends keyof StatusDataMap = keyof StatusDataMap> {
  gameId?: string
  status: K
  data: StatusDataMap[K]
}

export interface MessageWithoutStatus<T = unknown> {
  gameId?: string
  data: T
}

export interface MessageGameId {
  gameId?: string
}

export interface ServerToClientEvents {
  connect: () => void
  disconnect: (_reason: string) => void

  // Game events
  [EVENTS.GAME.STATUS]: (_data: {
    name: Status
    data: StatusDataMap[Status]
  }) => void
  [EVENTS.GAME.SUCCESS_ROOM]: (_data: string) => void
  [EVENTS.GAME.SUCCESS_REJOIN]: (_gameId: string) => void
  [EVENTS.GAME.SUCCESS_JOIN]: (_data: {
    gameId: string
    visuals: ResolvedVisuals
    // A lecture's latecomer waits for the next question, not for players.
    waitText?: string
  }) => void
  [EVENTS.GAME.TOTAL_PLAYERS]: (_count: number) => void
  [EVENTS.GAME.ERROR_MESSAGE]: (_message: string) => void
  [EVENTS.GAME.START_COOLDOWN]: () => void
  [EVENTS.GAME.COOLDOWN]: (_count: number) => void
  [EVENTS.GAME.RESET]: (_message: string) => void
  [EVENTS.GAME.UPDATE_QUESTION]: (_data: GameUpdateQuestion) => void
  [EVENTS.GAME.PLAYER_ANSWER]: (_count: number) => void

  // Player events
  [EVENTS.PLAYER.SUCCESS_RECONNECT]: (_data: {
    gameId: string
    status: { name: Status; data: StatusDataMap[Status] }
    player: { username: string; points: number }
    currentQuestion: GameUpdateQuestion
    visuals: ResolvedVisuals
    // Present only while a poll is open or showing its result.
    poll?: PollSnapshot
  }) => void
  [EVENTS.PLAYER.UPDATE_LEADERBOARD]: (_data: {
    leaderboard: PublicPlayer[]
  }) => void

  // Manager events
  [EVENTS.MANAGER.SUCCESS_RECONNECT]: (_data: {
    gameId: string
    status: { name: Status; data: StatusDataMap[Status] }
    players: PublicPlayer[]
    currentQuestion: GameUpdateQuestion
    visuals: ResolvedVisuals
    lecture?: LectureState
    poll?: PollSnapshot
  }) => void
  [EVENTS.MANAGER.CONFIG]: (_config: ManagerConfig) => void
  [EVENTS.QUIZZ.DATA]: (_data: {
    quizz: QuizzWithId
    resolvedVisuals: ResolvedVisuals
  }) => void
  [EVENTS.MANAGER.GAME_CREATED]: (_data: {
    gameId: string
    inviteCode: string
    visuals: ResolvedVisuals
    lecture?: LectureState
  }) => void
  [EVENTS.MANAGER.LECTURE_STATE]: (_state: LectureState) => void

  // Poll events: null means no poll is showing.
  [EVENTS.POLL.STATE]: (_snapshot: PollSnapshot | null) => void
  [EVENTS.POLL.TALLY]: (_tally: PollTally) => void
  [EVENTS.MANAGER.STATUS_UPDATE]: (_data: {
    status: Status
    data: StatusDataMap[Status]
  }) => void
  [EVENTS.MANAGER.NEW_PLAYER]: (_player: PublicPlayer) => void
  [EVENTS.MANAGER.PLAYER_PRESENCE]: (_snapshot: {
    gameId: string
    players: PublicPlayer[]
  }) => void
  [EVENTS.MANAGER.REMOVE_PLAYER]: (_playerId: string) => void
  [EVENTS.MANAGER.ERROR_MESSAGE]: (_message: string) => void
  [EVENTS.MANAGER.PLAYER_KICKED]: (_playerId: string) => void
  [EVENTS.MANAGER.UNAUTHORIZED]: () => void

  // Quizz events
  [EVENTS.QUIZZ.SAVE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.UPDATE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.ERROR]: (_message: string) => void

  // Poll definitions
  [EVENTS.POLLS.DATA]: (_data: { poll: PollWithId }) => void
  [EVENTS.POLLS.SAVE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.POLLS.UPDATE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.POLLS.ERROR]: (_message: string) => void
  [EVENTS.POLLS.RESULT_DATA]: (_result: PollResultRecord) => void

  // Results events
  [EVENTS.RESULTS.DATA]: (_result: GameResult) => void
}

export interface ClientToServerEvents {
  // Manager actions
  [EVENTS.GAME.CREATE]: (_quizzId: string) => void
  [EVENTS.GAME.CREATE_LECTURE]: (_quizzId: string) => void
  [EVENTS.MANAGER.AUTH]: (_password: string) => void
  [EVENTS.MANAGER.RECONNECT]: (_message: { gameId: string }) => void
  [EVENTS.MANAGER.LEAVE]: (_message: { gameId: string }) => void
  [EVENTS.MANAGER.KICK_PLAYER]: (_message: {
    gameId: string
    playerId: string
  }) => void
  [EVENTS.MANAGER.START_GAME]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.UNLOCK_ANSWERS]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.ABORT_QUIZ]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.NEXT_QUESTION]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.SHOW_LEADERBOARD]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.PLAY_QUESTION]: (
    _message: MessageGameId & { index: number },
    _ack: (_outcome: LectureOutcome) => void,
  ) => void
  [EVENTS.MANAGER.FINISH_GAME]: (
    _message: MessageGameId,
    _ack: (_outcome: LectureOutcome) => void,
  ) => void
  // A stored poll by id, or a definition sent inline (a deck's slide text).
  [EVENTS.MANAGER.START_POLL]: (
    _message: MessageGameId & ({ pollId: string } | { poll: InlinePoll }),
    _ack: (_outcome: PollOutcome) => void,
  ) => void
  [EVENTS.MANAGER.CLOSE_POLL]: (
    _message: MessageGameId,
    _ack: (_outcome: PollOutcome) => void,
  ) => void
  [EVENTS.MANAGER.DISMISS_POLL]: (
    _message: MessageGameId,
    _ack: (_outcome: PollOutcome) => void,
  ) => void
  [EVENTS.MANAGER.GET_CONFIG]: () => void
  [EVENTS.MANAGER.GLOBAL_BACKGROUND_SET]: (
    _request: {
      background: BackgroundRef
    },
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR]: (
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.MANAGER.DIALECT_SET]: (
    _request: { dialect: Dialect },
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.MANAGER.SOUND_THEME_SET]: (
    _request: { soundTheme: SoundTheme },
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.MANAGER.SHOW_INTENSITY_SET]: (
    _request: { showIntensity: ShowIntensity },
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.MANAGER.LOGOUT]: () => void

  // Quizz actions
  [EVENTS.QUIZZ.GET]: (_id: string) => void
  [EVENTS.QUIZZ.SAVE]: (_quizz: unknown) => void
  [EVENTS.QUIZZ.UPDATE]: (_data: QuizzWithId) => void
  [EVENTS.QUIZZ.RESTORE]: (
    _id: string,
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.QUIZZ.DELETE]: (
    _id: string,
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void

  // Poll definition actions
  [EVENTS.POLLS.GET]: (_id: string) => void
  [EVENTS.POLLS.SAVE]: (_poll: unknown) => void
  [EVENTS.POLLS.UPDATE]: (_poll: PollWithId) => void
  [EVENTS.POLLS.DELETE]: (
    _id: string,
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void
  [EVENTS.POLLS.RESULT_GET]: (_id: string) => void
  [EVENTS.POLLS.RESULT_DELETE]: (
    _id: string,
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void

  // Player actions
  [EVENTS.PLAYER.JOIN]: (_inviteCode: string) => void
  [EVENTS.PLAYER.LOGIN]: (
    _message: MessageWithoutStatus<{ username: string }>,
  ) => void
  [EVENTS.PLAYER.RECONNECT]: (_message: { gameId: string }) => void
  [EVENTS.PLAYER.LEAVE]: (_message: { gameId: string }) => void
  [EVENTS.PLAYER.SELECTED_ANSWER]: (
    _message: MessageWithoutStatus<{ answerKey: number }>,
  ) => void
  [EVENTS.POLL.VOTE]: (
    _message: MessageGameId & { pollId: string; option: number },
    _ack: (_outcome: PollVoteOutcome) => void,
  ) => void
  [EVENTS.POLL.SYNC]: (_message: MessageGameId) => void

  // Results actions
  [EVENTS.RESULTS.GET]: (_id: string) => void
  [EVENTS.RESULTS.DELETE]: (
    _id: string,
    _callback?: (_response: ManagerMutationResponse) => void,
  ) => void

  // Common
  disconnect: () => void
}
