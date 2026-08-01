import { z } from "zod"
import { gameVisualsConfigValidator } from "@razzia/common/validators/visuals"

export const gameConfigValidator = z.object({
  managerPassword: z.string(),
  visuals: gameVisualsConfigValidator.optional(),
})

export type GameConfig = z.infer<typeof gameConfigValidator>
