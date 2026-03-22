import { CheckCircle2 } from 'lucide-react'

import { FoldCardSummary, ReadonlyGoalField } from '@/components/widgets/job-detail/control-room-primitives'
import type { JobDetailFormState, JobDetailHandlers, JobDetailUiState, JobDetailViewModel } from '@/components/widgets/job-detail/job-detail-types'
import { useLocaleText } from '@/lib/i18n'

export function StableRulesPanel({
  model,
  ui,
  form,
  handlers,
}: {
  model: JobDetailViewModel
  ui: Pick<JobDetailUiState, 'savingCustomRubric' | 'savingGoalAnchor'>
  form: Pick<JobDetailFormState, 'customRubricMd' | 'goalAnchorGoal' | 'goalAnchorDeliverable' | 'goalAnchorDriftGuardText' | 'goalAnchorDraftReady'>
  handlers: Pick<JobDetailHandlers, 'onCustomRubricChange' | 'onSaveCustomRubric' | 'onGoalAnchorGoalChange' | 'onGoalAnchorDeliverableChange' | 'onGoalAnchorDriftGuardChange' | 'onSaveGoalAnchor'>
}) {
  const text = useLocaleText()
  const hasPendingSteering = model.pendingSteeringItems.length > 0
  const canEdit = model.status !== 'completed'
  const canAdjustStableRules = canEdit
  const rubricSourceZh =
    model.effectiveRubricSource === 'job'
      ? '本任务'
      : model.effectiveRubricSource === 'settings'
        ? '配置台'
        : '内置默认'
  const rubricSourceEn =
    model.effectiveRubricSource === 'job'
      ? 'this job'
      : model.effectiveRubricSource === 'settings'
        ? 'settings'
        : 'built-in default'
  const rubricSourceLine = text(`当前来源：${rubricSourceZh}`, `Current source: ${rubricSourceEn}`)
  const hasSavedJobRubricOverride = Boolean((model.customRubricMd ?? '').trim())

  return (
    <section className="understanding-stage">
      <div className="understanding-stack">
        <div className="panel understanding-panel">
          <div className="section-head">
            <div>
              <h2 className="section-title has-icon">
                <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                  <CheckCircle2 size={18} />
                </span>
                {hasPendingSteering ? text('当前有效目标视图', 'Current active goal view') : text('长期规则', 'Stable rules')}
              </h2>
              <p className="small">
                {hasPendingSteering
                  ? text('长期规则保持不变，待生效引导会作为下一轮的一次性补充。', 'Stable rules stay fixed. Pending steering is only a one-time addition for the next round.')
                  : text('这里定义任务不能漂移的长期目标与长期交付物。', 'This defines the long-term goal and deliverable that the task should not drift away from.')}
              </p>
            </div>
          </div>

          <div className="rationale-inline-block">
            <div className="section-head compact-head">
              <div>
                <strong>{text('提炼依据', 'Rationale')}</strong>
                <p className="small">{model.goalAnchorExplanation.sourceSummary}</p>
              </div>
            </div>
            <ul className="list compact-list rationale-list">
              {model.goalAnchorExplanation.rationale.map((item, index) => (
                <li key={`goal-rationale-${index}`}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="stable-rules-grid">
            <div className="active-goal-grid compact-goal-grid" data-ui="stable-rules-goal-stack">
              <ReadonlyGoalField
                label={text('长期目标', 'Stable goal')}
                value={model.goalAnchor.goal}
                expandLabel={text('展开全部', 'Expand all')}
                collapseLabel={text('收起', 'Collapse')}
                collapsedPreview={text('内容较长，展开查看完整内容', 'Long content. Expand to view the full text.')}
              />
              <ReadonlyGoalField
                label={text('长期交付物', 'Stable deliverable')}
                value={model.goalAnchor.deliverable}
                expandLabel={text('展开全部', 'Expand all')}
                collapseLabel={text('收起', 'Collapse')}
                collapsedPreview={text('内容较长，展开查看完整内容', 'Long content. Expand to view the full text.')}
              />
              <ReadonlyGoalField
                label={text('长期边界', 'Stable guardrails')}
                value={model.goalAnchor.driftGuard.join('\n')}
                expandLabel={text('展开全部', 'Expand all')}
                collapseLabel={text('收起', 'Collapse')}
                collapsedPreview={text(
                  `共 ${model.goalAnchor.driftGuard.length} 条边界，展开查看完整内容`,
                  `${model.goalAnchor.driftGuard.length} guardrails. Expand to view the full text.`,
                )}
              />
              <p className="small goal-summary-note">
                {text(
                  '长期规则会持续约束后续轮次；临时引导只影响下一轮，除非你明确保存新的长期规则。',
                  'Stable rules keep constraining later rounds. Temporary steering only affects the next round unless you explicitly save a new stable rule.',
                )}
              </p>
            </div>

            <div className="stable-scoring-block">
              <div className="section-head compact-head">
                <div>
                  <strong>{text('当前评分标准', 'Current scoring standard')}</strong>
                  <p className="small">{rubricSourceLine}</p>
                </div>
              </div>

              <details className="fold-card fold-card-toggle rubric-preview-fold">
                <summary className="fold-card-summary">
                  <FoldCardSummary
                    title={text('评分标准预览', 'Scoring standard preview')}
                    closedLabel={text('展开', 'Expand')}
                    openLabel={text('收起', 'Collapse')}
                  />
                </summary>
                <pre className="pre rubric-pre">{model.effectiveRubricMd}</pre>
              </details>

              {canEdit ? (
                <details className="fold-card fold-card-toggle rubric-editor-fold">
                  <summary className="fold-card-summary">
                    <FoldCardSummary
                      title={text('编辑任务评分标准', 'Edit task scoring standard')}
                      closedLabel={text('展开', 'Expand')}
                      openLabel={text('收起', 'Collapse')}
                    />
                  </summary>
                  <label className="label">
                    {text('任务评分标准覆写', 'Task scoring override')}
                    <textarea
                      className="textarea"
                      rows={8}
                      value={form.customRubricMd}
                      onChange={(event) => handlers.onCustomRubricChange(event.target.value)}
                      placeholder={text('留空以跟随配置台。', 'Leave empty to follow settings.')}
                      disabled={!canEdit}
                    />
                  </label>
                  <div className="inline-actions runtime-save-actions">
                    <button className="button ghost compact" type="button" onClick={() => handlers.onSaveCustomRubric()} disabled={ui.savingCustomRubric}>
                      {ui.savingCustomRubric ? text('保存中...', 'Saving...') : text('保存任务评分标准', 'Save task scoring standard')}
                    </button>
                    {hasSavedJobRubricOverride ? (
                      <button
                        className="button ghost compact"
                        type="button"
                        onClick={() => {
                          handlers.onCustomRubricChange('')
                          handlers.onSaveCustomRubric('')
                        }}
                        disabled={ui.savingCustomRubric}
                      >
                        {text('恢复跟随配置台', 'Restore following settings')}
                      </button>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          {canAdjustStableRules ? (
            <details className="anchor-editor-drawer">
              <summary className="fold-card-summary">
                <FoldCardSummary
                  title={text('调整长期规则', 'Adjust stable rules')}
                  closedLabel={text('按需打开', 'Open when needed')}
                  openLabel={text('收起', 'Collapse')}
                />
              </summary>
              <div className="anchor-editor-body">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('编辑草稿', 'Edit draft')}</strong>
                    <p className="small">{text('这里只是修改草稿。点击保存后，长期规则才会真正更新。未选中的临时引导不会自动写进这里。', 'This is only a working draft. Stable rules update only after you save. Unselected temporary steering will not be written here automatically.')}</p>
                  </div>
                  <button className="button ghost" type="button" onClick={handlers.onSaveGoalAnchor} disabled={ui.savingGoalAnchor}>
                    {ui.savingGoalAnchor ? text('保存中...', 'Saving...') : text('保存长期规则', 'Save stable rules')}
                  </button>
                </div>
                <div className="form-grid anchor-editor-grid">
                  <label className="label">
                    {text('长期目标', 'Stable goal')}
                    <textarea className="textarea" value={form.goalAnchorGoal} onChange={(event) => handlers.onGoalAnchorGoalChange(event.target.value)} disabled={!canAdjustStableRules} />
                  </label>
                  <label className="label">
                    {text('长期交付物', 'Stable deliverable')}
                    <textarea className="textarea" value={form.goalAnchorDeliverable} onChange={(event) => handlers.onGoalAnchorDeliverableChange(event.target.value)} disabled={!canAdjustStableRules} />
                  </label>
                  <label className="label">
                    {text('长期边界', 'Stable guardrails')}
                    <textarea className="textarea" value={form.goalAnchorDriftGuardText} onChange={(event) => handlers.onGoalAnchorDriftGuardChange(event.target.value)} disabled={!canAdjustStableRules} />
                  </label>
                </div>
                {form.goalAnchorDraftReady ? (
                  <div className="goal-anchor-draft-note">
                    <strong>{text('已把选中项带入长期规则编辑区', 'Selected items were added to the stable-rule editor')}</strong>
                    <p className="small">{text('现在还只是草稿。点击“保存长期规则”后，选中的条目才会成为长期规则；未选中的条目会继续留在待生效列表。', 'This is still only a draft. Selected items become stable rules only after you save. Unselected items stay in the pending list.')}</p>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  )
}
