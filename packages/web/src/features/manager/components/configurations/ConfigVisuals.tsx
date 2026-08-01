import { EVENTS } from "@razzia/common/constants"
import type {
  BackgroundUploadResponse,
  ManagerMutationResponse,
} from "@razzia/common/types/manager"
import {
  DEFAULT_DIALECT,
  type Dialect,
} from "@razzia/common/types/visuals"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import clsx from "clsx"
import { Image, Trash2, Upload } from "lucide-react"
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const DIALECT_OPTIONS = [
  {
    value: "dark-everywhere",
    titleKey: "manager:visuals.dialect.darkEverywhere.title",
    descriptionKey: "manager:visuals.dialect.darkEverywhere.description",
  },
  {
    value: "stage-studio",
    titleKey: "manager:visuals.dialect.stageStudio.title",
    descriptionKey: "manager:visuals.dialect.stageStudio.description",
  },
] as const satisfies ReadonlyArray<{
  value: Dialect
  titleKey: string
  descriptionKey: string
}>

const ConfigVisuals = () => {
  const { game } = useConfig()
  const { socket } = useSocket()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingDialect, setPendingDialect] = useState<Dialect | null>(null)
  const { t } = useTranslation()
  const activeDialect = game.visuals?.dialect ?? DEFAULT_DIALECT

  useEvent(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
  })

  const uploadFile = (file: File | undefined) => {
    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      toast.error(t("manager:visuals.invalidType"))

      return
    }

    setUploading(true)
    setIsDragging(false)
    const reader = new FileReader()

    reader.onload = () => {
      const { result } = reader

      if (typeof result !== "string") {
        setUploading(false)
        toast.error(t("manager:visuals.readFailed"))

        return
      }

      socket.emit(
        EVENTS.MANAGER.BACKGROUND_UPLOAD,
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

          toast.success(t("manager:visuals.updated"))
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

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (!uploading) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)

    if (uploading) {
      return
    }

    uploadFile(event.dataTransfer.files[0])
  }

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      fileInputRef.current?.click()
    }
  }

  const handleClear = () => {
    setClearing(true)
    socket.emit(
      EVENTS.MANAGER.GLOBAL_BACKGROUND_CLEAR,
      (response: ManagerMutationResponse) => {
        setClearing(false)

        if ("error" in response) {
          toast.error(t(response.error))

          return
        }

        toast.success(t("manager:visuals.cleared"))
      },
    )
  }

  const handleDialectChange = (dialect: Dialect) => () => {
    if (dialect === activeDialect || pendingDialect) {
      return
    }

    setPendingDialect(dialect)
    socket.emit(
      EVENTS.MANAGER.DIALECT_SET,
      { dialect },
      (response: ManagerMutationResponse) => {
        setPendingDialect(null)

        if ("error" in response) {
          toast.error(t(response.error))
        }
      },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-text-body text-sm font-semibold">
          {t("manager:visuals.dialect.label")}
        </legend>
        <div className="grid gap-2" role="radiogroup">
          {DIALECT_OPTIONS.map((option) => {
            const active = option.value === activeDialect

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={clsx(
                  "rounded-rz-md border px-3 py-2 text-left transition disabled:cursor-wait disabled:opacity-60",
                  active
                    ? "border-brand-border bg-brand-tint text-brand"
                    : "border-border bg-surface text-text-body hover:bg-panel",
                )}
                disabled={pendingDialect !== null}
                onClick={handleDialectChange(option.value)}
              >
                <span className="block text-sm font-semibold">
                  {t(option.titleKey)}
                </span>
                <span
                  className={clsx(
                    "block text-xs",
                    active ? "text-brand" : "text-text-muted",
                  )}
                >
                  {t(option.descriptionKey)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <div
        className={clsx(
          "border-border bg-panel focus-visible:border-brand-border relative aspect-video overflow-hidden rounded-rz-md border-2 transition-colors duration-[var(--rz-dur-fast)] ease-calm focus-visible:outline-none",
          isDragging && "border-brand-border bg-brand-tint",
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handlePreviewKeyDown}
        role="button"
        tabIndex={0}
      >
        {game.resolvedVisuals.backgroundUrl ? (
          <img
            src={game.resolvedVisuals.backgroundUrl}
            alt={t("manager:visuals.preview")}
            className="pointer-events-none size-full object-cover"
          />
        ) : (
          <div className="text-text-faint pointer-events-none flex size-full items-center justify-center">
            <Image className="size-10" />
          </div>
        )}
        {isDragging && (
          <div className="bg-surface/90 text-text-body pointer-events-none absolute inset-0 flex items-center justify-center">
            <Upload className="size-10" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          className="border-brand-border bg-brand-tint text-brand flex-1 border"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" />
          {uploading
            ? t("manager:visuals.uploading")
            : t("manager:visuals.upload")}
        </Button>
        <Button
          className="border-border bg-panel text-text-body aspect-square border px-3"
          disabled={!game.visuals?.background || clearing || uploading}
          onClick={handleClear}
          title={t("manager:visuals.clear")}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

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

export default ConfigVisuals
