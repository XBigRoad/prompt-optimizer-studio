export interface ReviewSuggestionDraft {
  originalText: string
  currentText: string
  selected: boolean
  submissionState: 'idle' | 'adopted' | 'duplicate'
  submittedText: string | null
  submittedTarget: 'pending' | 'stable' | null
}

export type ReviewSuggestionDraftState = 'idle' | 'selected' | 'adopted' | 'duplicate' | 'dirty_after_adopt'

function normalizeSuggestionText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export interface ReviewSuggestionAddResult {
  addedTexts: string[]
  skippedDuplicateTexts: string[]
}

function createReviewSuggestionDraft(text: string): ReviewSuggestionDraft {
  return {
    originalText: text,
    currentText: text,
    selected: false,
    submissionState: 'idle',
    submittedText: null,
    submittedTarget: null,
  }
}

export function getReviewSuggestionDraftState(draft: ReviewSuggestionDraft): ReviewSuggestionDraftState {
  if (draft.submissionState === 'idle') {
    return draft.selected ? 'selected' : 'idle'
  }

  const currentText = normalizeSuggestionText(draft.currentText)
  if (draft.submittedText && currentText === draft.submittedText) {
    return draft.submissionState
  }

  return draft.selected ? 'selected' : 'dirty_after_adopt'
}

export function syncReviewSuggestionDrafts(current: ReviewSuggestionDraft[], items: string[]) {
  return items
    .map(normalizeSuggestionText)
    .filter(Boolean)
    .map((item, index) => {
      const existing = current[index]
      if (existing && existing.originalText === item) {
        return existing
      }

      return createReviewSuggestionDraft(item)
    })
}

export function updateReviewSuggestionDraftAt(drafts: ReviewSuggestionDraft[], index: number, nextText: string) {
  return drafts.map((draft, draftIndex) => (
    draftIndex === index
      ? { ...draft, currentText: nextText }
      : draft
  ))
}

export function toggleReviewSuggestionDraftSelectionAt(drafts: ReviewSuggestionDraft[], index: number) {
  return drafts.map((draft, draftIndex) => (
    draftIndex === index
      ? (getReviewSuggestionDraftState(draft) === 'adopted' || getReviewSuggestionDraftState(draft) === 'duplicate')
          ? draft
          : { ...draft, selected: !draft.selected }
      : draft
  ))
}

export function resetReviewSuggestionDraftAt(drafts: ReviewSuggestionDraft[], index: number) {
  return drafts.map((draft, draftIndex) => (
    draftIndex === index
      ? { ...draft, currentText: draft.originalText }
      : draft
  ))
}

export function clearSelectedReviewSuggestionDrafts(drafts: ReviewSuggestionDraft[]) {
  return drafts.map((draft) => ({ ...draft, selected: false }))
}

export function applyReviewSuggestionAddResult(
  drafts: ReviewSuggestionDraft[],
  result: ReviewSuggestionAddResult,
  target: 'pending' | 'stable' = 'pending',
): ReviewSuggestionDraft[] {
  const addedTexts = new Set(result.addedTexts.map(normalizeSuggestionText).filter(Boolean))
  const duplicateTexts = new Set(result.skippedDuplicateTexts.map(normalizeSuggestionText).filter(Boolean))

  return drafts.map((draft) => {
    if (!draft.selected) {
      return draft
    }

    const normalizedText = normalizeSuggestionText(draft.currentText)
    if (addedTexts.has(normalizedText)) {
      return {
        ...draft,
        selected: false,
        submissionState: 'adopted' as const,
        submittedText: normalizedText,
        submittedTarget: target,
      }
    }

    if (duplicateTexts.has(normalizedText)) {
      return {
        ...draft,
        selected: false,
        submissionState: 'duplicate' as const,
        submittedText: normalizedText,
        submittedTarget: target,
      }
    }

    return {
      ...draft,
      selected: false,
    }
  })
}

export function collectSelectedReviewSuggestionTexts(drafts: ReviewSuggestionDraft[]) {
  return drafts
    .filter((draft) => getReviewSuggestionDraftState(draft) === 'selected')
    .map((draft) => normalizeSuggestionText(draft.currentText))
    .filter(Boolean)
}
