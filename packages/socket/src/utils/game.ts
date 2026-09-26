import type { Socket } from "@razzia/common/types/game/socket"
import Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { customAlphabet, nanoid } from "nanoid"

export const withGame = (
  gameId: string | undefined,
  socket: Socket,
  callback: (_game: Game) => void | Promise<void>,
): void => {
  if (!gameId) {
    socket.emit("game:errorMessage", "errors:game.notFound")

    return
  }

  const registry = Registry.getInstance()
  const game = registry.getGameById(gameId)

  if (!game) {
    socket.emit("game:errorMessage", "errors:game.notFound")

    return
  }

  callback(game)
}

const drawInviteCode = customAlphabet("0123456789")

export const createInviteCode = (
  isTaken: (_code: string) => boolean = () => false,
  length = 6,
) => {
  let code = drawInviteCode(length)

  while (isTaken(code)) {
    code = drawInviteCode(length)
  }

  return code
}

export const normalizeFilename = (subject: string) => {
  const slug = subject
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .slice(0, 10)

  const shortId = nanoid(8)

  return `${slug}-${shortId}`
}

const MAX_POINTS = 1000

export const orderToPoint = (index: number, totalPlayers: number): number => {
  if (totalPlayers <= 1) {
    return MAX_POINTS
  }

  return Math.round(
    MAX_POINTS - (index / (totalPlayers - 1)) * (MAX_POINTS / 2),
  )
}

export const timeToPoint = (startTime: number, secondes: number): number => {
  let points = MAX_POINTS

  const actualTime = Date.now()
  const tempsPasseEnSecondes = (actualTime - startTime) / 1000

  points -= (MAX_POINTS / secondes) * tempsPasseEnSecondes
  points = Math.max(0, points)

  return points
}
