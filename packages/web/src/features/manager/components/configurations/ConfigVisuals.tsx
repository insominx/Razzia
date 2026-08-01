import { EVENTS } from "@razzia/common/constants"
import type { ManagerMutationResponse } from "@razzia/common/types/manager"
import {
  DEFAULT_DIALECT,
  type Dialect,
} from "@razzia/common/types/visuals"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useBackgroundUpload } from "@razzia/web/features/visuals/use-background-upload"
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
  const [clearing, setClearing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingDialect, setPendingDialect] = useState<Dialect | null>(null)
  const { t } = useTranslation()
  const activeDialect = game.visuals?.dialect ?? DEFAULT_DIALECT
  const { uploading, uploadFile } = useBackgroundUpload({
    setGlobal: true,
    onSuccess: async () => {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
      toast.success(t("manager:visuals.updated"))
    },
  })

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(event.target.files?.[0])
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

    if (!uploading) {
      void uploadFile(event.dataTransfer.files[0])
    }
  }

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!uploading && (event.key === "Enter" || event.key === " ")) {
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

  const openPicker = () => {
    if (!uploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p className="text-text-muted text-xs">
        {t("manager:visuals.globalDefaultHelp")}
      </p>

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
                  "rounded-rz-md border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60",
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
          "border-border bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand relative aspect-video overflow-hidden rounded-rz-md border-2 transition-colors duration-[var(--rz-dur-fast)] ease-calm",
          isDragging && "border-brand-border bg-brand-tint",
          uploading && "pointer-events-none opacity-60",
        )}
        onClick={openPicker}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handlePreviewKeyDown}
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-label={t("manager:visuals.upload")}
        aria-busy={uploading}
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

      <p className="text-text-muted text-xs">{t("manager:visuals.uploadLimits")}</p>

      <div className="flex gap-2">
        <Button
          className="border-brand-border bg-brand-tint text-brand flex-1 border"
          disabled={uploading}
          onClick={openPicker}
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
          aria-label={t("manager:visuals.clear")}
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
