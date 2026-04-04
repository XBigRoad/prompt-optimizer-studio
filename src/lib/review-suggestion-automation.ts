export interface ReviewSuggestionAutomationFlags {
  autoApplyReviewSuggestions: boolean
  autoApplyReviewSuggestionsToStableRules?: boolean
}

export interface ReviewSuggestionAutomationOverrides {
  enabled?: boolean | null
  target?: 'pending' | 'stable' | null
}

export function resolveReviewSuggestionAutomationState(
  flags: ReviewSuggestionAutomationFlags | null | undefined,
  overrides: ReviewSuggestionAutomationOverrides = {},
) {
  return {
    enabled: overrides.enabled ?? Boolean(flags?.autoApplyReviewSuggestions),
    target: overrides.target ?? (flags?.autoApplyReviewSuggestionsToStableRules === false ? 'pending' : 'stable'),
  }
}
