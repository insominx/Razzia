import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import Button from "@razzia/web/components/Button"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
}

const AlertDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: Props) => {
  const { t } = useTranslation()

  return (
    <RadixAlertDialog.Root>
      <RadixAlertDialog.Trigger asChild>{trigger}</RadixAlertDialog.Trigger>

      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="bg-overlay data-[state=open]:animate-fade-in fixed inset-0 z-50" />

        <RadixAlertDialog.Content className="bg-surface border-border text-text-body rounded-rz-lg fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 border p-6">
          <RadixAlertDialog.Title className="text-text-primary text-lg font-semibold">
            {title}
          </RadixAlertDialog.Title>

          <RadixAlertDialog.Description className="text-text-muted mt-2">
            {description}
          </RadixAlertDialog.Description>

          <div className="mt-6 flex justify-end gap-2">
            <RadixAlertDialog.Cancel asChild>
              <Button className="bg-panel border-border text-text-body border px-4 py-2 text-sm font-semibold">
                {t("common:cancel")}
              </Button>
            </RadixAlertDialog.Cancel>

            <RadixAlertDialog.Action asChild>
              <Button
                className="bg-danger text-on-accent px-4 py-2 text-sm font-semibold hover:brightness-95 active:brightness-90"
                onClick={onConfirm}
              >
                {confirmLabel ?? t("common:confirm")}
              </Button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  )
}

export default AlertDialog
