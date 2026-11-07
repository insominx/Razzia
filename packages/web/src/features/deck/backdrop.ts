export type Backdrop = "own" | "slide"

/**
 * The quiz stands on its own night-sky backdrop. A lecture deck can ask for the
 * slide behind the page to show through instead, so each lecture's quiz reads
 * as part of its deck. The page only turns its own fills clear (see
 * `html[data-backdrop="slide"]` in index.css); the deck decides whether its
 * frame is clear too.
 */
export const applyBackdrop = (
  mode: Backdrop,
  root: HTMLElement = document.documentElement,
): void => {
  if (mode === "slide") {
    root.dataset.backdrop = "slide"
  } else {
    delete root.dataset.backdrop
  }
}
