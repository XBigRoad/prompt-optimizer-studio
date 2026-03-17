import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createWorkerRuntimeState,
  resolveStableWorkerOwnerId,
  shouldReplaceWorkerRuntime,
} from '../src/lib/server/worker-runtime'

test('replaces worker runtime when owner changes', () => {
  const existing = createWorkerRuntimeState('owner-a', 'runtime-a')
  assert.equal(shouldReplaceWorkerRuntime(existing, 'owner-b', 'runtime-a'), true)
})

test('keeps worker runtime when owner is unchanged', () => {
  const existing = createWorkerRuntimeState('owner-a', 'runtime-a')
  assert.equal(shouldReplaceWorkerRuntime(existing, 'owner-a', 'runtime-a'), false)
})

test('replaces worker runtime when runtime version changes', () => {
  const existing = createWorkerRuntimeState('owner-a', 'runtime-a')
  assert.equal(shouldReplaceWorkerRuntime(existing, 'owner-a', 'runtime-b'), true)
})

test('stable worker owner id is generated once per holder', () => {
  const holder: { __promptOptimizerWorkerOwnerId?: string } = {}
  const first = resolveStableWorkerOwnerId(holder, () => 'owner-a')
  const second = resolveStableWorkerOwnerId(holder, () => 'owner-b')

  assert.equal(first, 'owner-a')
  assert.equal(second, 'owner-a')
})
