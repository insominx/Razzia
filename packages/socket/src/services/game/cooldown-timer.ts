import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"

export class CooldownTimer {
  private readonly io: Server
  private readonly gameId: string
  private active = false
  private interval: ReturnType<typeof setInterval> | null = null
  private finish: (() => void) | null = null

  constructor(io: Server, gameId: string) {
    this.io = io
    this.gameId = gameId
  }

  start(seconds: number): Promise<void> {
    if (this.active) {
      return Promise.resolve()
    }

    this.active = true

    return new Promise<void>((resolve) => {
      this.finish = () => {
        if (this.interval) {
          clearInterval(this.interval)
        }

        this.interval = null
        this.finish = null
        this.active = false
        resolve()
      }

      // An untimed question only ends when it is aborted.
      if (seconds === NO_TIME_LIMIT) {
        return
      }

      let count = seconds - 1

      this.interval = setInterval(() => {
        if (count <= 0) {
          this.finish?.()

          return
        }

        this.io.to(this.gameId).emit(EVENTS.GAME.COOLDOWN, count)
        count -= 1
      }, 1000)
    })
  }

  // Ends the countdown now, not on its next tick: whoever awaits it moves on
  // at once.
  abort() {
    this.finish?.()
  }
}
