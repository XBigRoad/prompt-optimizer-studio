import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearJobDetailRuntimeSnapshot,
  readJobDetailRuntimeSnapshot,
  writeJobDetailRuntimeSnapshot,
} from '../src/lib/job-detail-runtime-cache'

test('job detail runtime cache stores snapshots per job id and clears them cleanly', () => {
  clearJobDetailRuntimeSnapshot('job-a')
  clearJobDetailRuntimeSnapshot('job-b')

  writeJobDetailRuntimeSnapshot('job-a', {
    detail: { id: 'job-a', title: '任务 A' },
    models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    settings: { maxRounds: 25 },
    effectiveRubricMd: '# Rubric A',
    effectiveRubricSource: 'job',
  })
  writeJobDetailRuntimeSnapshot('job-b', {
    detail: { id: 'job-b', title: '任务 B' },
    models: [],
    settings: { maxRounds: 8 },
    effectiveRubricMd: '',
    effectiveRubricSource: 'default',
  })

  assert.deepEqual(readJobDetailRuntimeSnapshot('job-a'), {
    detail: { id: 'job-a', title: '任务 A' },
    models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    settings: { maxRounds: 25 },
    effectiveRubricMd: '# Rubric A',
    effectiveRubricSource: 'job',
  })
  assert.deepEqual(readJobDetailRuntimeSnapshot('job-b'), {
    detail: { id: 'job-b', title: '任务 B' },
    models: [],
    settings: { maxRounds: 8 },
    effectiveRubricMd: '',
    effectiveRubricSource: 'default',
  })

  clearJobDetailRuntimeSnapshot('job-a')

  assert.equal(readJobDetailRuntimeSnapshot('job-a'), null)
  assert.deepEqual(readJobDetailRuntimeSnapshot('job-b'), {
    detail: { id: 'job-b', title: '任务 B' },
    models: [],
    settings: { maxRounds: 8 },
    effectiveRubricMd: '',
    effectiveRubricSource: 'default',
  })

  clearJobDetailRuntimeSnapshot('job-b')
})
