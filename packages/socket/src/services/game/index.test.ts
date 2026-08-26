import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import {
  restampReconnectStatus,
  selectReconnectStatus,
} from "@razzia/socket/services/game"
import { describe, expect, it } from "vitest"

const selectAnswerStatus: {
  name: typeof STATUS.SELECT_ANSWER
  data: StatusDataMap["SELECT_ANSWER"]
} = {
  name: STATUS.SELECT_ANSWER,
  data: {
    question: "Question",
    questionNumber: 1,
    answers: ["A", "B"],
    time: 10,
    totalPlayer: 2,
    revealStartedAt: 1_000,
    unlockAt: 5_000,
    serverNow: 1_100,
    answeringOpen: false,
  },
}

describe("reconnect status selection", () => {
  it("preserves a per-socket WAIT instead of promoting the room reveal", () => {
    const wait = {
      name: STATUS.WAIT,
      data: { text: "game:waitingForAnswers" },
    } as const

    expect(selectReconnectStatus(wait, selectAnswerStatus)).toBe(wait)
  })

  it("falls back to the room status and finally to WAIT", () => {
    expect(selectReconnectStatus(undefined, selectAnswerStatus)).toBe(
      selectAnswerStatus,
    )
    expect(selectReconnectStatus(undefined, undefined)).toEqual({
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    })
  })
})

describe("restampReconnectStatus", () => {
  it("clones SELECT_ANSWER and refreshes only serverNow", () => {
    const restamped = restampReconnectStatus(selectAnswerStatus, 1_800)

    expect(restamped).not.toBe(selectAnswerStatus)
    expect(restamped.data).not.toBe(selectAnswerStatus.data)
    expect(restamped).toEqual({
      ...selectAnswerStatus,
      data: { ...selectAnswerStatus.data, serverNow: 1_800 },
    })
    expect(selectAnswerStatus.data.serverNow).toBe(1_100)
  })

  it("leaves WAIT selected and unchanged", () => {
    const wait = {
      name: STATUS.WAIT,
      data: { text: "game:waitingForAnswers" },
    } as const

    expect(restampReconnectStatus(wait, 1_800)).toBe(wait)
  })
})
