import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Settings2, Sparkles } from 'lucide-react'

import { SummaryBadge } from '@/components/widgets/job-detail/control-room-primitives'
import { DiagnosticsPanel } from '@/components/widgets/job-detail/diagnostics-panel'
import type {
  JobDetailFormState,
  JobDetailHandlers,
  JobDetailUiState,
  JobDetailViewModel,
  ModelOption,
} from '@/components/widgets/job-detail/job-detail-types'
import { PendingSteeringPanel } from '@/components/widgets/job-detail/pending-steering-panel'
import { ResultStage } from '@/components/widgets/job-detail/result-stage'
import { RuntimeControlsPanel } from '@/components/widgets/job-detail/runtime-controls-panel'
import { StableRulesPanel } from '@/components/widgets/job-detail/stable-rules-panel'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { getReasoningEffortLabel } from '@/lib/reasoning-effort'
import { getJobDisplayError, getJobScoreDisplay, getJobScoreMeta, getJobStatusLabel } from '@/lib/presentation'

export type { JobDetailViewModel } from '@/components/widgets/job-detail/job-detail-types'

export function JobDetailControlRoom({
  model,
  models,
  ui,
  form,
  handlers,
}: {
  model: JobDetailViewModel
  models: ModelOption[]
  ui: JobDetailUiState
  form: JobDetailFormState
  handlers: JobDetailHandlers
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const reasoningEffortSummary = model.optimizerReasoningEffort === model.judgeReasoningEffort
    ? getReasoningEffortLabel(model.optimizerReasoningEffort, locale)
    : `${getReasoningEffortLabel(model.optimizerReasoningEffort, locale)} / ${getReasoningEffortLabel(model.judgeReasoningEffort, locale)}`
  const bestScoreDisplay = getJobScoreDisplay(model, locale)
  const bestScoreMeta = getJobScoreMeta(model, locale)

  return (
    <div className="detail-control-room">
      <section className="detail-hero">
        <div className="nav-row">
          <Link href="/" className="link nav-chip"><ArrowLeft size={16} /> {text('返回控制室', 'Return to control room')}</Link>
          <Link href="/settings" className="link nav-chip"><Settings2 size={16} /> {text('配置台', 'Settings Desk')}</Link>
        </div>
        <div className="detail-hero-grid">
          <div>
            <span className="eyebrow detail-stage-label detail-stage-chip" data-ui="detail-stage-chip">
              <Sparkles size={15} />
              {text('结果台', 'Result Desk')}
            </span>
            <h1>{model.title}</h1>
            <p className="hero-lead">{text('先确认最终结果，再检查目标理解，最后决定是否继续推进任务。', 'Confirm the latest result first, then inspect the goal understanding, and only then decide whether to continue.')}</p>
          </div>
          <div className="summary-cluster detail-summary-cluster">
            <SummaryBadge label={text('状态', 'Status')} value={getJobStatusLabel(model.status, locale)} tone={model.status} />
            <SummaryBadge label={text('任务模型', 'Task model')} value={model.modelsLabel} />
            <SummaryBadge label={text('推理强度', 'Reasoning effort')} value={reasoningEffortSummary} />
            <SummaryBadge label={text('运行模式', 'Run mode')} value={model.runMode === 'step' ? text('单步', 'Step') : text('自动', 'Auto')} />
            <SummaryBadge label={text('轮数上限', 'Round cap')} value={String(model.effectiveMaxRounds)} />
            <SummaryBadge label={text('最佳分数', 'Best score')} value={bestScoreDisplay} meta={bestScoreMeta} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {getDetailNoticeItems({
          loading: ui.loading,
          actionMessage: ui.actionMessage,
          error: ui.error,
          displayError: getJobDisplayError(model.errorMessage, locale),
          locale,
        }).map((notice) => (
          <motion.div
            key={notice.key}
            initial={{ opacity: 0, y: notice.tone === 'info' ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`notice${notice.tone === 'success' ? ' success' : notice.tone === 'error' ? ' error' : ''}`}
          >
            {notice.text}
          </motion.div>
        ))}
      </AnimatePresence>

      <ResultStage model={model} ui={ui} handlers={handlers} />
      <StableRulesPanel model={model} ui={ui} form={form} handlers={handlers} />

      <section className="control-stage">
        <div className="section-head">
          <div>
            <h2 className="section-title has-icon">
              <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                <Settings2 size={18} />
              </span>
              {text('任务控制', 'Task controls')}
            </h2>
            <p className="small">{text('先决定怎么跑，再补这次的人工纠偏。', 'Decide how to run it first, then add the manual correction for this turn.')}</p>
          </div>
        </div>
        <div className="control-stage-grid">
          <RuntimeControlsPanel model={model} models={models} ui={ui} form={form} handlers={handlers} />
          <PendingSteeringPanel model={model} ui={ui} form={form} handlers={handlers} />
        </div>
      </section>

      <DiagnosticsPanel model={model} ui={ui} handlers={handlers} />
    </div>
  )
}

export function getDetailNoticeItems(input: {
  loading: boolean
  actionMessage: string | null
  error: string | null
  displayError: string | null
  locale?: 'zh-CN' | 'en'
}) {
  const locale = input.locale ?? 'zh-CN'
  const notices: Array<{ key: string; text: string; tone: 'info' | 'success' | 'error' }> = []

  if (input.loading) {
    notices.push({
      key: 'loading',
      text: locale === 'en' ? 'Refreshing the latest job detail...' : '正在刷新最新任务详情...',
      tone: 'info',
    })
  }

  if (input.actionMessage) {
    notices.push({
      key: 'action-message',
      text: input.actionMessage,
      tone: 'success',
    })
  }

  if (input.error) {
    notices.push({
      key: 'ui-error',
      text: mapJobDetailNoticeError(input.error, locale),
      tone: 'error',
    })
  }

  if (input.displayError) {
    notices.push({
      key: 'display-error',
      text: input.displayError,
      tone: 'error',
    })
  }

  return notices
}

function mapJobDetailNoticeError(message: string, locale: 'zh-CN' | 'en') {
  if (/候选稿分数字段无效：/u.test(message)) {
    return locale === 'en'
      ? 'The model returned an invalid score for this round, so the result write was blocked. Retry once; if it keeps happening, switch models or try again later.'
      : '模型本轮返回了无效分数，系统已拦截这次结果写入。请直接重试；若反复出现，建议更换模型或稍后再试。'
  }

  return message
}
