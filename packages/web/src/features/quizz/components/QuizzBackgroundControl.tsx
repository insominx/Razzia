import Button from "@razzia/web/components/Button"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useBackgroundUpload } from "@razzia/web/features/visuals/use-background-upload"
import { Image, Trash2 } from "lucide-react"
import { type ChangeEvent, useRef } from "react"
import { useTranslation } from "react-i18next"

const QuizzBackgroundControl = () => {
  const { background, setBackground } = useQuizzEditor()
  const globalBackgroundUrl = useManagerStore(
    (state) => state.config?.game.resolvedVisuals.backgroundUrl,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  const { uploading, uploadFile } = useBackgroundUpload({
    onSuccess: (uploaded) => {
      setBackground(uploaded.ref, uploaded.url)
    },
  })

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(event.target.files?.[0])
    event.target.value = ""
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
          onClick={() => setBackground(undefined, globalBackgroundUrl)}
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
