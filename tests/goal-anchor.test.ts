import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeGoalAnchorPrompt,
  deriveGoalAnchor,
  isMalformedGoalAnchorForPrompt,
  normalizeGoalAnchor,
  parseGoalAnchor,
  serializeGoalAnchor,
} from '../src/lib/server/goal-anchor'

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

test('deriveGoalAnchor does not mistake Chinese prompt-writing requests for cooking help', () => {
  const rawPrompt = '做一个英雄联盟中单训练提示词，帮助我战胜Faker，要求包含练习计划、复盘方法和心理建设。'

  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const anchor = deriveGoalAnchor(rawPrompt)

  assert.notEqual(analysis.kind, 'cooking_help')
  assert.match(anchor.goal, /Faker|英雄联盟|中单|训练提示词/u)
  assert.match(anchor.deliverable, /提示词|练习计划|复盘/u)
  assert.doesNotMatch(anchor.deliverable, /做法指导|食材|料理/u)
  assert.equal(anchor.driftGuard.some((item) => /做菜|料理|食材/u.test(item)), false)
})

test('deriveGoalAnchor does not mistake make-a-template phrasing for cooking help', () => {
  const rawPrompt = '做一个帮助我记录宝宝喂养和睡眠节奏并生成每周总结的模板。'

  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const anchor = deriveGoalAnchor(rawPrompt)

  assert.notEqual(analysis.kind, 'cooking_help')
  assert.match(anchor.goal, /喂养|睡眠|每周总结/u)
  assert.doesNotMatch(anchor.deliverable, /做法指导|食材|料理/u)
})

test('deriveGoalAnchor does not mistake "make the smallest reasonable assumption" for cooking help', () => {
  const rawPrompt = `
Respond as exactly one specific League of Legends champion. Speak in first person, stay in character, and coach me on how to maximize my chances of beating Faker in League of Legends.

Champion and role resolution:
- If my request is ambiguous, make the smallest reasonable assumption in one short clause and proceed. Do not ask follow-up questions unless the instructions directly conflict.

Cover these sections:
- Why this champion's mindset and toolkit can challenge Faker
- Pre-game setup
- Early game
- Mid game
- Recovery plan if I fall behind
`

  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const anchor = deriveGoalAnchor(rawPrompt)

  assert.notEqual(analysis.kind, 'cooking_help')
  assert.notEqual(analysis.topic, 'the smallest reasonabl')
  assert.match(anchor.goal, /Faker|League of Legends|champion/i)
  assert.doesNotMatch(anchor.deliverable, /做法指导|食材|料理/)
  assert.equal(anchor.driftGuard.some((item) => /做菜|料理|食材/.test(item)), false)
})

test('deriveGoalAnchor still recognizes English cooking prompts with food context', () => {
  const rawPrompt = 'Help me make a simple pasta dinner with a short ingredient list.'

  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const anchor = deriveGoalAnchor(rawPrompt)

  assert.equal(analysis.kind, 'cooking_help')
  assert.match(anchor.goal, /pasta dinner/i)
  assert.match(anchor.deliverable, /做法指导|食材/)
  assert.equal(anchor.driftGuard.some((item) => /做菜|食材|料理/.test(item)), true)
})

test('deriveGoalAnchor keeps persona coaching prompts specific instead of collapsing into a generic fallback', () => {
  const rawPrompt = `
Respond as exactly one specific League of Legends champion. Speak in first person, stay in character, and coach me on how to maximize my chances of beating Faker in League of Legends.

Cover these sections:
- Pre-game setup
- Early game plan
- How to deny Faker's strengths
- Mid game plan
- Recovery plan if I fall behind
`

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.goal, /Faker|League of Legends|champion/i)
  assert.doesNotMatch(anchor.deliverable, /与原任务一致的完整结果/)
  assert.match(anchor.deliverable, /指导|方案|coach|Faker|Pre-game|Early game/i)
  assert.equal(anchor.driftGuard.some((item) => /角色|第一人称|Faker|Pre-game|Early game|Recovery/i.test(item)), true)
})

test('deriveGoalAnchor uses explicit sections to keep planning prompts specific', () => {
  const rawPrompt = `
Help me build a study plan to pass the AWS Solutions Architect Associate exam without burning out.

Cover these sections:
- weekly schedule
- priority topics
- hands-on labs
- practice tests
- fallback plan if I fall behind
`

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.goal, /study plan|AWS Solutions Architect/i)
  assert.doesNotMatch(anchor.deliverable, /与原任务一致的完整结果/)
  assert.match(anchor.deliverable, /study plan|weekly schedule|practice tests|fallback/i)
  assert.equal(anchor.driftGuard.some((item) => /weekly schedule|practice tests|fallback|study plan/i.test(item)), true)
})

test('deriveGoalAnchor treats role-prefixed prompt-writing requests as prompt artifacts instead of assistant setup', () => {
  const rawPrompt = '你是一个中文行程规划助手。帮我为周末杭州两日游写一份可直接执行的行程提示词。'

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.goal, /杭州|两日游|行程提示词/)
  assert.doesNotMatch(anchor.deliverable, /助手设定/)
  assert.match(anchor.deliverable, /提示词|可直接复制|可直接使用/)
  assert.equal(anchor.driftGuard.some((item) => /提示词|行程/.test(item)), true)
})

test('deriveGoalAnchor captures explicit task deliverables from role-task prompts', () => {
  const rawPrompt = '你是一个家庭聚餐策划助手。根据人数、预算和忌口，给出菜单建议、采购清单和时间安排。'

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.goal, /家庭聚餐|菜单|采购清单|时间安排/u)
  assert.match(anchor.deliverable, /菜单建议|采购清单|时间安排/u)
  assert.doesNotMatch(anchor.deliverable, /助手设定/u)
  assert.equal(anchor.driftGuard.some((item) => /菜单|采购|时间安排/u.test(item)), true)
})

test('deriveGoalAnchor captures arrange-style deliverables from role-task prompts', () => {
  const rawPrompt = '你是一个家庭聚餐策划助手。根据人数、预算和忌口，安排菜单、采购清单和时间安排。'

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.goal, /家庭聚餐|菜单|采购清单|时间安排/u)
  assert.match(anchor.deliverable, /菜单|采购清单|时间安排/u)
  assert.doesNotMatch(anchor.deliverable, /助手设定/u)
})

test('deriveGoalAnchor normalizes inline numbered output lists instead of collapsing into truncated output shells', () => {
  const rawPrompt = '你是一个家庭聚餐策划助手。根据人数、预算和忌口，输出：1）菜单建议 2）采购清单 3）两小时准备时间线 4）失败补救方案。'

  const anchor = deriveGoalAnchor(rawPrompt)

  assert.match(anchor.deliverable, /菜单建议|采购清单|两小时准备时间线|失败补救方案/u)
  assert.doesNotMatch(anchor.deliverable, /可直接使用的：\s*1）/u)
  assert.doesNotMatch(anchor.deliverable, /两小时准备时内容/u)
  assert.equal(anchor.driftGuard.some((item) => /菜单建议|采购清单|时间线|失败补救/u.test(item)), true)
})

test('deriveGoalAnchor keeps role prompts specific instead of falling back to a generic deliverable', () => {
  const anchor = deriveGoalAnchor('作为最顶级的中医，结合问诊和图片分析症状，给出诊断建议，并在需要时继续向用户提问。')

  assert.match(anchor.goal, /中医/)
  assert.match(anchor.deliverable, /诊断建议|问诊|图片|助手设定/)
  assert.doesNotMatch(anchor.deliverable, /主要输出产物与完成目标/)
  assert.equal(anchor.driftGuard.some((item) => /中医|问诊|图片|角色/.test(item)), true)
})

test('deriveGoalAnchor treats bare persona seeds as role prompts instead of generic fallback tasks', () => {
  const anchor = deriveGoalAnchor('发火狂人。一个随时随地生气愤发火的角色')

  assert.match(anchor.goal, /发火狂人|生气愤发火/)
  assert.doesNotMatch(anchor.deliverable, /与原任务一致的完整结果/)
  assert.match(anchor.deliverable, /角色提示词|角色设定|角色扮演/)
  assert.equal(anchor.driftGuard.some((item) => /角色|人设|发火狂人|火气/.test(item)), true)
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

test('deriveGoalAnchor uses current prompt-optimizer task wording instead of legacy review mode phrasing', () => {
  const anchor = deriveGoalAnchor('请评审并优化这条提示词：Prompt Optimizer（提示词优化），要求保持工程审计流程，不要退化成泛泛建议。')

  assert.doesNotMatch(anchor.goal, /Review 模式/u)
  assert.doesNotMatch(anchor.deliverable, /Review 模式/u)
  assert.equal(anchor.driftGuard.some((item) => /Review 模式/u.test(item)), false)
  assert.match(anchor.goal, /提示词评分与优化任务|提示词优化/u)
})

test('deriveGoalAnchor does not mistake role identity and fixed output headings for the actual goal', () => {
  const anchor = deriveGoalAnchor(`
你是初九。

你是老爷的私人管家，同时也是最擅长“把困难事情拆到能做”为止的拆解官。

【你的核心使命】
当老爷面对一个任务时，你要负责：
1. 看清这个任务为什么难
2. 找出真正的卡点
3. 去掉伪复杂度
4. 把任务拆到“现在就能做”

【标准输出格式】
1. 目标是什么
2. 真正卡点是什么
3. 这件事应该怎么拆
4. 现在第一步做什么
5. 今天做到哪算合格
6. 下一步会自然接什么

【最终目标】
你要让老爷面对任何复杂任务时，不再只有压力，而是总能看到一条可以立刻开始的路。
`)

  assert.doesNotMatch(anchor.goal, /^你是初九。?$/)
  assert.match(anchor.goal, /拆|推进|开始/)
  assert.doesNotMatch(anchor.deliverable, /格式|目标是什么|真正卡点是什么/)
  assert.match(anchor.deliverable, /可执行|拆解|行动/)
})

test('deriveGoalAnchor keeps 初九总参谋 anchors human-readable instead of collapsing into role-shell boilerplate', () => {
  const rawPrompt = `
你是初九。

你不是一个只会列待办的助手。你是老爷的总参谋型管家。

你的核心职责，不是机械执行命令，而是站在“帮助老爷赢得现实局面”的角度，持续承担以下责任：

1. 识别老爷当前最重要的真实目标
2. 看清局势，而不是只看表面任务
3. 帮老爷做优先级取舍
4. 在混乱、焦虑、分散、拖延、冲动中，重新收束主线
5. 把大问题拆成可以推进的小动作

【标准输出格式】
1. 当前局势判断
2. 真正主线
3. 当前最大阻塞
4. 现在最该做的事
5. 明确不该做的事
6. 下一步最小动作
`

  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const anchor = deriveGoalAnchor(rawPrompt)

  assert.notEqual(analysis.kind, 'generate')
  assert.doesNotMatch(analysis.focus, /输出原则|先给结|只会列待办/u)
  assert.equal(isMalformedGoalAnchorForPrompt(rawPrompt, anchor), false)
  assert.doesNotMatch(anchor.goal, /^围绕你是初九/u)
  assert.doesNotMatch(anchor.goal, /^围绕.+提供可执行指导。?$/u)
  assert.doesNotMatch(anchor.goal, /…/)
  assert.match(anchor.goal, /赢得现实局面|收束主线|优先级|推进/u)
  assert.match(anchor.deliverable, /当前局势判断|真正主线|当前最大阻塞|现在最该做的事/u)
  assert.doesNotMatch(anchor.deliverable, /^一份围绕.+可执行指南/u)
  assert.doesNotMatch(anchor.deliverable, /角色与原任务要求的可执行助手设定/u)
})

test('isMalformedGoalAnchorForPrompt rejects generic directive shells for rich role-coaching prompts', () => {
  const rawPrompt = `
你是初九。

你的核心职责，不是机械执行命令，而是站在“帮助老爷赢得现实局面”的角度，持续承担以下责任：
1. 识别老爷当前最重要的真实目标
2. 看清局势，而不是只看表面任务
3. 帮老爷做优先级取舍
4. 在混乱中重新收束主线

【标准输出格式】
1. 当前局势判断
2. 真正主线
3. 当前最大阻塞
4. 现在最该做的事
`

  assert.equal(isMalformedGoalAnchorForPrompt(rawPrompt, {
    goal: '围绕帮老爷做优先级取舍提供可执行指导。',
    deliverable: '一份围绕帮老爷做优先级取舍的可执行指南，覆盖当前局势判断、真正主线、当前最大阻塞与现在最该做的事。',
    driftGuard: ['不要把任务改写成更泛化的问题，仍要围绕帮老爷做优先级取舍展开。'],
  }), true)
})

test('isMalformedGoalAnchorForPrompt rejects anchors that collapse into default-output numbering fragments', () => {
  const rawPrompt = `
你是初九。

你的职责不是空谈计划，而是先判断老爷真正要解决的问题，再拆出最小可执行动作。

默认输出：
1. 当前局势判断
2. 真正主线
3. 当前最大阻塞
4. 现在最该做的事
5. 明确不该做的事
6. 下一步最小动作
`

  assert.equal(isMalformedGoalAnchorForPrompt(rawPrompt, {
    goal: '你是初九。你的职责不是空谈计划，而是先判断老爷真正要解决的问题，再拆出最小可执行动作。默认输出：1.',
    deliverable: '可直接使用的：1内容。',
    driftGuard: ['不要偏离格式。'],
  }), true)
})

test('isMalformedGoalAnchorForPrompt rejects truncated inline numbered deliverables too', () => {
  const rawPrompt = '你是一个家庭聚餐策划助手。根据人数、预算和忌口，输出：1）菜单建议 2）采购清单 3）两小时准备时间线 4）失败补救方案。'

  assert.equal(isMalformedGoalAnchorForPrompt(rawPrompt, {
    goal: '根据人数、预算和忌口输出家庭聚餐方案。',
    deliverable: '可直接使用的：1）菜单建议 2）采购清单 3）两小时准备时内容。',
    driftGuard: ['不要改成其他主题。'],
  }), true)
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
