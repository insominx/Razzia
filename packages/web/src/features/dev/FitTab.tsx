import type { DirectorApi } from "@razzia/web/features/dev/director-api"
import { Button } from "@razzia/web/features/dev/director-ui"
import {
  FIT_SIZES,
  type FitGroup,
  fitPasses,
  type FitReport,
  type FitRow,
  summarizeFit,
} from "@razzia/web/features/dev/fit"
import FrameView from "@razzia/web/features/dev/FrameView"
import {
  allQuestions,
  type FixtureId,
  QUIZ_LOAD_ERRORS,
  QUIZZES,
} from "@razzia/web/features/dev/fixtures"
import { FIT_FIXTURE, runFit } from "@razzia/web/features/dev/run-fit"
import clsx from "clsx"
import { useMemo, useRef, useState } from "react"

export interface InspectTarget {
  fixture: FixtureId
  quizId: string
  question: number
  sizeId: string
}

interface Props {
  /** Held by the shell, so a report survives a trip to another tab. */
  report: FitReport | null
  onReport: (report: FitReport | null) => void
  onInspect: (target: InspectTarget) => void
}

const sizeLabel = (sizeId: string) => {
  const size = FIT_SIZES.find((candidate) => candidate.id === sizeId)

  return size
    ? `${size.view === "host" ? "Projector" : "Phone"} ${size.label}`
    : sizeId
}

const describe = (row: FitRow) => {
  const {
    overflowY,
    overflowX,
    tilesOffscreen,
    rowsOffscreen,
    tilesUnsafe,
    boxesOverflowing,
  } = row.result
  const parts = [
    overflowY > 0 && `page ${overflowY} px too tall`,
    overflowX > 0 && `${overflowX} px too wide`,
    tilesOffscreen > 0 &&
      `${tilesOffscreen} of ${row.result.tiles} tiles off screen`,
    rowsOffscreen > 0 && `${rowsOffscreen} chart rows off screen`,
    tilesUnsafe > 0 && `${tilesUnsafe} tiles in the bottom 8%`,
    boxesOverflowing > 0 && `${boxesOverflowing} boxes hold too much`,
  ].filter(Boolean)

  return parts.join(", ")
}

const SummaryRow = ({
  group,
  rows,
  onInspect,
}: {
  group: FitGroup
  rows: readonly FitRow[]
  onInspect: Props["onInspect"]
}) => {
  const failing = rows.filter(
    (row) =>
      row.size === group.size && row.screen === group.screen && !row.result.ok,
  )

  return (
    <>
      <tr className="border-border border-t">
        <td className="py-2 pr-4 font-semibold">{sizeLabel(group.size)}</td>
        <td className="py-2 pr-4 capitalize">{group.screen}</td>
        <td
          className={clsx(
            "py-2 pr-4 font-mono font-bold",
            group.failing === 0 ? "text-success" : "text-danger",
          )}
        >
          {group.failing === 0 ? "fits" : `${group.failing} of ${group.total}`}
        </td>
        <td className="py-2 pr-4 font-mono">{group.tilesOffscreen || "–"}</td>
        <td className="py-2 font-mono">
          {group.worstOverflowY > 0 ? `${group.worstOverflowY} px` : "–"}
        </td>
      </tr>
      {failing.length > 0 && (
        <tr>
          <td colSpan={5} className="pb-3">
            <details>
              <summary className="text-info cursor-pointer text-xs font-semibold">
                {`Show the ${failing.length} that do not fit`}
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {failing.map((row) => (
                  <li
                    key={`${row.quiz}-${row.question}`}
                    className="flex gap-3"
                  >
                    <button
                      type="button"
                      className="text-info font-mono underline"
                      onClick={() =>
                        onInspect({
                          fixture: FIT_FIXTURE[row.screen],
                          quizId: row.quiz,
                          question: row.question - 1,
                          sizeId: row.size,
                        })
                      }
                    >
                      {`${row.quiz} #${row.question}`}
                    </button>
                    <span className="text-text-muted">{describe(row)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Lays every real question out on every screen at the four sizes the show is
 * played on, and reports what does not fit. The plan's Phase 1 gate is this
 * report with no failures.
 */
const FitTab = ({ report, onReport, onInspect }: Props) => {
  const [apis, setApis] = useState<Record<string, DirectorApi | null>>({})
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const questions = useMemo(() => allQuestions(), [])
  const apiSetters = useMemo(
    () =>
      Object.fromEntries(
        FIT_SIZES.map((size) => [
          size.id,
          (api: DirectorApi | null) => {
            setApis((previous) => ({ ...previous, [size.id]: api }))
          },
        ]),
      ),
    [],
  )

  const ready = FIT_SIZES.every((size) => apis[size.id])
  const running = progress !== null
  const groups = useMemo(
    () => (report ? summarizeFit(report.rows) : []),
    [report],
  )
  const first = questions.at(0)

  const run = async () => {
    const frames = FIT_SIZES.flatMap((size) => {
      const api = apis[size.id]

      return api ? [{ size, api }] : []
    })

    abort.current = new AbortController()
    setError(null)
    onReport(null)
    setProgress({ done: 0, total: 1 })

    try {
      const result = await runFit({
        frames,
        questions,
        signal: abort.current.signal,
        onProgress: (done, total) => {
          // Rows land every few milliseconds; the bar need not.
          if (done % 8 === 0 || done === total) {
            setProgress({ done, total })
          }
        },
      })

      onReport(abort.current.signal.aborted ? null : result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setProgress(null)
    }
  }

  const json = report ? JSON.stringify(report, null, 2) : ""

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button active={running} disabled={!ready || running} onClick={run}>
          {running ? "Running…" : "Run fit report"}
        </Button>
        {running && (
          <Button onClick={() => abort.current?.abort()}>Cancel</Button>
        )}
        <p className="text-text-muted text-sm">
          {`${questions.length} questions in ${QUIZZES.length} quizzes`}
          {progress && ` · ${progress.done} of ${progress.total} checks`}
          {!ready && " · starting frames…"}
        </p>
      </div>

      {QUIZ_LOAD_ERRORS.length > 0 && (
        <p role="alert" className="text-danger text-sm">
          {`Not checked, invalid: ${QUIZ_LOAD_ERRORS.join("; ")}`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {report && (
        <section aria-label="Fit report" className="flex flex-col gap-3">
          <p
            className={clsx(
              "text-lg font-bold",
              fitPasses(report.rows) ? "text-success" : "text-danger",
            )}
            data-fit-verdict={fitPasses(report.rows) ? "pass" : "fail"}
          >
            {fitPasses(report.rows)
              ? `Everything fits (${report.rows.length} checks).`
              : `${report.rows.filter((row) => !row.result.ok).length} of ${report.rows.length} checks do not fit.`}
          </p>
          <table className="w-full max-w-4xl text-left text-sm">
            <thead className="text-text-muted text-xs tracking-widest uppercase">
              <tr>
                <th className="pr-4 pb-2">Size</th>
                <th className="pr-4 pb-2">Screen</th>
                <th className="pr-4 pb-2">Does not fit</th>
                <th className="pr-4 pb-2">Tiles off screen</th>
                <th className="pb-2">Worst overflow</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <SummaryRow
                  key={`${group.size}/${group.screen}`}
                  group={group}
                  rows={report.rows}
                  onInspect={onInspect}
                />
              ))}
            </tbody>
          </table>
          <details>
            <summary className="text-info cursor-pointer text-xs font-semibold">
              Raw report (JSON)
            </summary>
            <textarea
              readOnly
              id="fit-report-json"
              aria-label="Fit report JSON"
              className="border-border bg-panel mt-2 h-48 w-full rounded-md border p-2 font-mono text-xs"
              value={json}
            />
          </details>
        </section>
      )}

      {/* The measuring frames. They stay on screen, small, so a run can be
          watched and a layout that fails here can be seen failing. */}
      {first && (
        <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">
          {FIT_SIZES.map((size) => (
            <FrameView
              key={size.id}
              view={size.view}
              label={sizeLabel(size.id)}
              size={size}
              fixture={{
                fixture: "answers",
                quizId: first.quizId,
                question: first.index,
              }}
              dialect="dark-everywhere"
              surface="stage"
              motion="off"
              onApi={apiSetters[size.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FitTab
