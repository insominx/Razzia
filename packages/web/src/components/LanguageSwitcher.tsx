import * as Select from "@radix-ui/react-select"
import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"

const LANGUAGES = [
  { code: "de", label: "common:language.de" },
  { code: "en", label: "common:language.en" },
  { code: "es", label: "common:language.es" },
  { code: "fr", label: "common:language.fr" },
  { code: "it", label: "common:language.it" },
  { code: "ja", label: "common:language.ja" },
]

const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation()
  const normalizedLanguage = i18n.language.slice(0, 2)

  return (
    <Select.Root
      value={normalizedLanguage}
      onValueChange={(lang) => i18n.changeLanguage(lang)}
    >
      <Select.Trigger className="border-border bg-surface text-text-body hover:border-brand rounded-rz-md flex cursor-pointer items-center gap-1.5 border px-2 py-1.5 text-sm font-semibold transition-colors ease-calm focus:outline-none">
        <Globe className="text-text-muted size-4" />
        <Select.Value>{normalizedLanguage.toUpperCase()}</Select.Value>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="border-border bg-surface text-text-body rounded-rz-md z-50 min-w-32 overflow-hidden border"
        >
          <Select.Viewport className="p-1">
            {LANGUAGES.map((l) => (
              <Select.Item
                key={l.code}
                value={l.code}
                className="hover:bg-brand-tint focus:bg-brand-tint rounded-rz-sm flex cursor-pointer items-center px-3 py-1.5 text-sm outline-none transition-colors ease-calm data-[state=checked]:font-semibold"
              >
                <Select.ItemText>{t(l.label)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export default LanguageSwitcher
