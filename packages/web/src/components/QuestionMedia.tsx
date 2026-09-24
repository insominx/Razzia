import { MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import { type ReactNode, useState } from "react"

interface Props {
  media?: QuestionMediaType
  alt?: string
  /**
   * Rendered in place of media that failed to load. Defaults to nothing: on
   * stage the question already carries the prompt, and a broken image would
   * otherwise print its alt text (the whole question again) under it.
   */
  fallback?: ReactNode
}

const QuestionMedia = ({ media, alt = "", fallback = null }: Props) => {
  const [failed, setFailed] = useState<string | null>(null)
  const mediaKey = media ? `${media.type}:${media.url}` : null

  if (mediaKey !== null && failed === mediaKey) {
    return fallback
  }

  const handleError = () => {
    setFailed(mediaKey)
  }

  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img
        alt={alt}
        src={media.url}
        onError={handleError}
        className="max-h-60 w-auto rounded-md sm:max-h-100"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <video
        className="m-4 mb-2 aspect-video max-h-60 w-auto rounded-md px-4 sm:max-h-100"
        src={media.url}
        onError={handleError}
        autoPlay
        controls
      />
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <audio
        className="m-4 mb-2 w-auto rounded-md"
        src={media.url}
        onError={handleError}
        autoPlay
        controls
      />
    )
  }

  return null
}

export default QuestionMedia
