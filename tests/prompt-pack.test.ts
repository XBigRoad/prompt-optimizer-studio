import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolvePromptPackDir } from '../src/lib/server/constants'
import { readPromptPackArtifacts } from '../src/lib/server/prompt-pack'

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
