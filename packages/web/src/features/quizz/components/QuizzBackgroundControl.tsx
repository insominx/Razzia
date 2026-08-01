import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import {
  uploadBackgroundViaHttp,
  validateBackgroundFile,
} from "@razzia/web/features/visuals/background-upload"
import { Image, Trash2 } from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuizzBackgroundControl = () => {
  const { background, setBackground, clearBackground } = useQuizzEditor()
  const globalBackgroundUrl = useManagerStore(
    (state) => state.config?.game.resolvedVisuals.backgroundUrl,
  )
  const { clientId } = useSocket()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadGeneration = useRef(0)
  const [uploading, setUploading] = useState(false)
  const { t } = useTranslation()

  const uploadFile = async (file: File | undefined) => {
    if (!file || uploading) {
      return
    }

    const validation = validateBackgroundFile(file)

    if (!validation.ok) {
      toast.error(t(validation.error))

      return
    }

    const generation = ++uploadGeneration.current
    setUploading(true)

    try {
      const uploaded = await uploadBackgroundViaHttp(file, clientId)

      if (generation === uploadGeneration.current) {
        setBackground(uploaded.ref, uploaded.url)
      }
    } catch (error) {
      if (generation === uploadGeneration.current) {
        const message =
          error instanceof Error
            ? error.message
            : "errors:visuals.backgroundUploadFailed"

        toast.error(t(message))
      }
    } finally {
      if (generation === uploadGeneration.current) {
        setUploading(false)
      }
    }
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(event.target.files?.[0])
    event.target.value = ""
  }

  const handleClear = () => {
    clearBackground(globalBackgroundUrl)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        className="bg-panel border-border text-text-body border px-3 py-2 text-sm font-semibold"
        disabled={uploading}
        aria-busy={uploading}
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
          aria-label={t("manager:visuals.clear")}
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
