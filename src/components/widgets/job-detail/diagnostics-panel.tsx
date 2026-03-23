import { RefreshCcw } from 'lucide-react'

import { JobRoundRunCard } from '@/components/job-round-run-card'
import { JobRoundCard } from '@/components/widgets/job-detail/round-card'
import type { JobDetailHandlers, JobDetailUiState, JobDetailViewModel } from '@/components/widgets/job-detail/job-detail-types'
import { useLocaleText } from '@/lib/i18n'

export function DiagnosticsPanel({
  model,
  ui,
  handlers,
}: {
  model: JobDetailViewModel
  ui: Pick<JobDetailUiState, 'expandedRounds'>
  handlers: Pick<JobDetailHandlers, 'onToggleRound'>
}) {
  const text = useLocaleText()

  return (
    <section className="diagnostic-stage">
      <div className="section-head">
        <div>
          <h2 className="section-title has-icon">
            <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
              <RefreshCcw size={18} />
            </span>
            {text('优化过程诊断', 'Optimization diagnostics')}
          </h2>
          <p className="small">{text('默认只露摘要。需要时再展开每一轮的完整诊断和复核细节。', 'By default you only see the summary. Expand a round when you need the full diagnostic and review details.')}</p>
        </div>
      </div>
      {model.candidates.length === 0 && model.roundRuns.length === 0
        ? <div className="notice">{text('还没有产出候选稿。', 'No candidates yet.')}</div>
        : null}
      <div className="shell">
        {model.roundRuns.length > 0
          ? model.roundRuns.map((round) => (
            <JobRoundRunCard
              key={round.id}
              round={round}
              expanded={Boolean(ui.expandedRounds[round.id])}
              onToggle={() => handlers.onToggleRound(round.id)}
            />
          ))
          : model.candidates.map((candidate) => (
            <JobRoundCard
              key={candidate.id}
              candidate={candidate}
              expanded={Boolean(ui.expandedRounds[candidate.id])}
              onToggle={() => handlers.onToggleRound(candidate.id)}
            />
          ))}
      </div>
    </section>
  )
}
