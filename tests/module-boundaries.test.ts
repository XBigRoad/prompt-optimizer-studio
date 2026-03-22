import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import * as jobsPublic from '../src/lib/server/jobs/index'
import * as jobsRuntime from '../src/lib/server/jobs/runtime'
import * as providers from '../src/lib/server/providers/index'

test('jobs public index does not expose runtime-only worker helpers', () => {
  assert.equal('claimNextRunnableJob' in jobsPublic, false)
  assert.equal('heartbeatJobClaim' in jobsPublic, false)
  assert.equal('createCandidateWithJudgesForActiveWorker' in jobsPublic, false)
  assert.equal('updateJobProgress' in jobsPublic, false)
})

test('jobs runtime surface is limited to worker/runtime operations', () => {
  assert.equal('claimNextRunnableJob' in jobsRuntime, true)
  assert.equal('heartbeatJobClaim' in jobsRuntime, true)
  assert.equal('createCandidateWithJudgesForActiveWorker' in jobsRuntime, true)
  assert.equal('listJobs' in jobsRuntime, false)
  assert.equal('getJobDetail' in jobsRuntime, false)
  assert.equal('pauseJob' in jobsRuntime, false)
})

test('worker imports runtime-only jobs entry instead of jobs public index', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'server', 'runtime', 'worker.ts'), 'utf8')
  assert.match(source, /from ['"]@\/lib\/server\/jobs\/runtime['"]/)
  assert.doesNotMatch(source, /from ['"]@\/lib\/server\/jobs\/index['"]/)
})

test('providers public index exports only factory and protocol inference', () => {
  assert.deepEqual(Object.keys(providers).sort(), ['createProviderAdapter', 'inferApiProtocol'])
})
