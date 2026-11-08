/**
 * A result's date for a list: "08 Nov 2026 · 12:30", in the browser's own
 * locale (the app's language switch does not change it). This is the format of
 * the quiz Results tab, kept as its own copy so that tab stays untouched.
 */
export const formatResultDate = (iso: string): string => {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return `${date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
}
