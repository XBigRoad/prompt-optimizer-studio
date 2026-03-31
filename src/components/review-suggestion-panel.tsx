import { useEffect, useMemo, useState } from 'react'

import { RefreshCcw } from 'lucide-react'

import { useLocaleText } from '@/lib/i18n'
import {
  applyReviewSuggestionAddResult,
  collectSelectedReviewSuggestionTexts,
  getReviewSuggestionDraftState,
  resetReviewSuggestionDraftAt,
  syncReviewSuggestionDrafts,
  toggleReviewSuggestionDraftSelectionAt,
  updateReviewSuggestionDraftAt,
  type ReviewSuggestionAddResult,
  type ReviewSuggestionDraft,
} from '@/lib/review-suggestion-drafts'

export function ReviewSuggestionPanel({
  items,
  adding = false,
  disabled = false,
  addTarget = 'pending',
  showAutoApplyControls = false,
  autoApplyEnabled = false,
  onAddSelected,
  onAddTargetChange,
  onToggleAutoApply,
}: {
  items: string[]
  adding?: boolean
  disabled?: boolean
  addTarget?: 'pending' | 'stable'
  showAutoApplyControls?: boolean
  autoApplyEnabled?: boolean
  onAddSelected?: (items: string[]) => Promise<ReviewSuggestionAddResult | void> | ReviewSuggestionAddResult | void
  onAddTargetChange?: (target: 'pending' | 'stable') => void
  onToggleAutoApply?: () => Promise<void> | void
}) {
  const text = useLocaleText()
  const [drafts, setDrafts] = useState<ReviewSuggestionDraft[]>(() => syncReviewSuggestionDrafts([], items))

  useEffect(() => {
    setDrafts((current) => syncReviewSuggestionDrafts(current, items))
  }, [items])

  const interactive = Boolean(onAddSelected)
  const selectedTexts = useMemo(() => collectSelectedReviewSuggestionTexts(drafts), [drafts])

  async function handleAddSelected() {
    if (!onAddSelected || selectedTexts.length === 0) return

    try {
      const result = await onAddSelected(selectedTexts)
      setDrafts((current) => applyReviewSuggestionAddResult(
        current,
        result ?? {
          addedTexts: selectedTexts,
          skippedDuplicateTexts: [],
        },
        addTarget,
      ))
    } catch {
      // 父层会展示失败信息；这里保留当前编辑和勾选，避免用户输入丢失。
    }
  }

  return (
    <div className="review-suggestion-stack">
      <div className="round-diagnostic-panel-head">
        <strong>{text('评审建议', 'Review suggestions')}</strong>
      </div>
      <p className="small review-suggestion-note">
        {interactive
          ? text(
            '这些建议来自评分器，不会自动进入下一轮。勾选、改写并确认后，才会写入待生效引导。',
            'These suggestions come from the judge and never flow into the next round automatically. Select, edit, and confirm them before they become pending steering.',
          )
          : text(
            '这些建议只供人工参考；系统不会自动把它们写进下一轮。',
            'These suggestions are for human review only. The system will not auto-apply them to the next round.',
          )}
      </p>
      {interactive ? (
        <div className="review-suggestion-body">
          {showAutoApplyControls ? (
            <div className="review-suggestion-actions review-suggestion-automation-bar">
              <label className="selection-toggle">
                <input
                  type="checkbox"
                  checked={addTarget === 'stable'}
                  onChange={(event) => onAddTargetChange?.(event.target.checked ? 'stable' : 'pending')}
                  disabled={disabled || adding}
                />
                <span className="small">
                  {text('加入长期规则', 'Add to stable rules')}
                </span>
              </label>
              <button
                className="button ghost compact"
                type="button"
                onClick={() => void onToggleAutoApply?.()}
                disabled={disabled || adding}
              >
                {autoApplyEnabled
                  ? text('关闭后续每轮自动采纳', 'Turn off auto-adopt for future rounds')
                  : text('开启后续每轮自动采纳', 'Turn on auto-adopt for future rounds')}
              </button>
            </div>
          ) : null}
          <div className="review-suggestion-list review-suggestion-grid">
            {drafts.map((draft, index) => {
              const changed = draft.currentText.trim() !== draft.originalText
              const itemDisabled = disabled || adding
              const rowNumber = index + 1
              const draftState = getReviewSuggestionDraftState(draft)
              const selectionLocked = draftState === 'adopted' || draftState === 'duplicate'
              const checkboxDisabled = itemDisabled || selectionLocked

              return (
                <div className="steering-card steering-card-actionable review-suggestion-item" key={`${draft.originalText}-${index}`}>
                  <div className="steering-card-head review-suggestion-item-head">
                    <label className="selection-toggle">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={() => setDrafts((current) => toggleReviewSuggestionDraftSelectionAt(current, index))}
                        disabled={checkboxDisabled}
                        aria-label={text(
                          `切换评审建议 ${rowNumber} 是否加入下一轮引导`,
                          `Toggle whether review suggestion ${rowNumber} should be added to next-round steering`,
                        )}
                      />
                      <span className="small">
                        {draftState === 'selected'
                          ? addTarget === 'stable'
                            ? text('已选中，准备加入长期规则', 'Selected for stable rules')
                            : text('已选中，准备加入下一轮', 'Selected for the next round')
                          : draftState === 'adopted'
                            ? draft.submittedTarget === 'stable'
                              ? text('已加入长期规则', 'Added to stable rules')
                              : text('已加入下一轮引导', 'Added to next-round steering')
                            : draftState === 'duplicate'
                              ? draft.submittedTarget === 'stable'
                                ? text('已在长期规则中', 'Already in stable rules')
                                : text('已在下一轮引导中', 'Already in next-round steering')
                              : draftState === 'dirty_after_adopt'
                                ? text('已在此基础上改写，可重新勾选加入', 'Edited after adoption and can be selected again')
                                : text('未选中，仅保留为人工参考', 'Not selected, kept as manual advice')}
                      </span>
                    </label>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setDrafts((current) => resetReviewSuggestionDraftAt(current, index))}
                      disabled={itemDisabled || !changed}
                      aria-label={text(
                        `恢复评审建议 ${rowNumber} 原文`,
                        `Restore review suggestion ${rowNumber} to the original text`,
                      )}
                    >
                      <RefreshCcw size={16} />
                    </button>
                  </div>
                  <textarea
                    className="textarea review-suggestion-textarea"
                    value={draft.currentText}
                    onChange={(event) => setDrafts((current) => updateReviewSuggestionDraftAt(current, index, event.target.value))}
                    disabled={itemDisabled}
                    aria-label={text(`编辑评审建议 ${rowNumber}`, `Edit review suggestion ${rowNumber}`)}
                    rows={2}
                  />
                </div>
              )
            })}
          </div>
          <div className="review-suggestion-actions">
            <p className="small review-suggestion-meta">
              {selectedTexts.length > 0
                ? text(
                  addTarget === 'stable'
                    ? `将按当前面板顺序把 ${selectedTexts.length} 条已勾选建议加入长期规则。`
                    : `将按当前面板顺序把 ${selectedTexts.length} 条已勾选建议加入下一轮引导。`,
                  addTarget === 'stable'
                    ? `${selectedTexts.length} selected suggestions will be merged into stable rules in the current order.`
                    : `${selectedTexts.length} selected suggestions will be added as next-round steering in the current order.`,
                )
                : text(
                  addTarget === 'stable'
                    ? '先勾选要采用的建议；已加入或已存在于长期规则的建议，需改写后才能再次提交。'
                    : '先勾选要采用的建议；已加入或已存在的建议，需改写后才能再次提交。',
                  addTarget === 'stable'
                    ? 'Select the suggestions you want to adopt. Suggestions already present in stable rules must be edited before they can be submitted again.'
                    : 'Select the suggestions you want to adopt. Suggestions already added or already present must be edited before they can be submitted again.',
                )}
            </p>
            <button
              className="button ghost compact"
              type="button"
              onClick={() => void handleAddSelected()}
              disabled={disabled || adding || selectedTexts.length === 0}
            >
              {adding
                ? text('加入中...', 'Adding...')
                : text(
                  addTarget === 'stable'
                    ? (selectedTexts.length > 0 ? `把选中的 ${selectedTexts.length} 条加入长期规则` : '加入长期规则')
                    : (selectedTexts.length > 0 ? `把选中的 ${selectedTexts.length} 条加入下一轮引导` : '加入下一轮引导'),
                  addTarget === 'stable'
                    ? (selectedTexts.length > 0 ? `Add ${selectedTexts.length} selected items to stable rules` : 'Add to stable rules')
                    : (selectedTexts.length > 0 ? `Add ${selectedTexts.length} selected items as next-round steering` : 'Add to next-round steering'),
                )}
            </button>
          </div>
        </div>
      ) : (
        <ul className="list compact-list">
          {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      )}
    </div>
  )
}
