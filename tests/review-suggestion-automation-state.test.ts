import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveReviewSuggestionAutomationState } from '../src/lib/review-suggestion-automation'

test('review suggestion automation state falls back to stable target when the job flag is missing', () => {
  assert.deepEqual(
    resolveReviewSuggestionAutomationState({
      autoApplyReviewSuggestions: false,
      autoApplyReviewSuggestionsToStableRules: undefined,
    }),
    {
      enabled: false,
      target: 'stable',
    },
  )
})

test('review suggestion automation state prefers optimistic target and enabled overrides', () => {
  assert.deepEqual(
    resolveReviewSuggestionAutomationState(
      {
        autoApplyReviewSuggestions: false,
        autoApplyReviewSuggestionsToStableRules: true,
      },
      {
        enabled: true,
        target: 'pending',
      },
    ),
    {
      enabled: true,
      target: 'pending',
    },
  )
})

test('review suggestion automation state keeps the persisted target when only enabled is overridden', () => {
  assert.deepEqual(
    resolveReviewSuggestionAutomationState(
      {
        autoApplyReviewSuggestions: false,
        autoApplyReviewSuggestionsToStableRules: false,
      },
      {
        enabled: true,
      },
    ),
    {
      enabled: true,
      target: 'pending',
    },
  )
})

test('review suggestion automation state keeps the persisted enabled flag when only target is overridden', () => {
  assert.deepEqual(
    resolveReviewSuggestionAutomationState(
      {
        autoApplyReviewSuggestions: true,
        autoApplyReviewSuggestionsToStableRules: true,
      },
      {
        target: 'pending',
      },
    ),
    {
      enabled: true,
      target: 'pending',
    },
  )
})
