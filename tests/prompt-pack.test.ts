import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolvePromptPackDir } from '../src/lib/server/constants'
import { readPromptPackArtifacts, withPromptPackRubricOverride } from '../src/lib/server/prompt-pack'

test('resolvePromptPackDir defaults to the repo-local prompt pack', () => {
  const original = process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
  delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR

  try {
    const dir = resolvePromptPackDir()
    assert.equal(path.normalize(dir), path.join(process.cwd(), 'prompt-pack', 'default'))
  } finally {
    if (original === undefined) {
      delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
    } else {
      process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = original
    }
  }
})

test('resolvePromptPackDir honors PROMPT_OPTIMIZER_PROMPT_PACK_DIR override', () => {
  const original = process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
  const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-pack-override-'))
  process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = overrideDir

  try {
    assert.equal(resolvePromptPackDir(), overrideDir)
  } finally {
    if (original === undefined) {
      delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
    } else {
      process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = original
    }
  }
})

test('readPromptPackArtifacts loads the three required markdown files from the resolved directory', () => {
  const original = process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
  const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-pack-files-'))
  fs.mkdirSync(path.join(overrideDir, 'references'), { recursive: true })
  fs.writeFileSync(path.join(overrideDir, 'SKILL.md'), '# Skill\n', 'utf8')
  fs.writeFileSync(path.join(overrideDir, 'references', 'rubric.md'), '# Rubric\n', 'utf8')
  fs.writeFileSync(path.join(overrideDir, 'references', 'universal-template.md'), '# Template\n', 'utf8')
  process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = overrideDir

  try {
    const pack = readPromptPackArtifacts()
    assert.equal(pack.skillMd, '# Skill\n')
    assert.equal(pack.rubricMd, '# Rubric\n')
    assert.equal(pack.templateMd, '# Template\n')
  } finally {
    if (original === undefined) {
      delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
    } else {
      process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = original
    }
  }
})

test('withPromptPackRubricOverride keeps the same pack for empty or identical rubric and rehashes changed rubric', () => {
  const pack = {
    id: 'pack-1',
    hash: 'base-hash',
    skillMd: '# Skill\n',
    rubricMd: '# Rubric\n',
    templateMd: '# Template\n',
    createdAt: '2026-03-20T00:00:00.000Z',
  }

  assert.equal(withPromptPackRubricOverride(pack, ''), pack)
  assert.equal(withPromptPackRubricOverride(pack, '# Rubric\n'), pack)

  const overridden = withPromptPackRubricOverride(pack, '# Custom Rubric\n')
  const overriddenAgain = withPromptPackRubricOverride(pack, '# Custom Rubric\n')

  assert.notEqual(overridden, pack)
  assert.equal(overridden.rubricMd, '# Custom Rubric\n')
  assert.notEqual(overridden.hash, pack.hash)
  assert.equal(overridden.hash, overriddenAgain.hash)
})

test('default skill keeps mode fidelity and direct-output guards after absorption', () => {
  const pack = readPromptPackArtifacts()

  assert.match(pack.skillMd, /模式保真/)
  assert.match(pack.skillMd, /Create.*直接可用的业务 prompt/u)
  assert.match(pack.skillMd, /JSON\s*\/\s*字段\s*\/\s*contract\s*\/\s*schema/u)
})

test('default skill keeps public review title discipline while preserving rendering guardrails', () => {
  const pack = readPromptPackArtifacts()

  assert.match(pack.skillMd, /优化后的<业务名>提示词/u)
  assert.match(pack.skillMd, /四重反引号/u)
})

test('default rubric keeps evidence-triggered and contract-preservation guards after absorption', () => {
  const pack = readPromptPackArtifacts()

  assert.match(pack.rubricMd, /证据触发/u)
  assert.match(pack.rubricMd, /精炼只能发生在当前任务模式内部/u)
  assert.match(pack.rubricMd, /优先保留原主交付与原业务契约/u)
})

test('default prompt-pack strips internal lineage labels from public files', () => {
  const pack = readPromptPackArtifacts()

  for (const token of ['3002', '3003', '3004', 'v2b', 'v4h', 'bootstrap', 'candidate']) {
    assert.doesNotMatch(pack.skillMd, new RegExp(token, 'i'))
    assert.doesNotMatch(pack.rubricMd, new RegExp(token, 'i'))
  }
})

test('default rubric keeps concise public guardrails after absorption', () => {
  const pack = readPromptPackArtifacts()

  assert.match(pack.rubricMd, /去重，不去骨；变薄，不变 mode/u)
  assert.match(pack.rubricMd, /不能通过改写任务模式来“变短”/u)
})
