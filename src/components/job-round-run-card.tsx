import type { CandidateRecord } from '@/lib/server/types'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { humanizePlaceholderMve } from '@/lib/prompt-text'

export interface RoundRunView {
  id: string
  roundNumber: number
  semantics: 'legacy-output-judged' | 'input-judged-output-handed-off'
  inputPrompt: string
  inputCandidateId: string | null
  outputCandidateId: string | null
  displayScore: number | null
  hasMaterialIssues: boolean | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  outcome: 'settled' | 'judge_failed' | 'optimizer_failed' | 'both_failed' | 'legacy'
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
}: {
  round: RoundRunView
  expanded: boolean
  onToggle: () => void
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const reviewPassed = round.displayScore !== null && round.hasMaterialIssues === false && round.passStreakAfter > 0
  const majorChanges = normalizeItems(round.outputCandidate?.majorChanges ?? [])
  const deadEndSignals = normalizeItems(round.outputCandidate?.deadEndSignals ?? [])
  const aggregatedIssues = normalizeItems(round.outputCandidate?.aggregatedIssues ?? [])
  const findings = normalizeItems(round.findings)
  const suggestedChanges = normalizeItems(round.suggestedChanges)
  const humanizedMve = round.outputCandidate ? humanizeMve(round.outputCandidate.mve, locale) : null
  const hasDetailPanels = Boolean(humanizedMve)
    || majorChanges.length > 0
    || deadEndSignals.length > 0
    || aggregatedIssues.length > 0
    || findings.length > 0
    || suggestedChanges.length > 0
    || round.driftLabels.length > 0
    || Boolean(round.driftExplanation.trim())
  const scoreLabel = round.displayScore === null
    ? text('上轮提示词暂未评分', 'Previous prompt not scored yet')
    : text(`上轮提示词评分 ${round.displayScore.toFixed(2)}`, `Previous prompt score ${round.displayScore.toFixed(2)}`)
  const handoffLabel = round.outputCandidate
    ? round.outputFinal
      ? text('这版已作为最终结果交付', 'This version was delivered as the final result')
      : round.outputJudged
      ? text('这版后来已经评过分', 'This version was scored later')
      : text('这版要到下一轮才会评分', 'This version will be scored next round')
    : reviewPassed
      ? text('达标但未生成新版本', 'Passed review but no new output')
      : text('本轮没有生成可移交新版本', 'No handoff output generated')
  const preview = round.summary || round.optimizerError || round.judgeError || text('这一轮暂无更多诊断信息。', 'No extra diagnostic details for this round yet.')
  const closeoutHint = !round.outputCandidate && reviewPassed
    ? text(
      round.passStreakAfter >= 3
        ? '这轮已经满足停止条件，但没生成新版本，系统会沿用上一版作为最终结果。'
        : '这轮评分过线了，但没生成新版本，系统会继续沿用上一版往下走。',
      round.passStreakAfter >= 3
        ? 'This round hit the stop condition without a new output, so the system will keep the previous version as the final result.'
        : 'This round passed review without a new output, so the system will keep carrying the previous version forward.',
    )
    : null

  return (
    <article className={`round-card compact-round round-card-minimal${expanded ? ' expanded' : ''}`}>
      <div className="round-header">
        <div className="inline-actions">
          <span className="pill running">{locale === 'zh-CN' ? `第 ${round.roundNumber} 轮` : `Round ${round.roundNumber}`}</span>
          <span className="pill completed">{scoreLabel}</span>
          <span className={`pill ${round.outputCandidate ? 'manual_review' : 'failed'}`}>{handoffLabel}</span>
        </div>
        <button className="button ghost" type="button" onClick={onToggle}>
          {expanded ? text('收起详情', 'Hide details') : text('查看详情', 'View details')}
        </button>
      </div>
      <div className="round-diagnostic-preview">
        <p className="small round-preview">{preview}</p>
        <p className="meta round-hint">{text('上面这个分数是上一轮提示词的，不是下面新版本的。', 'The score above belongs to the previous prompt, not the new version below.')}</p>
        {closeoutHint ? <p className="meta round-hint">{closeoutHint}</p> : null}
        {!expanded ? null : <p className="meta round-hint">{handoffLabel}</p>}
      </div>
      {expanded ? (
        <div className="shell round-diagnostic-body">
          <details className="fold-card" open>
            <summary>{text('进入本轮前的提示词', 'Input prompt before this round')}</summary>
            <pre className="pre compact">{round.inputPrompt}</pre>
          </details>
          <details className="fold-card" open>
            <summary>{text('本轮生成的新版本', 'New prompt generated in this round')}</summary>
            <pre className="pre compact">{round.outputCandidate?.optimizedPrompt ?? text('没有生成可移交的新版本。', 'No handoff output was generated.')}</pre>
          </details>
          {!hasDetailPanels ? (
            <div className="notice">{text('这一轮没有额外诊断细节。', 'This round has no extra diagnostic details.')}</div>
          ) : (
            <div className="round-analysis-grid">
              <div className="round-analysis-stack">
                {humanizedMve ? (
                  <div className="panel round-mve-panel">
                    <strong>{text('下一步最小验证', 'Next minimal check')}</strong>
                    <pre className="pre compact round-mve-pre">{humanizedMve}</pre>
                  </div>
                ) : null}
                <div className="round-insight-grid">
                  {majorChanges.length > 0 ? (
                    <div className="panel round-info-panel">
                      <strong>{text('这轮改了什么', 'What changed this round')}</strong>
                      <ul className="list compact-list">
                        {majorChanges.map((item, index) => <li key={`${round.id}-major-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {deadEndSignals.length > 0 ? (
                    <div className="panel round-info-panel">
                      <strong>{text('走偏风险', 'Drift risks')}</strong>
                      <ul className="list compact-list">
                        {deadEndSignals.map((item, index) => <li key={`${round.id}-signal-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {aggregatedIssues.length > 0 ? (
                    <div className="panel round-info-panel">
                      <strong>{text('还要补的地方', 'What still needs patching')}</strong>
                      <ul className="list compact-list">
                        {aggregatedIssues.map((item, index) => <li key={`${round.id}-issue-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="judge-card round-review-panel">
                <div className="card-header round-review-header">
                  <strong>{text('上轮提示词评分结果', 'Previous prompt review')}</strong>
                  <span className={`status ${round.hasMaterialIssues ? 'manual_review' : 'completed'}`}>
                    {round.displayScore === null ? '—' : round.displayScore}
                  </span>
                </div>
                {round.driftLabels.length > 0 ? (
                  <div className="round-review-section">
                    <strong>{text('偏题标签', 'Drift labels')}</strong>
                    <div className="inline-actions">
                      {round.driftLabels.map((item, index) => (
                        <span className="pill manual_review" key={`${round.id}-drift-${index}`}>{item}</span>
                      ))}
                    </div>
                    {round.driftExplanation ? <p className="small">{round.driftExplanation}</p> : null}
                  </div>
                ) : null}
                {findings.length > 0 ? (
                  <div className="round-review-section">
                    <strong>{text('这轮还卡在哪', 'What is still blocking this round')}</strong>
                    <ul className="list compact-list">
                      {findings.map((item, index) => <li key={`${round.id}-finding-${index}`}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {suggestedChanges.length > 0 ? (
                  <div className="round-review-section">
                    <strong>{text('下一步怎么改', 'How to revise next')}</strong>
                    <ul className="list compact-list">
                      {suggestedChanges.map((item, index) => <li key={`${round.id}-suggestion-${index}`}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}

function normalizeItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean)
}

function humanizeMve(value: string, locale: 'zh-CN' | 'en') {
  return humanizePlaceholderMve(value, locale)
}
