import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2, WandSparkles } from 'lucide-react'

import { ConfirmDialog } from '@/components/shared/ui/confirm-dialog'
import type { JobDetailFormState, JobDetailHandlers, JobDetailUiState, JobDetailViewModel } from '@/components/widgets/job-detail/job-detail-types'
import { useLocaleText } from '@/lib/i18n'

export function PendingSteeringPanel({
  model,
  ui,
  form,
  handlers,
}: {
  model: JobDetailViewModel
  ui: Pick<JobDetailUiState, 'savingSteering' | 'generatingGoalAnchorDraft' | 'savingGoalAnchor'>
  form: Pick<JobDetailFormState, 'pendingSteeringInput' | 'selectedPendingSteeringIds'>
  handlers: Pick<JobDetailHandlers, 'onPendingSteeringInputChange' | 'onAddPendingSteering' | 'onGenerateGoalAnchorDraft' | 'onClearPendingSteering' | 'onTogglePendingSteeringSelection' | 'onRemovePendingSteeringItem'>
}) {
  const text = useLocaleText()
  const hasPendingSteering = model.pendingSteeringItems.length > 0
  const selectedPendingSteeringIdSet = new Set(form.selectedPendingSteeringIds)
  const hasSelectedPendingSteering = selectedPendingSteeringIdSet.size > 0
  const canEdit = model.status !== 'completed'
  const canSteer = !['completed', 'cancelled'].includes(model.status)

  return (
    <div className="control-subpanel steering-control-panel" id="next-round-steering">
      <div className="section-head control-subhead">
        <div>
          <strong>{text('下一轮引导', 'Next-round steering')}</strong>
          <p className="small">{text('只写这次想纠偏的点。它会在下一轮生效，不影响当前轮。', 'Only write the correction you want for this turn. It takes effect in the next round, not the current one.')}</p>
          {model.status === 'completed' && hasPendingSteering ? (
            <p className="small">{text('任务已完成：这些待生效引导会作为记录保留，但不会再被应用到后续轮次。', 'This job is already completed. These pending steering items remain only as records and will not be applied again.')}</p>
          ) : null}
        </div>
      </div>
      {hasPendingSteering ? (
        <div className="steering-impact-inline">
          <div className="section-head compact-head">
            <div>
              <strong>{text('这组引导对下一轮的影响', 'How this steering batch affects the next round')}</strong>
              <p className="small">{text(`下一轮会按当前顺序吸收这 ${model.pendingSteeringItems.length} 条引导；如果结果把其中内容写进完整提示词，后续轮次会继续继承这些变化。`, `The next round will absorb these ${model.pendingSteeringItems.length} steering items in order. If the resulting full prompt keeps them, later rounds will inherit the change too.`)}</p>
            </div>
          </div>
          <ul className="list compact-list">
            <li>{text('optimizer 会按当前顺序吸收这组引导，再基于完整提示词做最小必要改动。', 'The optimizer absorbs this steering batch in order, then makes the smallest necessary changes to the full prompt.')}</li>
            <li>{text('reviewer 不会看到这些引导原文，只会看到下一轮产出的候选提示词。', 'The reviewer never sees the raw steering. It only sees the next candidate prompt.')}</li>
          </ul>
        </div>
      ) : null}
      <label className="label steering-control-field">
        {text('追加一条人工引导', 'Add one steering note')}
        <textarea className="textarea" value={form.pendingSteeringInput} onChange={(event) => handlers.onPendingSteeringInputChange(event.target.value)} disabled={!canSteer} />
      </label>
      <div className="button-row compact-actions">
        {canSteer ? (
          <button className="button ghost compact" type="button" onClick={handlers.onAddPendingSteering} disabled={ui.savingSteering}>
            <Plus size={16} /> {ui.savingSteering ? text('保存中...', 'Saving...') : text('加入待生效列表', 'Add to pending list')}
          </button>
        ) : null}
        {canEdit ? (
          <button className="button ghost compact" type="button" onClick={handlers.onGenerateGoalAnchorDraft} disabled={!hasSelectedPendingSteering || ui.generatingGoalAnchorDraft}>
            <WandSparkles size={16} /> {ui.generatingGoalAnchorDraft ? text('生成中...', 'Building...') : text('生成长期规则草稿', 'Build stable-rule draft')}
          </button>
        ) : null}
        {canSteer && hasPendingSteering ? (
          <ConfirmDialog
            title={text('清空待生效引导？', 'Clear pending steering?')}
            description={text('清空后，它们不会进入下一轮，也不会写入长期规则。', 'After clearing, these items will not enter the next round and will not be written into stable rules.')}
            confirmText={text('确认清空', 'Confirm clear')}
            tone="danger"
            disabled={ui.savingSteering}
            onConfirm={handlers.onClearPendingSteering}
          >
            <button className="button ghost compact" type="button" disabled={ui.savingSteering}>
              <Trash2 size={16} /> {text('清空待生效引导', 'Clear pending steering')}
            </button>
          </ConfirmDialog>
        ) : null}
      </div>
      {hasPendingSteering ? (
        <div className="pending-steering-stack control-pending-list">
          <div className="section-head compact-head">
            <div>
              <strong>{text('待生效列表', 'Pending list')}</strong>
              <p className="small">{text('勾选后，生成草稿并保存，才会进入长期规则。', 'Select items, build a draft, and save it before they become stable rules.')}</p>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {model.pendingSteeringItems.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                className="steering-card steering-card-actionable"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, y: -6 }}
              >
                <div className="steering-card-head">
                  <span className="pill paused">{text('待生效', 'Pending')} {index + 1}</span>
                  <div className="steering-card-actions">
                    <label className="selection-toggle">
                      <input
                        type="checkbox"
                        checked={selectedPendingSteeringIdSet.has(item.id)}
                        onChange={() => handlers.onTogglePendingSteeringSelection(item.id)}
                        disabled={!canEdit || ui.generatingGoalAnchorDraft || ui.savingGoalAnchor}
                        aria-label={text(`切换待生效引导 ${index + 1} 是否加入长期规则`, `Toggle whether pending steering ${index + 1} should be merged into stable rules`)}
                      />
                      <span className="small">{selectedPendingSteeringIdSet.has(item.id) ? text('加入长期规则', 'Merge into stable rules') : text('只影响下一轮', 'Next round only')}</span>
                    </label>
                    {canSteer ? (
                      <button className="icon-button" type="button" aria-label={text(`删除待生效引导 ${index + 1}`, `Delete pending steering ${index + 1}`)} onClick={() => handlers.onRemovePendingSteeringItem(item.id)} disabled={ui.savingSteering}>
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p>{item.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="empty-inline-state">
          <span className="small">{text('当前没有待生效引导。要临时纠偏时，先在上面添加一条。', 'No pending steering yet. Add one above when you need a temporary course correction.')}</span>
        </div>
      )}
    </div>
  )
}
