import { useI18n, useLocaleText } from "@/lib/i18n"
import type { SteeringItem } from "@/lib/contracts"

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

  return (
    <article className={`round-card compact-round round-card-minimal${expanded ? " expanded" : ""}`}>
      <div className="round-header">
        <div className="inline-actions">
          <span className="pill running">{locale === "zh-CN" ? `第 ${candidate.roundNumber} 轮` : `Round ${candidate.roundNumber}`}</span>
          <span className="pill completed">{text("复核分数", "Review score")} {candidate.averageScore.toFixed(2)}</span>
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
          <div className="round-analysis-grid">
            <div className="round-analysis-stack">
              <div className="panel round-mve-panel">
                <strong>MVE</strong>
                <pre className="pre compact round-mve-pre">{candidate.mve}</pre>
              </div>
              <div className="round-insight-grid">
                <div className="panel round-info-panel">
                  <strong>{text("主要修改", "Major changes")}</strong>
                  <ul className="list compact-list">
                    {candidate.majorChanges.map((item, index) => <li key={`${candidate.id}-major-${index}`}>{item}</li>)}
                  </ul>
                </div>
                <div className="panel round-info-panel">
                  <strong>{text("死胡同信号", "Dead-end signals")}</strong>
                  <ul className="list compact-list">
                    {candidate.deadEndSignals.map((item, index) => <li key={`${candidate.id}-signal-${index}`}>{item}</li>)}
                  </ul>
                </div>
                <div className="panel round-info-panel">
                  <strong>{text("修订补丁", "Revision patch")}</strong>
                  <ul className="list compact-list">
                    {candidate.aggregatedIssues.map((item, index) => <li key={`${candidate.id}-issue-${index}`}>{item}</li>)}
                  </ul>
                </div>
              </div>
            </div>
            {review ? (
              <div className="judge-card round-review-panel">
                <div className="card-header round-review-header">
                  <strong>{text("复核结果", "Review result")}</strong>
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
                <div className="round-review-section">
                  <strong>{text("发现的问题", "Issues found")}</strong>
                  <ul className="list compact-list">
                    {review.findings.map((item, index) => <li key={`${review.id}-finding-${index}`}>{item}</li>)}
                  </ul>
                </div>
                <div className="round-review-section">
                  <strong>{text("建议修改", "Suggested changes")}</strong>
                  <ul className="list compact-list">
                    {review.suggestedChanges.map((item, index) => <li key={`${review.id}-suggestion-${index}`}>{item}</li>)}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  )
}
