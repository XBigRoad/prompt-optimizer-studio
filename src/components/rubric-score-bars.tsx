import { AlertCircle, CheckCircle2 } from 'lucide-react'

export interface RubricDimensionView {
  id: string
  label: string
  max: number
}

type RubricScoreStatus = 'pass' | 'near' | 'miss'

const PASS_RATIO = 0.9
const NEAR_RATIO = 0.7

export function RubricScoreBars({
  dimensionScores,
  rubricDimensions,
  rubricDimensionsSnapshot,
  noteMessages,
}: {
  dimensionScores: Record<string, number> | null | undefined
  rubricDimensions?: RubricDimensionView[]
  rubricDimensionsSnapshot?: RubricDimensionView[] | null
  noteMessages?: {
    unstructured?: string
    snapshotUnavailable?: string
    pass?: string
    miss?: string
  }
}) {
  if (!dimensionScores) {
    return null
  }

  const resolved = resolveRubricDisplay({
    dimensionScores,
    rubricDimensions,
    rubricDimensionsSnapshot,
  })
  if (resolved.kind === 'none') {
    return null
  }

  if (resolved.kind === 'note') {
    return <p className="small rubric-score-note">{resolved.message(noteMessages)}</p>
  }

  return (
    <div className="rubric-score-bars" aria-label="Rubric dimension scores">
      {resolved.items.map((item) => (
        <div className={`rubric-score-row is-${item.status}`} data-status={item.status} key={item.id}>
          <div className="rubric-score-meta">
            <span className="rubric-score-label">{item.label}</span>
            <span className="rubric-score-value-wrap">
              {item.status === 'pass' ? (
                <span className="rubric-score-state-icon" aria-label={noteMessages?.pass ?? '已达标'}>
                  <CheckCircle2 aria-hidden="true" size={14} />
                </span>
              ) : null}
              {item.status === 'miss' ? (
                <span className="rubric-score-state-icon" aria-label={noteMessages?.miss ?? '未达标'}>
                  <AlertCircle aria-hidden="true" size={14} />
                </span>
              ) : null}
              <span className="rubric-score-value">{item.score} / {item.max}</span>
            </span>
          </div>
          <div className="rubric-score-track" aria-hidden="true">
            <span className="rubric-score-fill" style={{ width: `${item.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function resolveRubricDisplay(input: {
  dimensionScores: Record<string, number>
  rubricDimensions?: RubricDimensionView[]
  rubricDimensionsSnapshot?: RubricDimensionView[] | null
}) {
  const snapshotItems = buildScoreItems(input.dimensionScores, input.rubricDimensionsSnapshot ?? null)
  if (snapshotItems) {
    return { kind: 'bars' as const, items: snapshotItems }
  }

  if (Array.isArray(input.rubricDimensionsSnapshot) && input.rubricDimensionsSnapshot.length > 0) {
    return { kind: 'note' as const, message: getSnapshotUnavailableMessage }
  }

  if (input.rubricDimensions === undefined) {
    return { kind: 'none' as const }
  }

  if (input.rubricDimensions.length === 0) {
    return { kind: 'note' as const, message: getUnstructuredRubricMessage }
  }

  const fallbackItems = buildScoreItems(input.dimensionScores, input.rubricDimensions)
  if (fallbackItems) {
    return { kind: 'bars' as const, items: fallbackItems }
  }

  return { kind: 'note' as const, message: getSnapshotUnavailableMessage }
}

function buildScoreItems(
  dimensionScores: Record<string, number>,
  dimensions: RubricDimensionView[] | null,
) {
  if (!dimensions || dimensions.length === 0) {
    return null
  }

  const scoreEntries = Object.entries(dimensionScores)
  const dimensionIds = new Set(dimensions.map((dimension) => dimension.id))
  if (scoreEntries.length === 0 || scoreEntries.some(([id]) => !dimensionIds.has(id))) {
    return null
  }

  const items = dimensions.map((dimension) => {
    const score = dimensionScores[dimension.id]
    if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > dimension.max) {
      return null
    }

    const ratio = dimension.max > 0 ? score / dimension.max : 0
    return {
      ...dimension,
      score,
      percent: Math.max(0, Math.min(100, ratio * 100)),
      status: getRubricScoreStatus(ratio),
    }
  })

  if (items.some((item) => item === null) || items.length !== scoreEntries.length) {
    return null
  }

  return items as Array<RubricDimensionView & {
    score: number
    percent: number
    status: RubricScoreStatus
  }>
}

function getRubricScoreStatus(ratio: number): RubricScoreStatus {
  if (ratio >= PASS_RATIO) {
    return 'pass'
  }
  if (ratio >= NEAR_RATIO) {
    return 'near'
  }
  return 'miss'
}

function getUnstructuredRubricMessage(noteMessages?: { unstructured?: string }) {
  return noteMessages?.unstructured ?? '当前评分标准不是结构化分项格式，暂不显示分项分数条。'
}

function getSnapshotUnavailableMessage(noteMessages?: { snapshotUnavailable?: string }) {
  return noteMessages?.snapshotUnavailable ?? '该轮评分标准快照不可用，暂不显示分项分数条。'
}
