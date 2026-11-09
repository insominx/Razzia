/**
 * The Director's fit report: does every real question fit its screen, at the
 * sizes the show is played on? Evaluation is pure; only `measureDocument` reads
 * a DOM, and it reads one that a harness frame has already laid out.
 */

export type FitView = "host" | "phone"

/**
 * The screens whose layout depends on the question text. `wait` is a phone that
 * has locked in: it holds the tile it picked, so the answer's own text sets it.
 */
export type FitScreen = "question" | "answers" | "responses" | "wait"

export interface FitSize {
  id: string
  label: string
  view: FitView
  width: number
  height: number
}

/** The plan's verification matrix: projector at 1080p/720p, phone and small phone. */
export const FIT_SIZES: readonly FitSize[] = [
  {
    id: "host-1080",
    label: "1920×1080",
    view: "host",
    width: 1920,
    height: 1080,
  },
  { id: "host-720", label: "1280×720", view: "host", width: 1280, height: 720 },
  { id: "phone-844", label: "390×844", view: "phone", width: 390, height: 844 },
  { id: "phone-640", label: "360×640", view: "phone", width: 360, height: 640 },
]

/**
 * Results only exist on the host: a phone gets the personal verdict, which
 * carries no question text.
 */
export const FIT_SCREENS: Record<FitView, readonly FitScreen[]> = {
  host: ["question", "answers", "responses"],
  phone: ["question", "answers", "wait"],
}

/** Sub-pixel layout rounding is not overflow. */
export const FIT_TOLERANCE_PX = 1

export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

/** Document coordinates, as if the page were scrolled to the top. */
export interface FrameMeasurement {
  client: { width: number; height: number }
  scroll: { width: number; height: number }
  /** Answer tiles, wherever they appear. */
  tiles: Box[]
  /** Result chart rows. */
  rows: Box[]
  /** Containers that must hold what is in them: the prompt, each tile. */
  boxes: Array<{ clientHeight: number; scrollHeight: number }>
}

/** The projector's safe area: heads in the front rows hide the bottom 8%. */
export const SAFE_BOTTOM_SHARE = 0.92

export interface FitResult {
  overflowX: number
  overflowY: number
  tiles: number
  tilesOffscreen: number
  rowsOffscreen: number
  /** Tiles that reach into the bottom 8% of the frame (projector only). */
  tilesUnsafe: number
  /** Containers whose content is taller than they are. */
  boxesOverflowing: number
  ok: boolean
}

export interface FitOptions {
  /** Share of the height tiles must stay above; omit where it does not apply. */
  safeBottomShare?: number
}

const isOffscreen = (box: Box, client: FrameMeasurement["client"]): boolean =>
  box.top < -FIT_TOLERANCE_PX ||
  box.left < -FIT_TOLERANCE_PX ||
  box.bottom > client.height + FIT_TOLERANCE_PX ||
  box.right > client.width + FIT_TOLERANCE_PX

const overflowBy = (scroll: number, client: number): number =>
  Math.max(0, scroll - client) > FIT_TOLERANCE_PX
    ? Math.round(scroll - client)
    : 0

export const evaluateFit = (
  measurement: FrameMeasurement,
  { safeBottomShare }: FitOptions = {},
): FitResult => {
  const { client, scroll, tiles, rows, boxes } = measurement
  const overflowX = overflowBy(scroll.width, client.width)
  const overflowY = overflowBy(scroll.height, client.height)
  const tilesOffscreen = tiles.filter((box) => isOffscreen(box, client)).length
  const rowsOffscreen = rows.filter((box) => isOffscreen(box, client)).length
  const boxesOverflowing = boxes.filter(
    (box) => box.scrollHeight - box.clientHeight > FIT_TOLERANCE_PX,
  ).length
  const limit =
    safeBottomShare === undefined ? null : client.height * safeBottomShare
  // Off-screen tiles are already counted; the safe area is about the ones that
  // are on screen but too low to be seen from the room.
  const tilesUnsafe =
    limit === null
      ? 0
      : tiles.filter(
          (box) =>
            !isOffscreen(box, client) && box.bottom > limit + FIT_TOLERANCE_PX,
        ).length

  return {
    overflowX,
    overflowY,
    tiles: tiles.length,
    tilesOffscreen,
    rowsOffscreen,
    tilesUnsafe,
    boxesOverflowing,
    ok:
      overflowX === 0 &&
      overflowY === 0 &&
      tilesOffscreen === 0 &&
      rowsOffscreen === 0 &&
      tilesUnsafe === 0 &&
      boxesOverflowing === 0,
  }
}

export interface FitRow {
  quiz: string
  /** 1-based, as the room sees it. */
  question: number
  size: string
  screen: FitScreen
  result: FitResult
}

export interface FitReport {
  generatedAt: string
  rows: FitRow[]
}

export interface FitGroup {
  size: string
  screen: FitScreen
  total: number
  failing: number
  worstOverflowY: number
  /** Questions with at least one answer tile off screen. */
  tilesOffscreen: number
  worst: FitRow | null
}

/** One line per size and screen, in matrix order, for the report table. */
export const summarizeFit = (rows: readonly FitRow[]): FitGroup[] => {
  const groups = new Map<string, FitGroup>()

  for (const row of rows) {
    const key = `${row.size}/${row.screen}`
    const group = groups.get(key) ?? {
      size: row.size,
      screen: row.screen,
      total: 0,
      failing: 0,
      worstOverflowY: 0,
      tilesOffscreen: 0,
      worst: null,
    }

    group.total += 1
    group.failing += row.result.ok ? 0 : 1
    group.tilesOffscreen += row.result.tilesOffscreen > 0 ? 1 : 0

    if (row.result.overflowY > group.worstOverflowY) {
      group.worstOverflowY = row.result.overflowY
      group.worst = row
    }

    groups.set(key, group)
  }

  return [...groups.values()]
}

/** The Phase 1 gate: zero overflow and no off-screen tiles anywhere. */
export const fitPasses = (rows: readonly FitRow[]): boolean =>
  rows.length > 0 && rows.every((row) => row.result.ok)

const TILE_SELECTOR = "[data-answer-tile]"
const ROW_SELECTOR = "[data-response-row]"
const BOX_SELECTOR = "[data-fit-box]"
const SCROLLS = new Set(["auto", "scroll"])

/**
 * Where a box's content really ends: the bottom of its last child, from its
 * own top. `scrollHeight` also counts the empty inline box under the last line
 * of text (about half a rem at display size), which no one sees and which would
 * fail a box that has room to spare.
 */
const contentHeight = (el: Element): number => {
  const { top } = el.getBoundingClientRect()

  return Math.max(
    el.clientHeight,
    ...[...el.children].map(
      (child) => child.getBoundingClientRect().bottom - top,
    ),
  )
}

const boxOf = (element: Element, win: Window): Box => {
  const rect = element.getBoundingClientRect()

  return {
    top: rect.top + win.scrollY,
    right: rect.right + win.scrollX,
    bottom: rect.bottom + win.scrollY,
    left: rect.left + win.scrollX,
  }
}

/**
 * Reads a laid-out frame. Rects are shifted into document coordinates so a
 * frame that happens to be scrolled measures the same as one at the top.
 */
export const measureDocument = (
  doc: Document,
  win: Window,
): FrameMeasurement => {
  const root = doc.documentElement

  return {
    client: { width: root.clientWidth, height: root.clientHeight },
    scroll: { width: root.scrollWidth, height: root.scrollHeight },
    tiles: [...doc.querySelectorAll(TILE_SELECTOR)].map((el) => boxOf(el, win)),
    rows: [...doc.querySelectorAll(ROW_SELECTOR)].map((el) => boxOf(el, win)),
    // A box that scrolls by design (a phone's prompt) is allowed to hold more.
    boxes: [...doc.querySelectorAll(BOX_SELECTOR)]
      .filter((el) => !SCROLLS.has(win.getComputedStyle(el).overflowY))
      .map((el) => ({
        clientHeight: el.clientHeight,
        scrollHeight: contentHeight(el),
      })),
  }
}
