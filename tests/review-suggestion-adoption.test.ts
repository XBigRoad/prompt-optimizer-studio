import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyReviewSuggestionAddResult,
  clearSelectedReviewSuggestionDrafts,
  collectSelectedReviewSuggestionTexts,
  getReviewSuggestionDraftState,
  resetReviewSuggestionDraftAt,
  syncReviewSuggestionDrafts,
  toggleReviewSuggestionDraftSelectionAt,
  updateReviewSuggestionDraftAt,
} from '../src/lib/review-suggestion-drafts'

test('selected review suggestions keep order and use the edited text', () => {
  let drafts = syncReviewSuggestionDrafts([], ['第一条原文。', '第二条原文。', '第三条原文。'])
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 2)
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  drafts = updateReviewSuggestionDraftAt(drafts, 0, '  第一条已经人工改写。  ')
  drafts = updateReviewSuggestionDraftAt(drafts, 2, '第三条保留原样。')

  assert.deepEqual(collectSelectedReviewSuggestionTexts(drafts), ['第一条已经人工改写。', '第三条保留原样。'])
})

test('resetting one review suggestion restores its original text without clearing selection', () => {
  let drafts = syncReviewSuggestionDrafts([], ['补一条异常处理。'])
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  drafts = updateReviewSuggestionDraftAt(drafts, 0, '补一条更具体的异常处理和兜底。')
  drafts = resetReviewSuggestionDraftAt(drafts, 0)

  assert.equal(drafts[0]?.currentText, '补一条异常处理。')
  assert.equal(drafts[0]?.selected, true)
})

test('clearing selected review suggestions only clears the checkboxes and preserves edits', () => {
  let drafts = syncReviewSuggestionDrafts([], ['补预算分档。', '补缺货替代规则。'])
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  drafts = updateReviewSuggestionDraftAt(drafts, 0, '补更细的预算分档。')
  drafts = clearSelectedReviewSuggestionDrafts(drafts)

  assert.equal(drafts[0]?.selected, false)
  assert.equal(drafts[0]?.currentText, '补更细的预算分档。')
})

test('adopted and duplicate review suggestions become locked until edited again', () => {
  let drafts = syncReviewSuggestionDrafts([], ['补预算分档。', '补缺货替代规则。'])
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 1)
  drafts = applyReviewSuggestionAddResult(drafts, {
    addedTexts: ['补预算分档。'],
    skippedDuplicateTexts: ['补缺货替代规则。'],
  })

  assert.equal(getReviewSuggestionDraftState(drafts[0]!), 'adopted')
  assert.equal(getReviewSuggestionDraftState(drafts[1]!), 'duplicate')

  const toggled = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  assert.equal(toggled[0]?.selected, false)

  const edited = updateReviewSuggestionDraftAt(drafts, 0, '补更细的预算分档。')
  assert.equal(getReviewSuggestionDraftState(edited[0]!), 'dirty_after_adopt')
  const reselected = toggleReviewSuggestionDraftSelectionAt(edited, 0)
  assert.equal(getReviewSuggestionDraftState(reselected[0]!), 'selected')
})

test('stable-rule adoption keeps the submitted target for status copy', () => {
  let drafts = syncReviewSuggestionDrafts([], ['补预算冲突 fallback。'])
  drafts = toggleReviewSuggestionDraftSelectionAt(drafts, 0)
  drafts = applyReviewSuggestionAddResult(drafts, {
    addedTexts: ['补预算冲突 fallback。'],
    skippedDuplicateTexts: [],
  }, 'stable')

  assert.equal(getReviewSuggestionDraftState(drafts[0]!), 'adopted')
  assert.equal(drafts[0]?.submittedTarget, 'stable')
})
