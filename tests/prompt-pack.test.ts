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
    assert.match(dir, new RegExp(`prompt-pack[\\/]default$`))
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

test('default prompt pack keeps optimizer guidance separate from judge scoring and allows useful completeness', () => {
  const original = process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
  delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR

  try {
    const pack = readPromptPackArtifacts()
    assert.doesNotMatch(pack.skillMd, /评分驱动|按 .*rubric.*打分|低于阈值/u)
    assert.doesNotMatch(pack.skillMd, /`Review`|`Create`|`Debug`|For `Review`|For `Create`|For `Debug`/u)
    assert.match(pack.skillMd, /现有提示词优化|从需求生成提示词|失败样例修复/u)
    assert.match(pack.skillMd, /可以变长|合理扩写/u)
    assert.match(pack.skillMd, /domain-specific|任务特有|冲突优先级|证据边界/u)
    assert.doesNotMatch(pack.skillMd, /所有任务都必须执行以下约束/u)
    assert.match(pack.rubricMd, /长度本身不是扣分项/u)
    assert.match(pack.rubricMd, /judge.*当前被评提示词|当前被评提示词.*judge/u)
    assert.doesNotMatch(pack.rubricMd, /Review 模式|用于 `?Review`? 模式/u)
    assert.match(pack.rubricMd, /简单.*人设.*标题/u)
    assert.match(pack.rubricMd, /高分段|task-specific|任务特有/u)
    assert.match(pack.rubricMd, /接近满分|生产级|decision rules|决策规则/u)
    assert.match(pack.rubricMd, /满分只留给/u)
    assert.match(pack.rubricMd, /只有“你是谁.*输出|不应进入高分段/u)
    assert.match(pack.rubricMd, /Rating Interpretation|评分档位解释|High-Risk|高风险信号/u)
    assert.doesNotMatch(pack.rubricMd, /80 分|90\+|95\+|100 分|Decision Threshold|Dead-End Signals/u)
    assert.doesNotMatch(pack.rubricMd, /通常不应高于 `?94`?|85-94.*95\+/u)
  } finally {
    if (original === undefined) {
      delete process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR
    } else {
      process.env.PROMPT_OPTIMIZER_PROMPT_PACK_DIR = original
    }
  }
})
