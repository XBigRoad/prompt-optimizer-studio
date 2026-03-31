import { ReviewSuggestionPanel } from '@/components/review-suggestion-panel'
import { RubricScoreBars, type RubricDimensionView } from '@/components/rubric-score-bars'
import { getLocalizedDriftLabel } from '@/lib/drift-labels'
import { useI18n, useLocaleText } from "@/lib/i18n"
import { summarizePromptDelta } from '@/lib/prompt-text'
import type { ReviewSuggestionAddResult } from '@/lib/review-suggestion-drafts'
import {
  isReviewFallbackFinding,
  isReviewFallbackMajorChange,
  isReviewFallbackSuggestedChange,
  stripFallbackItems,
} from '@/lib/review-fallbacks'
import { resolveNarrativeReviewSummary, stripTopBandGatekeeperFindings } from '@/lib/review-summary'
import type { SteeringItem } from "@/lib/server/types"

interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
  dimensionScores?: Record<string, number> | null
  dimensionReasons?: string[] | null
  rubricDimensionsSnapshot?: RubricDimensionView[] | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
}

export interface RoundCandidateView {
  id: string
  roundNumber: number
  optimizedPrompt: string
  strategy: "preserve" | "rebuild"
  scoreBefore: number
  averageScore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  aggregatedIssues: string[]
  appliedSteeringItems: SteeringItem[]
  judges: JudgeRun[]
}

export function JobRoundCard({
  candidate,
  expanded,
  onToggle,
  onAddReviewSuggestions,
  addingReviewSuggestions = false,
  reviewSuggestionTarget = 'pending',
  showReviewSuggestionAutomationControls = false,
  autoApplyReviewSuggestions = false,
  onReviewSuggestionTargetChange,
  onToggleAutoApplyReviewSuggestions,
  rubricDimensions,
}: {
  candidate: RoundCandidateView
  expanded: boolean
  onToggle: () => void
  onAddReviewSuggestions?: (items: string[]) => Promise<ReviewSuggestionAddResult | void> | ReviewSuggestionAddResult | void
  addingReviewSuggestions?: boolean
  reviewSuggestionTarget?: 'pending' | 'stable'
  showReviewSuggestionAutomationControls?: boolean
  autoApplyReviewSuggestions?: boolean
  onReviewSuggestionTargetChange?: (target: 'pending' | 'stable') => void
  onToggleAutoApplyReviewSuggestions?: (items: string[]) => Promise<void> | void
  rubricDimensions?: RubricDimensionView[]
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const review = candidate.judges[0]
  const majorChanges = normalizeMajorChanges(candidate.majorChanges)
  const actualChangeItems = getCandidateActualChangeItems(candidate, majorChanges, text)
  const reviewSuggestionItems = getCandidateReviewSuggestionItems(review?.suggestedChanges ?? [])
  const displaySummary = resolveNarrativeReviewSummary(review?.summary ?? '', review?.findings ?? [], review?.dimensionReasons ?? [])
  const findings = normalizeFindings(review?.findings ?? [], displaySummary)
  const hasSupportInsights = actualChangeItems.length > 0 || reviewSuggestionItems.length > 0
  const hasSupportColumn = actualChangeItems.length > 0 || reviewSuggestionItems.length > 0
  const hasReviewInsights = findings.length > 0
    || Boolean(review?.driftExplanation?.trim())
    || Boolean(review?.driftLabels.length)
    || Boolean(review?.summary?.trim())
  const hasCredibleReviewScore = hasVisibleReviewScore(candidate.averageScore, review?.dimensionScores)
  const hasDetailPanels = hasSupportInsights || hasReviewInsights
  const preview = expanded && review?.summary?.trim()
    ? getExpandedPreviewText({
      hasReviewInsights,
      hasActualChanges: actualChangeItems.length > 0,
      hasReviewSuggestions: reviewSuggestionItems.length > 0,
      text,
    })
    : displaySummary || text("暂无评分摘要。", "No scoring summary yet.")

  return (
    <article className={`round-card compact-round round-card-minimal${expanded ? " expanded" : ""}`}>
      <div className="round-header">
        <div className="inline-actions">
          <span className="pill running">{locale === "zh-CN" ? `第 ${candidate.roundNumber} 轮` : `Round ${candidate.roundNumber}`}</span>
          <span className="pill completed">
            {hasCredibleReviewScore
              ? text(`这版提示词得分 ${candidate.averageScore.toFixed(2)}`, `Prompt score ${candidate.averageScore.toFixed(2)}`)
              : text('这版提示词暂未评分', 'Prompt not scored yet')}
          </span>
          <span className={`pill ${review?.hasMaterialIssues ? "manual_review" : "completed"}`}>
            {review?.hasMaterialIssues ? text("需继续优化", "Needs more work") : text("本轮通过", "Passed this round")}
          </span>
        </div>
        <button className="button ghost" type="button" onClick={onToggle}>
          {expanded ? text("收起详情", "Hide details") : text("查看详情", "View details")}
        </button>
      </div>
      <div className="round-diagnostic-preview">
        <p className="small round-preview">{preview}</p>
        {!expanded ? (
          <p className="meta round-hint">{text("展开后可查看完整诊断信息。", "Expand to inspect the full diagnostic details.")}</p>
        ) : null}
      </div>
      {expanded ? (
        <div className="shell round-diagnostic-body">
          {candidate.appliedSteeringItems.length > 0 ? (
            <div className="panel applied-steering-panel">
              <strong>{text("本轮采用的人工引导", "Applied steering for this round")}</strong>
              <ul className="list compact-list">
                {candidate.appliedSteeringItems.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="fold-card" open>
            <summary>{text("查看优化后提示词", "View optimized prompt")}</summary>
            <pre className="pre compact">{candidate.optimizedPrompt}</pre>
          </details>
          {!hasDetailPanels ? (
            <div className="notice">{text("这一轮没有额外诊断细节。", "This round has no extra diagnostic details.")}</div>
          ) : (
            <>
              {(hasReviewInsights || hasSupportColumn) ? (
                <div className={`round-analysis-flow${countVisiblePanels({
                  hasReviewInsights,
                  hasSupportColumn,
                }) > 1 ? " round-analysis-grid" : ""}`}>
                  {review && hasReviewInsights ? (
                    <div className="judge-card round-review-panel round-diagnostic-panel">
                      <div className="round-diagnostic-panel-head">
                        <strong>{text("这版主要问题", "Main issues in this version")}</strong>
                      </div>
                      {review.driftLabels.length > 0 ? (
                        <div className="round-review-section">
                          <strong>{text("偏题标签", "Drift labels")}</strong>
                          <div className="inline-actions">
                            {review.driftLabels.map((item, index) => (
                              <span className="pill manual_review" key={`${review.id}-drift-${index}`}>{getLocalizedDriftLabel(item, locale)}</span>
                            ))}
                          </div>
                          {review.driftExplanation ? <p className="small">{review.driftExplanation}</p> : null}
                        </div>
                      ) : null}
                      {displaySummary ? (
                        <div className="round-review-section">
                          <p className="small">{displaySummary}</p>
                        </div>
                      ) : null}
                      <RubricScoreBars
                        dimensionScores={review.dimensionScores}
                        rubricDimensions={rubricDimensions}
                        rubricDimensionsSnapshot={review.rubricDimensionsSnapshot}
                        noteMessages={{
                          unstructured: text('当前评分标准不是结构化分项格式，暂不显示分项分数条。', 'This scoring standard is not structured into scored dimensions, so the per-dimension score bars are hidden.'),
                          snapshotUnavailable: text('该轮评分标准快照不可用，暂不显示分项分数条。', 'The rubric snapshot for this review is unavailable, so the per-dimension score bars are hidden.'),
                          pass: text('已达标', 'Passed'),
                          miss: text('未达标', 'Below target'),
                        }}
                      />
                      {findings.length > 0 ? (
                        <div className="round-review-section">
                          <ul className="list compact-list">
                            {findings.map((item, index) => <li key={`${review.id}-finding-${index}`}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {hasSupportColumn ? (
                    <div className="round-support-column">
                      {actualChangeItems.length > 0 ? (
                        <div className="panel round-info-panel round-diagnostic-panel">
                          <div className="round-diagnostic-panel-head">
                            <strong>{text("这轮实际改动", "What actually changed this round")}</strong>
                          </div>
                          <ul className="list compact-list">
                            {actualChangeItems.map((item, index) => <li key={`${candidate.id}-major-${index}`}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {reviewSuggestionItems.length > 0 ? (
                        <div className="panel round-info-panel round-diagnostic-panel round-review-suggestion-band">
                          <ReviewSuggestionPanel
                            items={reviewSuggestionItems}
                            adding={addingReviewSuggestions}
                            addTarget={reviewSuggestionTarget}
                            showAutoApplyControls={showReviewSuggestionAutomationControls}
                            autoApplyEnabled={autoApplyReviewSuggestions}
                            onAddSelected={onAddReviewSuggestions}
                            onAddTargetChange={onReviewSuggestionTargetChange}
                            onToggleAutoApply={showReviewSuggestionAutomationControls
                              ? () => onToggleAutoApplyReviewSuggestions?.(reviewSuggestionItems)
                              : undefined}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </article>
  )
}

function normalizeItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean)
}

function normalizeMajorChanges(items: string[]) {
  return stripFallbackItems(items, isReviewFallbackMajorChange)
}

function normalizeFindings(items: string[], summary: string) {
  const normalizedSummary = normalizeForReviewDedup(summary)
  return stripTopBandGatekeeperFindings(stripFallbackItems(items, isReviewFallbackFinding))
    .filter((item) => normalizeForReviewDedup(item) !== normalizedSummary)
}

function normalizeForReviewDedup(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[。.!?]+$/u, '')
}

function hasVisibleReviewScore(
  score: number | null,
  dimensionScores?: Record<string, number> | null,
) {
  return score !== null && (score > 0 || Boolean(dimensionScores))
}

function getCandidateActualChangeItems(
  candidate: RoundCandidateView,
  majorChanges: string[],
  text: (zh: string, en: string) => string,
): string[] {
  if (majorChanges.length > 0) {
    return majorChanges
  }

  const derivedChanges = summarizePromptDelta('', candidate.optimizedPrompt, text)
  if (derivedChanges.length > 0) {
    return derivedChanges
  }

  if (candidate.strategy === "preserve") {
    return [
      text(
        "这版做的是保守收口，但模型没有写出改动摘要；请以上方完整提示词为准。",
        "This version is a preserve-style refinement, but the model did not return a change summary; use the full prompt above as the source of truth.",
      ),
    ]
  }

  return [
    text(
      "这版确实生成了新提示词，但模型没有写出改动摘要；请以上方完整提示词为准。",
      "This version did generate a new prompt, but the model did not return a change summary; use the full prompt above as the source of truth.",
    ),
  ]
}

function getCandidateReviewSuggestionItems(items: string[]) {
  return stripFallbackItems(items, isReviewFallbackSuggestedChange)
}

function countVisiblePanels(input: {
  hasReviewInsights: boolean
  hasSupportColumn: boolean
}) {
  return Number(input.hasReviewInsights) + Number(input.hasSupportColumn)
}

function getExpandedPreviewText(input: {
  hasReviewInsights: boolean
  hasActualChanges: boolean
  hasReviewSuggestions: boolean
  text: (zh: string, en: string) => string
}) {
  if (input.hasReviewInsights && input.hasActualChanges && input.hasReviewSuggestions) {
    return input.text("这版详情已展开；下方查看主要问题、实际改动与评审建议。", "This version is expanded below; review issues, actual changes, and review suggestions there.")
  }

  if (input.hasReviewInsights && input.hasActualChanges) {
    return input.text("这版详情已展开；下方查看主要问题与实际改动。", "This version is expanded below; review issues and actual changes there.")
  }

  if (input.hasReviewInsights && input.hasReviewSuggestions) {
    return input.text("这版详情已展开；下方查看主要问题与评审建议。", "This version is expanded below; review issues and review suggestions there.")
  }

  if (input.hasReviewInsights) {
    return input.text("这版详情已展开；下方查看主要问题。", "This version is expanded below; review the main issues there.")
  }

  if (input.hasActualChanges && input.hasReviewSuggestions) {
    return input.text("这版详情已展开；下方查看实际改动与评审建议。", "This version is expanded below; review the actual changes and review suggestions there.")
  }

  if (input.hasReviewSuggestions) {
    return input.text("这版详情已展开；下方查看评审建议。", "This version is expanded below; review the review suggestions there.")
  }

  return input.text("这版详情已展开；下方查看实际改动。", "This version is expanded below; review the actual changes there.")
}
