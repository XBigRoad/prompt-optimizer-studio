import { CheckCircle2, PauseCircle, PlayCircle, RefreshCcw } from 'lucide-react'

import { ConfirmDialog } from '@/components/shared/ui/confirm-dialog'
import { ModelAliasCombobox } from '@/components/shared/ui/model-alias-combobox'
import { SelectField } from '@/components/shared/ui/select-field'
import type {
  JobDetailFormState,
  JobDetailHandlers,
  JobDetailUiState,
  JobDetailViewModel,
  ModelOption,
} from '@/components/widgets/job-detail/job-detail-types'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { buildReasoningEffortOptions } from '@/lib/reasoning-effort'

export function RuntimeControlsPanel({
  model,
  models,
  ui,
  form,
  handlers,
}: {
  model: JobDetailViewModel
  models: ModelOption[]
  ui: Pick<JobDetailUiState, 'savingModels' | 'savingMaxRounds' | 'completing' | 'retrying' | 'cancelling' | 'pausing' | 'resumingStep' | 'resumingAuto'>
  form: Pick<JobDetailFormState, 'taskModel' | 'reasoningEffort' | 'maxRoundsOverrideValue'>
  handlers: Pick<JobDetailHandlers, 'onTaskModelChange' | 'onReasoningEffortChange' | 'onMaxRoundsOverrideChange' | 'onSaveModel' | 'onSaveMaxRoundsOverride' | 'onResumeStep' | 'onResumeAuto' | 'onPauseTask' | 'onCompleteTask' | 'onRetry' | 'onCancelTask'>
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const reasoningEffortOptions = buildReasoningEffortOptions(locale)
  const canEdit = model.status !== 'completed'
  const canRestart = ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(model.status)
  const canCancel = !['completed', 'cancelled'].includes(model.status)
  const canPause = !['completed', 'cancelled', 'paused'].includes(model.status)
  const canResume = !['completed', 'cancelled', 'running'].includes(model.status)
  const canComplete = ['paused', 'manual_review', 'failed'].includes(model.status) && model.candidates.length > 0

  return (
    <div className="control-subpanel runtime-control-panel">
      <div className="section-head control-subhead">
        <div>
          <strong>{text('运行控制', 'Runtime control')}</strong>
          <p className="small">{text('模型、轮数和继续方式都在这里。', 'Models, round caps, and run controls live here.')}</p>
        </div>
      </div>
      <div className="compact-control-grid runtime-config-grid">
        <ModelAliasCombobox
          inputId="job-task-model"
          label={text('任务模型', 'Task model')}
          value={form.taskModel}
          options={models}
          placeholder={model.optimizerModel || text('例如：gpt-5.2', 'For example: gpt-5.2')}
          disabled={!canEdit}
          onChange={handlers.onTaskModelChange}
        />
        <SelectField
          label={text('推理强度', 'Reasoning effort')}
          value={form.reasoningEffort ?? 'default'}
          options={reasoningEffortOptions}
          disabled={!canEdit}
          onChange={(value) => handlers.onReasoningEffortChange?.(value)}
        />
        <label className="label compact-control-field">
          {text('任务级最大轮数', 'Task-level round cap')}
          <input className="input" type="number" min={1} max={99} value={form.maxRoundsOverrideValue} onChange={(event) => handlers.onMaxRoundsOverrideChange(event.target.value)} disabled={!canEdit} />
        </label>
      </div>
      {canEdit ? (
        <div className="inline-actions runtime-save-actions">
          <button className="button ghost compact" type="button" onClick={handlers.onSaveModel} disabled={ui.savingModels}>
            {ui.savingModels ? text('保存中...', 'Saving...') : text('保存模型与推理强度', 'Save model and reasoning')}
          </button>
          <button className="button ghost compact" type="button" onClick={handlers.onSaveMaxRoundsOverride} disabled={ui.savingMaxRounds}>
            {ui.savingMaxRounds ? text('保存中...', 'Saving...') : text('保存轮数', 'Save round cap')}
          </button>
        </div>
      ) : null}
      <div className="runtime-action-stack">
        <div className="button-row runtime-primary-actions">
          {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeStep} disabled={ui.resumingStep}><PlayCircle size={16} /> {ui.resumingStep ? text('处理中...', 'Working...') : text('继续一轮', 'Run one round')}</button> : null}
          {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeAuto} disabled={ui.resumingAuto}><PlayCircle size={16} /> {ui.resumingAuto ? text('处理中...', 'Working...') : text('恢复自动运行', 'Resume auto')}</button> : null}
          {canPause ? <button className="button secondary" type="button" onClick={handlers.onPauseTask} disabled={ui.pausing}>{ui.pausing ? text('处理中...', 'Working...') : model.status === 'running' ? text('暂停（本轮后）', 'Pause after this round') : text('暂停', 'Pause')}</button> : null}
        </div>
        <div className="button-row runtime-secondary-actions">
          {canComplete ? (
            <ConfirmDialog
              title={text('完成并归档？', 'Complete and archive?')}
              description={text('接受当前最新完整提示词作为最终结果，并将任务标记为已完成。完成后不会再继续自动运行。', 'Accept the current latest full prompt as the final result and mark this job as completed. It will not continue running afterward.')}
              confirmText={text('确认完成并归档', 'Confirm completion')}
              disabled={ui.completing}
              onConfirm={handlers.onCompleteTask}
            >
              <button className="button ghost" type="button" disabled={ui.completing}>
                <CheckCircle2 size={16} /> {ui.completing ? text('处理中...', 'Working...') : text('完成并归档', 'Complete and archive')}
              </button>
            </ConfirmDialog>
          ) : null}
          {canRestart ? (
            <ConfirmDialog
              title={text('重新开始？', 'Restart from the beginning?')}
              description={text('这会清空当前候选稿与历史轮次，从初版提示词重新跑。', 'This clears the current candidates and round history, then restarts from the initial prompt.')}
              confirmText={text('确认重新开始', 'Confirm restart')}
              disabled={ui.retrying}
              onConfirm={handlers.onRetry}
            >
              <button className="button ghost" type="button" disabled={ui.retrying}>
                <RefreshCcw size={16} /> {ui.retrying ? text('处理中...', 'Working...') : text('重新开始', 'Restart')}
              </button>
            </ConfirmDialog>
          ) : null}
          {canCancel ? (
            <ConfirmDialog
              title={text('取消任务？', 'Cancel this job?')}
              description={text('取消后，本任务会停止继续优化并进入历史记录。', 'After cancellation, this job stops optimizing and moves into history.')}
              confirmText={text('确认取消任务', 'Confirm cancellation')}
              tone="danger"
              disabled={ui.cancelling}
              onConfirm={handlers.onCancelTask}
            >
              <button className="button danger" type="button" disabled={ui.cancelling}>
                <PauseCircle size={16} /> {ui.cancelling ? text('处理中...', 'Working...') : text('取消任务', 'Cancel job')}
              </button>
            </ConfirmDialog>
          ) : null}
        </div>
      </div>
    </div>
  )
}
