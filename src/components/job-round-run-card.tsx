import { ReviewSuggestionPanel } from '@/components/review-suggestion-panel'
import { RubricScoreBars, type RubricDimensionView } from '@/components/rubric-score-bars'
import { getLocalizedDriftLabel } from '@/lib/drift-labels'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { getJobDisplayError, isStructuredResultFormatError } from '@/lib/presentation'
import { areEquivalentPromptTexts, summarizePromptDelta } from '@/lib/prompt-text'
import type { ReviewSuggestionAddResult } from '@/lib/review-suggestion-drafts'
import {
  isReviewFallbackFinding,
  isReviewFallbackMajorChange,
  isReviewFallbackSuggestedChange,
  stripFallbackItems,
} from '@/lib/review-fallbacks'
import { resolveNarrativeReviewSummary, stripTopBandGatekeeperFindings } from '@/lib/review-summary'
import type { CandidateRecord, RoundSemantics, RoundRunOutcome } from '@/lib/server/types'

export interface RoundRunView {
  id: string
  roundNumber: number
  semantics: RoundSemantics
  inputPrompt: string
  inputCandidateId: string | null
  outputCandidateId: string | null
  displayScore: number | null
  hasMaterialIssues: boolean | null
  dimensionScores?: Record<string, number> | null
  dimensionReasons?: string[] | null
  rubricDimensionsSnapshot?: RubricDimensionView[] | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  outcome: RoundRunOutcome
  optimizerError: string | null
  judgeError: string | null
  passStreakAfter: number
  outputJudged: boolean
  outputFinal?: boolean
  outputCandidate: CandidateRecord | null
  createdAt: string
}

export function JobRoundRunCard({
  round,
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
  round: RoundRunView
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
  const reviewPassed = round.displayScore !== null && round.hasMaterialIssues === false && round.passStreakAfter > 0
  const majorChanges = normalizeMajorChanges(round.outputCandidate?.majorChanges ?? [])
  const localizedOptimizerError = round.optimizerError
    ? getJobDisplayError(round.optimizerError, locale, {
      hasUsableResult: Boolean(round.outputCandidate || reviewPassed || round.displayScore !== null),
    }) ?? round.optimizerError
    : null
  const localizedJudgeError = round.judgeError
    ? getJobDisplayError(round.judgeError, locale, {
      hasUsableResult: Boolean(round.outputCandidate || round.displayScore !== null),
    }) ?? round.judgeError
    : null
  const displaySummary = resolveNarrativeReviewSummary(round.summary, round.findings, round.dimensionReasons ?? [])
  const findings = normalizeFindings(round.findings, displaySummary)
  const noHandoffMessage = getRoundRunNoHandoffMessage({
    round,
    reviewPassed,
    displaySummary,
    optimizerError: localizedOptimizerError,
    judgeError: localizedJudgeError,
    text,
  })
  const actualChangeItems = getRoundRunActualChangeItems(round, majorChanges, reviewPassed, text, {
    optimizerError: localizedOptimizerError,
    judgeError: localizedJudgeError,
  })
  const reviewSuggestionItems = getRoundRunReviewSuggestionItems(round.suggestedChanges)
  const hasSupportInsights = actualChangeItems.length > 0 || reviewSuggestionItems.length > 0
  const hasSupportColumn = actualChangeItems.length > 0 || reviewSuggestionItems.length > 0
  const hasReviewInsights = findings.length > 0
    || round.driftLabels.length > 0
    || Boolean(round.driftExplanation.trim())
    || Boolean(round.summary.trim())
  const runtimeErrors = getRuntimeErrors(round, locale, text)
  const suppressRuntimePanel = shouldHideRuntimePanel({
    round,
    hasReviewInsights,
    hasSupportInsights,
  })
  const visibleRuntimeErrors = suppressRuntimePanel ? [] : runtimeErrors
  const hasPrimaryDetailPanels = hasReviewInsights || actualChangeItems.length > 0 || visibleRuntimeErrors.length > 0
  const hasDetailPanels = hasSupportInsights || hasReviewInsights || visibleRuntimeErrors.length > 0
  const hasCredibleReviewScore = hasVisibleReviewScore(round.displayScore, round.dimensionScores)
  const scoreLabel = hasCredibleReviewScore
    ? text(`上轮提示词评分 ${round.displayScore!.toFixed(2)}`, `Previous prompt score ${round.displayScore!.toFixed(2)}`)
    : text('上轮提示词暂未评分', 'Previous prompt not scored yet')
  const handoffLabel = round.outputCandidate
    ? round.outputFinal
      ? text('这版已作为最终结果交付', 'This version was delivered as the final result')
      : null
    : reviewPassed
      ? text('达标，本轮未产出更优替换稿', 'Passed review, but no stronger replacement draft was produced this round')
      : text('本轮没有生成可移交新版本', 'No handoff output generated')
  const handoffTone = round.outputCandidate ? 'manual_review' : reviewPassed ? 'completed' : 'pending'
  const preview = expanded && displaySummary
    ? getExpandedPreviewText({
      hasReviewInsights,
      hasActualChanges: actualChangeItems.length > 0,
      hasReviewSuggestions: reviewSuggestionItems.length > 0,
      hasRuntimeErrors: runtimeErrors.length > 0,
      text,
    })
    : displaySummary
    || localizedOptimizerError
    || localizedJudgeError
    || text('这一轮暂无更多诊断信息。', 'No extra diagnostic details for this round yet.')

  return (
    <article className={`round-card compact-round round-card-minimal${expanded ? ' expanded' : ''}`}>
      <div className="round-header">
        <div className="inline-actions">
          <span className="pill running">{locale === 'zh-CN' ? `第 ${round.roundNumber} 轮` : `Round ${round.roundNumber}`}</span>
          <span className="pill completed">{scoreLabel}</span>
          {handoffLabel ? <span className={`pill ${handoffTone}`}>{handoffLabel}</span> : null}
        </div>
        <button className="button ghost" type="button" onClick={onToggle}>
          {expanded ? text('收起详情', 'Hide details') : text('查看详情', 'View details')}
        </button>
      </div>
      <div className="round-diagnostic-preview">
        <p className="small round-preview">{preview}</p>
      </div>
      {expanded ? (
        <div className="shell round-diagnostic-body">
          <div className={`round-prompt-grid${round.outputCandidate ? '' : ' round-prompt-grid-single'}`}>
            <details className="fold-card" open>
              <summary>{text('进入本轮前的提示词', 'Input prompt before this round')}</summary>
              <pre className="pre compact">{round.inputPrompt}</pre>
            </details>
            {round.outputCandidate ? (
              <details className="fold-card" open>
                <summary>{text('本轮生成的新版本', 'New prompt generated in this round')}</summary>
                <pre className="pre compact">{round.outputCandidate.optimizedPrompt}</pre>
              </details>
            ) : (
              <div className="empty-inline-state round-output-empty-state">
                <strong>{text('本轮没有新版本可交接', 'No handoff output this round')}</strong>
                <span>{noHandoffMessage}</span>
              </div>
            )}
          </div>
          {!hasDetailPanels ? (
            <div className="notice">{text('这一轮没有额外诊断细节。', 'This round has no extra diagnostic details.')}</div>
          ) : (
            <>
              {hasPrimaryDetailPanels ? (
                <div className={`round-analysis-flow${countVisiblePanels({
                  hasReviewInsights,
                  hasSupportColumn,
                  hasRuntimeErrors: runtimeErrors.length > 0,
                }) > 1 ? ' round-analysis-grid' : ''}`}>
                  {hasReviewInsights ? (
                    <div className="judge-card round-review-panel round-diagnostic-panel">
                      <div className="round-diagnostic-panel-head">
                        <strong>{text('上轮主要问题', 'Main issues from the previous prompt')}</strong>
                      </div>
                      {round.driftLabels.length > 0 ? (
                        <div className="round-review-section">
                          <strong>{text('偏题标签', 'Drift labels')}</strong>
                          <div className="inline-actions">
                            {round.driftLabels.map((item, index) => (
                              <span className="pill manual_review" key={`${round.id}-drift-${index}`}>{getLocalizedDriftLabel(item, locale)}</span>
                            ))}
                          </div>
                          {round.driftExplanation ? <p className="small">{round.driftExplanation}</p> : null}
                        </div>
                      ) : null}
                      {displaySummary ? (
                        <div className="round-review-section">
                          <p className="small">{displaySummary}</p>
                        </div>
                      ) : null}
                      <RubricScoreBars
                        dimensionScores={round.dimensionScores}
                        rubricDimensions={rubricDimensions}
                        rubricDimensionsSnapshot={round.rubricDimensionsSnapshot}
                        noteMessages={{
                          unstructured: text('当前评分标准不是结构化分项格式，暂不显示分项分数条。', 'This scoring standard is not structured into scored dimensions, so the per-dimension score bars are hidden.'),
                          snapshotUnavailable: text('该轮评分标准快照不可用，暂不显示分项分数条。', 'The rubric snapshot for this round is unavailable, so the per-dimension score bars are hidden.'),
                          pass: text('已达标', 'Passed'),
                          miss: text('未达标', 'Below target'),
                        }}
                      />
                      {findings.length > 0 ? (
                        <div className="round-review-section">
                          <ul className="list compact-list">
                            {findings.map((item, index) => <li key={`${round.id}-finding-${index}`}>{item}</li>)}
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
                            <strong>{text('这轮实际改动', 'What actually changed this round')}</strong>
                          </div>
                          <ul className="list compact-list">
                            {actualChangeItems.map((item, index) => <li key={`${round.id}-major-${index}`}>{item}</li>)}
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
                  {visibleRuntimeErrors.length > 0 ? (
                    <div className="panel round-error-panel round-diagnostic-panel">
                      <div className="round-diagnostic-panel-head">
                        <strong>{text('本轮运行信息', 'Round runtime details')}</strong>
                      </div>
                      <ul className="list compact-list">
                        {visibleRuntimeErrors.map((item, index) => <li key={`${round.id}-runtime-${index}`}>{item}</li>)}
                      </ul>
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
  displayScore: number | null,
  dimensionScores?: Record<string, number> | null,
) {
  return displayScore !== null && (displayScore > 0 || Boolean(dimensionScores))
}

function getRoundRunActualChangeItems(
  round: RoundRunView,
  majorChanges: string[],
  reviewPassed: boolean,
  text: (zh: string, en: string) => string,
  localizedErrors: {
    optimizerError: string | null
    judgeError: string | null
  },
): string[] {
  if (majorChanges.length > 0) {
    return majorChanges
  }

  if (round.outputCandidate) {
    if (areEquivalentPromptTexts(round.inputPrompt, round.outputCandidate.optimizedPrompt)) {
      return [
        round.outputFinal
          ? text(
            '本轮没有形成可区分的新稿；当前稳定版本已作为最终结果交付。',
            'This round did not produce a meaningfully distinct draft, so the current stable version was delivered as the final result.',
          )
          : text(
            '本轮没有形成可区分的新稿；当前有效版本仍是进入本轮前的这版提示词。',
            'This round did not produce a meaningfully distinct draft; the prompt that entered the round remains the active version.',
          ),
      ]
    }

    const derivedChanges = summarizePromptDelta(round.inputPrompt, round.outputCandidate.optimizedPrompt, text)
    if (derivedChanges.length > 0) {
      return derivedChanges
    }

    if (round.outputFinal) {
      return [
        text(
          '本轮已把这版作为最终结果交付，但模型没有写出改动摘要；请以上方新版本正文为准。',
          'This round delivered this version as the final result, but the model did not return a change summary; use the new prompt above as the source of truth.',
        ),
      ]
    }

    if (round.outputCandidate.strategy === 'preserve') {
      return [
        text(
          '本轮生成了保守收口版，但模型没有写出改动摘要；请以上方新版本正文为准。',
          'This round generated a preserve-style revision, but the model did not return a change summary; use the new prompt above as the source of truth.',
        ),
      ]
    }

    return [
      text(
        '本轮确实生成了新版本，但模型没有写出改动摘要；请以上方新版本正文为准。',
        'This round did generate a new version, but the model did not return a change summary; use the new prompt above as the source of truth.',
      ),
    ]
  }

  if (reviewPassed || localizedErrors.optimizerError || localizedErrors.judgeError || round.summary.trim() || round.findings.length > 0) {
    return []
  }

  return []
}

function getRoundRunNoHandoffMessage(input: {
  round: RoundRunView
  reviewPassed: boolean
  displaySummary: string
  optimizerError: string | null
  judgeError: string | null
  text: (zh: string, en: string) => string
}) {
  const hasReviewInsights = Boolean(
    input.displaySummary
    || input.round.findings.length > 0
    || input.round.driftLabels.length > 0
    || input.round.driftExplanation.trim()
  )

  if (input.optimizerError || input.judgeError) {
    if (!hasReviewInsights && input.round.displayScore === null) {
      return input.text(
        '这一轮停在请求层失败，系统还没拿到可写入的评分或新稿，因此没有可移交版本。',
        'This round stopped at the request/provider layer before a score or handoff draft could be written, so there is no handoff output.',
      )
    }

    if (input.optimizerError) {
      return input.text(
        '这一轮保留了评分或诊断，但优化器请求被中途打断，所以没有产出可移交新稿。',
        'This round kept the score or diagnostics, but the optimizer request was interrupted before it could produce a handoff draft.',
      )
    }

    return input.text(
      '这一轮保留了优化结果，但评分器请求被中途打断，所以暂时没有形成可继续移交的新稿结论。',
      'This round kept the optimization result, but the judge request was interrupted before a handoff-ready conclusion could be written.',
    )
  }

  if (input.reviewPassed) {
    return input.text(
      '优化器本轮已执行，但没有形成可替换的更优新稿，当前候选继续接受独立复核。',
      'The optimizer ran this round, but it did not produce a meaningfully better replacement draft. The current candidate remains under independent re-check.',
    )
  }

  if (hasReviewInsights || input.round.displayScore !== null) {
    return input.text(
      '这一轮只留下评分和诊断，没有形成新的可移交版本。',
      'This round produced review diagnostics only and did not produce a new handoff draft.',
    )
  }

  return input.text(
    '这一轮没有拿到足够结果来生成可移交新版本。',
    'This round did not gather enough usable result to produce a handoff draft.',
  )
}

function getExpandedPreviewText(input: {
  hasReviewInsights: boolean
  hasActualChanges: boolean
  hasReviewSuggestions: boolean
  hasRuntimeErrors: boolean
  text: (zh: string, en: string) => string
}) {
  if (input.hasReviewInsights && input.hasActualChanges && input.hasReviewSuggestions) {
    return input.text('本轮详情已展开；下方查看主要问题、实际改动与评审建议。', 'Round details are expanded below; review issues, actual changes, and review suggestions there.')
  }

  if (input.hasReviewInsights && input.hasActualChanges) {
    return input.text('本轮详情已展开；下方查看主要问题与实际改动。', 'Round details are expanded below; review issues and actual changes there.')
  }

  if (input.hasReviewInsights && input.hasReviewSuggestions) {
    return input.text('本轮详情已展开；下方查看主要问题与评审建议。', 'Round details are expanded below; review issues and review suggestions there.')
  }

  if (input.hasReviewInsights) {
    return input.text('本轮详情已展开；下方查看主要问题。', 'Round details are expanded below; review the main issues there.')
  }

  if (input.hasActualChanges && input.hasReviewSuggestions) {
    return input.text('本轮详情已展开；下方查看实际改动与评审建议。', 'Round details are expanded below; review the actual changes and review suggestions there.')
  }

  if (input.hasActualChanges) {
    return input.text('本轮详情已展开；下方查看实际改动。', 'Round details are expanded below; review the actual changes there.')
  }

  if (input.hasReviewSuggestions) {
    return input.text('本轮详情已展开；下方查看评审建议。', 'Round details are expanded below; review the review suggestions there.')
  }

  if (input.hasRuntimeErrors) {
    return input.text('本轮详情已展开；下方查看运行信息。', 'Round details are expanded below; review runtime details there.')
  }

  return input.text('本轮详情已展开。', 'Round details are expanded below.')
}

function getRuntimeErrors(
  round: RoundRunView,
  locale: 'zh-CN' | 'en',
  text: (zh: string, en: string) => string,
) {
  const items: string[] = []

  if (round.optimizerError) {
    items.push(`${text('优化器错误：', 'Optimizer error: ')}${getJobDisplayError(round.optimizerError, locale, {
      hasUsableResult: Boolean(round.outputCandidate || round.displayScore !== null || round.passStreakAfter > 0),
    }) ?? round.optimizerError}`)
  }

  if (round.judgeError) {
    items.push(`${text('评分器错误：', 'Judge error: ')}${getJobDisplayError(round.judgeError, locale, {
      hasUsableResult: Boolean(round.outputCandidate || round.displayScore !== null),
    }) ?? round.judgeError}`)
  }

  return items
}

function getRoundRunReviewSuggestionItems(items: string[]) {
  return stripFallbackItems(items, isReviewFallbackSuggestedChange)
}

function shouldHideRuntimePanel(input: {
  round: RoundRunView
  hasReviewInsights: boolean
  hasSupportInsights: boolean
}) {
  const hasUsableResult = Boolean(
    input.round.outputCandidate
    || input.round.displayScore !== null
    || input.round.passStreakAfter > 0
  )
  const hasSubstantiveDiagnostics = input.hasReviewInsights || input.hasSupportInsights
  const runtimeMessages = [input.round.optimizerError, input.round.judgeError].filter((item): item is string => Boolean(item))

  if (!hasUsableResult || !hasSubstantiveDiagnostics || runtimeMessages.length === 0) {
    return false
  }

  return runtimeMessages.every((item) => isStructuredResultFormatError(item))
}

function countVisiblePanels(input: {
  hasReviewInsights: boolean
  hasSupportColumn: boolean
  hasRuntimeErrors: boolean
}) {
  return Number(input.hasReviewInsights)
    + Number(input.hasSupportColumn)
    + Number(input.hasRuntimeErrors)
}
