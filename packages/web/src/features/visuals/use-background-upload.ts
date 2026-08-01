import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import {
  uploadBackgroundViaHttp,
  validateBackgroundFile,
} from "@razzia/web/features/visuals/background-upload"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import type { BackgroundUploadResponse } from "@razzia/common/types/manager"

export const useBackgroundUpload = (options?: {
  setGlobal?: boolean
  onSuccess?: (_uploaded: BackgroundUploadResponse) => void | Promise<void>
}) => {
  const { clientId } = useSocket()
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)

  const uploadFile = async (file: File | undefined) => {
    if (!file || uploading) {
      return
    }

    const validation = validateBackgroundFile(file)

    if (!validation.ok) {
      toast.error(t(validation.error))

      return
    }

    setUploading(true)

    try {
      const uploaded = await uploadBackgroundViaHttp(file, clientId, {
        setGlobal: options?.setGlobal,
      })
      await options?.onSuccess?.(uploaded)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "errors:visuals.backgroundUploadFailed"

      toast.error(t(message))
    } finally {
      setUploading(false)
    }
  }

  return { uploading, uploadFile }
}
