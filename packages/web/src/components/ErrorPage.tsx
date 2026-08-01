import Background from "@razzia/web/components/Background"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import { useRouter } from "@tanstack/react-router"
import { CircleX } from "lucide-react"
import { useTranslation } from "react-i18next"

const ErrorPage = ({ error }: { error: Error }) => {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <Background>
      <Card className="max-w-md gap-4 text-center">
        <CircleX className="text-danger mx-auto size-12" />
        <div className="flex flex-col gap-1">
          <h1 className="text-text-primary text-xl font-bold">
            {t("errors:route.title")}
          </h1>
          <p className="text-text-muted text-sm">
            {t("errors:route.description")}
          </p>
        </div>
        {error.message && (
          <pre className="bg-panel border-border rounded-rz-md max-h-60 overflow-auto border px-3 py-2 text-left font-mono text-sm wrap-break-word">
            {error.message}
          </pre>
        )}
        <Button onClick={() => router.navigate({ to: "/" })}>
          {t("errors:route.back")}
        </Button>
      </Card>
    </Background>
  )
}

export default ErrorPage
