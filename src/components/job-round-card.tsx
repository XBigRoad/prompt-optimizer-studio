import { useI18n, useLocaleText } from "@/lib/i18n"
import { humanizePlaceholderMve } from "@/lib/prompt-text"
import type { SteeringItem } from "@/lib/server/types"

interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
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
}: {
  candidate: RoundCandidateView
  expanded: boolean
  onToggle: () => void
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const review = candidate.judges[0]
  const majorChanges = normalizeItems(candidate.majorChanges)
  const deadEndSignals = normalizeItems(candidate.deadEndSignals)
  const aggregatedIssues = normalizeItems(candidate.aggregatedIssues)
  const findings = normalizeItems(review?.findings ?? [])
  const suggestedChanges = normalizeItems(review?.suggestedChanges ?? [])
  const humanizedMve = humanizeMve(candidate.mve, locale)
  const hasDetailPanels = Boolean(humanizedMve)
    || majorChanges.length > 0
    || deadEndSignals.length > 0
    || aggregatedIssues.length > 0
    || findings.length > 0
    || suggestedChanges.length > 0
    || Boolean(review?.driftExplanation?.trim())
    || Boolean(review?.driftLabels.length)

  return (
    <article className={`round-card compact-round round-card-minimal${expanded ? " expanded" : ""}`}>
      <div className="round-header">
        <div className="inline-actions">
          <span className="pill running">{locale === "zh-CN" ? `第 ${candidate.roundNumber} 轮` : `Round ${candidate.roundNumber}`}</span>
          <span className="pill completed">{text("这版提示词得分", "Prompt score")} {candidate.averageScore.toFixed(2)}</span>
          <span className={`pill ${review?.hasMaterialIssues ? "manual_review" : "completed"}`}>
            {review?.hasMaterialIssues ? text("需继续优化", "Needs more work") : text("本轮通过", "Passed this round")}
          </span>
        </div>
        <button className="button ghost" type="button" onClick={onToggle}>
          {expanded ? text("收起详情", "Hide details") : text("查看详情", "View details")}
        </button>
      </div>
      <div className="round-diagnostic-preview">
        <p className="small round-preview">{review?.summary ?? text("暂无复核摘要。", "No review summary yet.")}</p>
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
                        {majorChanges.map((item, index) => <li key={`${candidate.id}-major-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {deadEndSignals.length > 0 ? (
                    <div className="panel round-info-panel">
                      <strong>{text('走偏风险', 'Drift risks')}</strong>
                      <ul className="list compact-list">
                        {deadEndSignals.map((item, index) => <li key={`${candidate.id}-signal-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {aggregatedIssues.length > 0 ? (
                    <div className="panel round-info-panel">
                      <strong>{text('还要补的地方', 'What still needs patching')}</strong>
                      <ul className="list compact-list">
                        {aggregatedIssues.map((item, index) => <li key={`${candidate.id}-issue-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
              {review ? (
                <div className="judge-card round-review-panel">
                  <div className="card-header round-review-header">
                    <strong>{text('这版提示词复核结果', 'Prompt review result')}</strong>
                    <span className={`status ${review.hasMaterialIssues ? "manual_review" : "completed"}`}>{review.score}</span>
                  </div>
                  {review.driftLabels.length > 0 ? (
                    <div className="round-review-section">
                      <strong>{text("偏题标签", "Drift labels")}</strong>
                      <div className="inline-actions">
                        {review.driftLabels.map((item, index) => (
                          <span className="pill manual_review" key={`${review.id}-drift-${index}`}>{item}</span>
                        ))}
                      </div>
                      {review.driftExplanation ? <p className="small">{review.driftExplanation}</p> : null}
                    </div>
                  ) : null}
                  {findings.length > 0 ? (
                    <div className="round-review-section">
                      <strong>{text('这轮还卡在哪', 'What is still blocking this round')}</strong>
                      <ul className="list compact-list">
                        {findings.map((item, index) => <li key={`${review.id}-finding-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {suggestedChanges.length > 0 ? (
                    <div className="round-review-section">
                      <strong>{text('下一步怎么改', 'How to revise next')}</strong>
                      <ul className="list compact-list">
                        {suggestedChanges.map((item, index) => <li key={`${review.id}-suggestion-${index}`}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
