import assert from 'node:assert/strict'
import test from 'node:test'

import { buildJudgePrompts, buildOptimizerPrompts, compactFeedback } from '../src/lib/server/prompting'

test('compactFeedback keeps only unique high-signal items', () => {
  const result = compactFeedback([
    'a'.repeat(40),
    'b'.repeat(40),
    'a'.repeat(40),
    'c'.repeat(40),
    'd'.repeat(40),
    'e'.repeat(40),
    'f'.repeat(40),
    'g'.repeat(40),
    'h'.repeat(40),
  ], { maxItems: 4, maxItemLength: 20 })

  assert.deepEqual(result, [
    'aaaaaaaaaaaaaaaaaaaa...',
    'bbbbbbbbbbbbbbbbbbbb...',
    'cccccccccccccccccccc...',
    'dddddddddddddddddddd...',
  ])
})

test('optimizer prompt includes one-shot steering for the next round', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: 'draft prompt',
    previousFeedback: ['tighten output schema'],
    nextRoundInstruction: 'Keep the wording warmer and reduce compliance jargon.',
    goalAnchor: {
      goal: 'Keep the original triage task.',
      deliverable: 'Return a structured triage decision.',
      driftGuard: ['Do not turn the task into generic safety advice.'],
    },
    threshold: 95,
  })

  assert.match(prompts.user, /Keep the wording warmer and reduce compliance jargon\./)
  assert.match(prompts.user, /Keep the original triage task\./)
  assert.match(prompts.user, /High-signal feedback from the previous round:/)
})

test('judge prompt remains isolated from next-round steering', () => {
  const prompts = buildJudgePrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    candidatePrompt: 'candidate prompt',
    goalAnchor: {
      goal: 'Keep the original triage task.',
      deliverable: 'Return a structured triage decision.',
      driftGuard: ['Do not turn the task into generic safety advice.'],
    },
    threshold: 95,
    judgeIndex: 0,
  })

  assert.match(prompts.system, /Goal fidelity is a hard gate/i)
  assert.match(prompts.user, /Return a structured triage decision\./)
  assert.doesNotMatch(prompts.system, /next round steering/i)
  assert.doesNotMatch(prompts.user, /Keep the wording warmer/)
})
