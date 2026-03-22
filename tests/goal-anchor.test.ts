import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveGoalAnchor,
  normalizeGoalAnchor,
  parseGoalAnchor,
  serializeGoalAnchor,
} from '../src/lib/server/goal-anchor/index'

test('deriveGoalAnchor creates a stable initial anchor from raw prompt', () => {
  const anchor = deriveGoalAnchor('请帮我优化一个用于医疗分诊的提示词，要求输出结构化分诊结论和风险等级。')

  assert.match(anchor.goal, /医疗分诊/)
  assert.ok(anchor.deliverable.length > 0)
  assert.equal(anchor.driftGuard.length >= 2, true)
})

test('deriveGoalAnchor infers a prompt-specific deliverable and guardrails for a cooking help prompt', () => {
  const anchor = deriveGoalAnchor('帮助用户做美味的寿喜烧')

  assert.match(anchor.goal, /寿喜烧/)
  assert.match(anchor.deliverable, /寿喜烧/)
  assert.doesNotMatch(anchor.deliverable, /主要输出产物与完成目标/)
  assert.equal(anchor.driftGuard.some((item) => /寿喜烧/.test(item)), true)
  assert.equal(anchor.driftGuard.some((item) => /步骤|做法|食材|火候/.test(item)), true)
})

test('deriveGoalAnchor keeps role prompts specific instead of falling back to a generic deliverable', () => {
  const anchor = deriveGoalAnchor('作为最顶级的中医，结合问诊和图片分析症状，给出诊断建议，并在需要时继续向用户提问。')

  assert.match(anchor.goal, /中医/)
  assert.match(anchor.deliverable, /诊断建议|问诊|图片|助手设定/)
  assert.doesNotMatch(anchor.deliverable, /主要输出产物与完成目标/)
  assert.equal(anchor.driftGuard.some((item) => /中医|问诊|图片|角色/.test(item)), true)
})

test('deriveGoalAnchor strips markdown heading noise and avoids cooking misclassification for structured prompt specs', () => {
  const anchor = deriveGoalAnchor(`
# Role: 提示词架构师（Prompt Architect V4.2）

## 0. 初始化与身份锁定
- 时间锚点：{Current_Date}
- 你是“Prompt Architect V4.2”，不是通用聊天助手，不降级为普通提示词优化器。

## 2. 核心目标
你的唯一职责是：根据用户任务，自动路由到三条互斥路径之一（A 硬逻辑 / B 软感官 / C 多维系统），并交付唯一、结构化、可直接使用的高质量 Prompt 体系，而不是退化为通用提示词优化建议。

## 3. MVE
原始任务明确围绕“1个最小验证实验”展开，核心目标不是泛化建议。
`)

  assert.doesNotMatch(anchor.goal, /^#|Role:|## 0|初始化与身份锁定/)
  assert.match(anchor.goal, /最小验证实验|互斥路径|Prompt 体系/)
  assert.match(anchor.deliverable, /Prompt 体系|可直接使用/)
  assert.doesNotMatch(anchor.deliverable, /做法指导|食材|料理/)
})

test('deriveGoalAnchor keeps structured prompt-optimizer packs out of the write-or-cook fallback paths', () => {
  const anchor = deriveGoalAnchor(`
# Prompt Optimizer（提示词优化）稳定目标锚点

## 1. 任务定义
将“提示词优化”严格视为工程审计流程，不得降级为泛化的优化建议或普通改写建议。

## 4. 策略总则
所有任务最终只能交付一个最终版本，不得并列多个候选 Prompt。

## 5. 核心原则
输出必须能直接落地，而不是停留在原则建议。
`)

  assert.doesNotMatch(anchor.goal, /^#|## 1|语言规则/)
  assert.match(anchor.goal, /提示词优化|工程审计流程/)
  assert.match(anchor.deliverable, /最终版本|Prompt|直接落地/)
  assert.doesNotMatch(anchor.deliverable, /做法指导|用于后的完整提示词/)
  assert.equal(anchor.driftGuard.some((item) => /泛化|最终版本|提示词/.test(item)), true)
})

test('deriveGoalAnchor keeps review-style prompt optimization tasks specific', () => {
  const anchor = deriveGoalAnchor('请评审并优化这条提示词：让 AI 帮我写团队周报，但现在输出太空泛、不具体。')

  assert.match(anchor.goal, /评审并优化/)
  assert.match(anchor.deliverable, /改进版提示词/)
  assert.match(anchor.deliverable, /周报/)
  assert.equal(anchor.driftGuard.some((item) => /评审并优化提示词/.test(item)), true)
  assert.equal(anchor.driftGuard.some((item) => /空泛|不具体|痛点/.test(item)), true)
})

test('normalizeGoalAnchor trims fields and drops empty drift guards', () => {
  const anchor = normalizeGoalAnchor({
    goal: '  保持原任务目标  ',
    deliverable: '  输出结构化结果  ',
    driftGuard: ['  不要改成泛化建议  ', '   ', '不要删掉关键输出'],
  })

  assert.deepEqual(anchor, {
    goal: '保持原任务目标',
    deliverable: '输出结构化结果',
    driftGuard: ['不要改成泛化建议', '不要删掉关键输出'],
  })
})

test('serializeGoalAnchor and parseGoalAnchor round-trip safely', () => {
  const original = {
    goal: '保持原始分诊目标',
    deliverable: '输出结构化分诊结果',
    driftGuard: ['不要退化成泛化科普', '不要移除风险判断'],
  }

  const parsed = parseGoalAnchor(serializeGoalAnchor(original))
  assert.deepEqual(parsed, original)
})
