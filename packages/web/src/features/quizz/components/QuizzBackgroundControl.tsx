import { EVENTS } from "@razzia/common/constants"
import type { BackgroundUploadResponse } from "@razzia/common/types/manager"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Image, Trash2 } from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuizzBackgroundControl = () => {
  const { background, setBackground } = useQuizzEditor()
  const { socket } = useSocket()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { t } = useTranslation()

  const uploadFile = (file: File | undefined) => {
    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      toast.error(t("manager:visuals.invalidType"))

      return
    }

    setUploading(true)
    const reader = new FileReader()

    reader.onload = () => {
      const { result } = reader

      if (typeof result !== "string") {
        setUploading(false)
        toast.error(t("manager:visuals.readFailed"))

        return
      }

      socket.emit(
        EVENTS.MANAGER.BACKGROUND_ASSET_UPLOAD,
        {
          fileName: file.name,
          mimeType: file.type,
          dataBase64: result,
        },
        (response: BackgroundUploadResponse | { error: string }) => {
          setUploading(false)

          if ("error" in response) {
            toast.error(t(response.error))

            return
          }

          setBackground(response.ref, response.url)
        },
      )
    }

    reader.onerror = () => {
      setUploading(false)
      toast.error(t("manager:visuals.readFailed"))
    }

    reader.readAsDataURL(file)
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    uploadFile(event.target.files?.[0])
    event.target.value = ""
  }

  const handleClear = () => {
    setBackground(undefined, undefined)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        className="bg-panel border-border text-text-body border px-3 py-2 text-sm font-semibold"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <Image className="size-4" />
        {uploading ? t("manager:visuals.uploading") : t("quizz:background")}
      </Button>
      {background && (
        <Button
          className="bg-panel border-border text-text-body aspect-square border px-3 py-2"
          onClick={handleClear}
          title={t("manager:visuals.clear")}
        >
          <Trash2 className="size-4" />
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  )
}

export default QuizzBackgroundControl
