import { useDeckBridge } from "@razzia/web/features/deck/use-deck-bridge"

// Mounted only when a lecture deck frames this page; it draws nothing.
const DeckBridge = () => {
  useDeckBridge()

  return null
}

export default DeckBridge
