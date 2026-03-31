import assert from 'node:assert/strict'
import test from 'node:test'

import { CpamcModelAdapter, normalizeTextArray } from '../src/lib/server/model-adapter'

const WEIGHTED_RUBRIC_MD = [
  '# Prompt Quality Rubric (0-100)',
  '',
  '## Scoring Dimensions',
  '',
  '1. 目标清晰度（15）',
  '2. 输入约束完整度（10）',
  '3. 输出契约明确度（15）',
  '4. 逻辑闭环（15）',
  '5. 可执行性（10）',
  '6. 鲁棒性（10）',
  '7. 防幻觉与证据约束（10）',
  '8. 反死胡同能力（10）',
  '9. 可迭代性（5）',
].join('\n')

const DEFAULT_COMPATIBLE_CUSTOM_RUBRIC_MD = [
  '# 单任务评分标准',
  '',
  '以下文本只是换了标题，但分项结构与默认 rubric 完全同构。',
  '',
  '1. 目标清晰度（15）',
  '2. 输入约束完整度（10）',
  '3. 输出契约明确度（15）',
  '4. 逻辑闭环（15）',
  '5. 可执行性（10）',
  '6. 鲁棒性（10）',
  '7. 防幻觉与证据约束（10）',
  '8. 反死胡同能力（10）',
  '9. 可迭代性（5）',
].join('\n')

const CUSTOM_TEN_BY_TEN_RUBRIC_MD = [
  '# 单任务评分标准',
  '',
  '1. 场景保真（10）',
  '2. 输入采集（10）',
  '3. 输出结构（10）',
  '4. 决策规则（10）',
  '5. 时间规划（10）',
  '6. 预算控制（10）',
  '7. 异常处理（10）',
  '8. 风险提示（10）',
  '9. 可执行性（10）',
  '10. 复盘接口（10）',
].join('\n')

const CUSTOM_FIVE_BY_TWENTY_RUBRIC_MD = [
  '# 单任务评分标准',
  '',
  '1. 目标与场景保真（20）',
  '2. 输入约束覆盖（20）',
  '3. 输出结构与交付物（20）',
  '4. 决策规则与优先级（20）',
  '5. 异常处理与可执行性（20）',
].join('\n')

const RICH_CANDIDATE_PROMPT = [
  '你是周末家庭聚餐方案总控。',
  '输入前先确认人数、预算、老人小孩、忌口、厨房设备、可用时长和采购便利度。',
  '如果人数、预算、忌口或设备存在冲突，必须先写明冲突，再给一个最稳的降级方案。',
  '输出固定为菜单、采购、时间线、上菜顺序、失败补救五部分，并要求五部分彼此一致。',
  '菜单必须解释取舍逻辑；时间线必须覆盖提前准备、烹饪顺序和桌面收口；失败补救至少给 3 条。',
  '输出前自检预算是否匹配、忌口是否被违反、设备与时间是否可落地。',
].join('\\n')

function buildDimensionReasons(overrides: Partial<Record<'d1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8' | 'd9', string>> = {}) {
  return {
    d1: '目标已经说明，但成功标准还不够硬。',
    d2: '输入变量与边界条件仍有缺口。',
    d3: '输出结构基本存在，但可判定标准还不够细。',
    d4: '分析到交付的闭环还不够完整。',
    d5: '可以执行，但还缺几个关键操作规则。',
    d6: '对异常或冲突场景的处理偏弱。',
    d7: '证据边界与防幻觉约束还可以更硬。',
    d8: '缺少更明确的回退或改道机制。',
    d9: '可继续迭代，但还没有形成稳定增量接口。',
    ...overrides,
  }
}

function buildCustomDimensionReasons(
  entries: Array<{ id: string; reason: string }>,
) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry.reason]))
}

test('adapter uses optimizer and judge models independently', async () => {
  const requestedModels: string[] = []
  const requestedBodies: Array<Record<string, unknown>> = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model: string }
    requestedModels.push(body.model)
    requestedBodies.push(body as Record<string, unknown>)
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestedModels.length === 1
                ? {
                    optimizedPrompt: 'better prompt',
                    strategy: 'rebuild',
                    scoreBefore: 60,
                    majorChanges: ['more constraints'],
                    mve: 'single run',
                    deadEndSignals: ['vague output'],
                  }
                : {
                    score: 97,
                    hasMaterialIssues: false,
                    summary: 'ready',
                    findings: [],
                    suggestedChanges: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })
  await adapter.judgePrompt('candidate', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.deepEqual(requestedModels, ['gpt-5.2', 'gemini-3.1-pro'])
  const optimizerBody = requestedBodies[0] as { messages?: Array<{ role?: string; content?: string }> }
  const optimizerSystem = optimizerBody.messages?.[0]?.content ?? ''
  const optimizerUser = optimizerBody.messages?.[1]?.content ?? ''
  assert.doesNotMatch(optimizerSystem, /rubric/i)
  assert.doesNotMatch(optimizerUser, /Threshold:/)
  assert.doesNotMatch(optimizerUser, /previous round/i)
  assert.match(optimizerUser, /<<<BEGIN CURRENT PROMPT>>>/)
  assert.match(optimizerUser, /<<<END CURRENT PROMPT>>>/)
})

test('normalizeTextArray extracts useful text from object items', () => {
  const result = normalizeTextArray([
    'plain text',
    { issue: 'issue text' },
    { text: 'text field' },
    { nested: { a: 1 } },
  ])

  assert.deepEqual(result, [
    'plain text',
    'issue text',
    'text field',
    '{"nested":{"a":1}}',
  ])
})


test('adapter coerces invalid numeric scores to safe fallbacks instead of propagating NaN', async () => {
  let callCount = 0

  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    optimizedPrompt: 'better prompt',
                    strategy: 'rebuild',
                    scoreBefore: 'not-a-number',
                    majorChanges: ['more constraints'],
                    mve: 'single run',
                    deadEndSignals: ['vague output'],
                  }
                : {
                    score: 'not-a-number',
                    hasMaterialIssues: false,
                    summary: 'ready',
                    findings: [],
                    suggestedChanges: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })
  const review = await adapter.judgePrompt('candidate', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(optimization.scoreBefore, 0)
  assert.equal(review.score, 0)
})

test('adapter recomputes the score locally from rubric dimension scores without changing summaries', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 99,
            dimensionScores: {
              d1: 12,
              d2: 7,
              d3: 11,
              d4: 10,
              d5: 8,
              d6: 7,
              d7: 6,
              d8: 5,
              d9: 4,
            },
            dimensionReasons: buildDimensionReasons({
              d1: '目标与成功标准已经比较清楚。',
              d2: '输入约束还缺几个硬边界。',
              d3: '输出契约还可以更可判定。',
              d4: '流程闭环基本成立，但收口不够硬。',
              d5: '能执行，但仍有细节欠账。',
              d6: '异常处理还不够完整。',
              d7: '证据边界偏弱。',
              d8: '回退机制比较薄。',
              d9: '迭代性不错。',
            }),
            hasMaterialIssues: false,
            summary: '这条摘要应该原样保留。',
            driftLabels: [],
            driftExplanation: '',
            findings: ['这里的发现也应该保留。'],
            suggestedChanges: ['这里的建议也应该保留。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('请给出一个包含预算、菜单和时间安排的家庭聚餐方案。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 70)
  assert.equal(review.summary, '这条摘要应该原样保留。')
  assert.deepEqual(review.findings, ['这里的发现也应该保留。'])
  assert.deepEqual(review.suggestedChanges, ['这里的建议也应该保留。'])
})

test('adapter sends a strict schema-repair prompt after a legacy judge response and accepts the repaired structured review', async () => {
  const requestBodies: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    score: 88,
                    passed: false,
                    summary: '旧 schema 还在按 matched/missing_or_weak 这套格式返回。',
                    matched: ['主题仍然一致。'],
                    missing_or_weak: ['没有给出结构化 rubric 分项。'],
                    improved_prompt: 'legacy rewrite',
                  }
                : {
                    score: 75,
                    dimensionScores: {
                      d1: 10,
                      d2: 6,
                      d3: 10,
                      d4: 9,
                      d5: 8,
                      d6: 7,
                      d7: 7,
                      d8: 8,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '主题保持清楚。',
                      d2: '输入约束还不够完整。',
                      d3: '输出契约基本明确。',
                      d4: '逻辑闭环还有缺口。',
                      d5: '执行性尚可。',
                      d6: '异常处理仍偏弱。',
                      d7: '证据边界需要继续加强。',
                      d8: '反死胡同能力中等。',
                      d9: '仍有继续迭代空间。',
                    }),
                    hasMaterialIssues: true,
                    summary: '修复后的结构化评分已返回。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['还缺一个预算冲突分支。'],
                    suggestedChanges: ['补一条预算不足时的收缩规则。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('请帮我写一个周末家庭聚餐策划提示词，输出菜单建议、采购清单、时间安排和预算备选。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[1] ?? '', /不要新增字段|Do not add fields/)
  assert.match(requestBodies[1] ?? '', /d1<=15/)
  assert.match(requestBodies[1] ?? '', /deliverable_missing/)
  assert.match(requestBodies[1] ?? '', /\\"dimensionScores\\": \{\\"d1\\": 0/)
  assert.equal(review.score, 69)
  assert.equal(review.summary, '修复后的结构化评分已返回。')
  assert.deepEqual(review.findings, ['还缺一个预算冲突分支。'])
  assert.deepEqual(review.suggestedChanges, ['补一条预算不足时的收缩规则。'])
})

test('adapter strips obvious wrapper leakage from optimized prompts before returning them', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            optimizedPrompt: [
              'Return only JSON.',
              'Threshold: 95',
              'Non-negotiable goal anchor:',
              'Goal: Keep the original task.',
              '',
              '真正的优化后提示词',
            ].join('\n'),
            strategy: 'rebuild',
            scoreBefore: 72,
            majorChanges: ['tightened the contract'],
            mve: 'single run',
            deadEndSignals: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: '原始提示词',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })

  assert.equal(optimization.optimizedPrompt, '真正的优化后提示词')
})

test('adapter retries once with a stronger material-revision ask when a thin prompt comes back equivalent', async () => {
  const requestBodies: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    optimizedPrompt: '你是一个家庭聚餐策划助手。根据人数、预算和忌口，给出菜单、采购清单和时间安排。',
                    strategy: 'preserve',
                    scoreBefore: 72,
                    majorChanges: [],
                    mve: 'single run',
                    deadEndSignals: [],
                  }
                : {
                    optimizedPrompt: '你是一个家庭聚餐策划助手。根据用户提供的人数、预算和忌口，输出一份可直接执行的家庭聚餐方案，并明确菜单、采购清单和时间安排。',
                    strategy: 'rebuild',
                    scoreBefore: 72,
                    majorChanges: ['补上了决策优先级和异常处理。'],
                    mve: 'single run',
                    deadEndSignals: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: '你是一个家庭聚餐策划助手。根据人数、预算和忌口，给出菜单、采购清单和时间安排。',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[1] ?? '', /等价的结果|实质修订|material revision/i)
  assert.match(optimization.optimizedPrompt, /可直接执行的家庭聚餐方案/u)
  assert.deepEqual(optimization.majorChanges, ['补上了决策优先级和异常处理。'])
})

test('adapter also retries once when a mid-depth structured prompt comes back equivalent too early', async () => {
  const requestBodies: string[] = []
  const currentPrompt = [
    '你是一个家庭聚餐策划助手。你的任务是根据用户提供的人数、预算和忌口，产出一份可直接执行的家庭聚餐方案。',
    '',
    '工作规则：',
    '1. 优先级：食品安全与硬性忌口 > 人数吃饱吃好 > 预算控制 > 营养均衡 > 菜式丰富度 > 操作复杂度。',
    '2. 约束理解：预算默认指整场家庭聚餐总预算；若用户给的是人均预算，先换算为总预算并说明。',
    '3. 忌口中，过敏、宗教禁忌、纯素/蛋奶素等视为硬约束，绝不违反；少辣、少油、清淡等视为强偏好，尽量满足。',
    '4. 菜单选择逻辑：按人数控制菜量，默认成人家常聚餐 2-3 人给 3-4 道菜，4-6 人给 5-6 道菜，7-10 人给 7-9 道菜；人数更多时按每增加 2-3 人加 1-2 道菜。',
    '5. 菜单尽量包含：1 个凉菜或前菜、2-4 个热菜、1 个主食、1 个汤；预算有限时可适当精简，但仍要保证吃饱和基本均衡。',
    '6. 优先选择家常、易采购、适合多人分享的菜，避免明显超预算、耗时过长或与忌口冲突的食材。',
    '7. 预算紧张时，先保证主食、蛋白质和蔬菜的平衡，再减少高成本菜品和复杂菜品。',
    '8. 信息不足时：若缺少人数、预算、忌口中的任一关键项，先用一句话简洁询问；若用户希望直接出方案，基于明确假设继续，并在开头写明假设条件。',
    '9. 约束冲突时：如果预算明显无法覆盖人数或忌口要求，先指出冲突，再给出严控预算版与放宽预算版两个可执行方案。',
    '',
    '输出要求：必须输出菜单、采购清单和时间安排三部分，并保持三部分一致。',
    '- 菜单：列出每道菜名称、选择理由、推荐份量或核心食材，可补充 1-2 道替换菜。',
    '- 采购清单：按类别列出蔬菜类、肉蛋/海鲜/豆制品类、主食类、调味料/配料类、饮品/水果类，并尽量给出数量或件数。',
    '- 时间安排：按采购、提前处理、烹饪顺序、上桌顺序给出节点，并考虑家庭厨房现实操作。',
    '',
    '完成标准与自检：',
    '- 菜单不能违反忌口。',
    '- 采购清单要覆盖菜单的关键食材。',
    '- 份量要与人数基本匹配，不明显过多或过少。',
    '- 预算估算与菜单规模一致。',
    '- 时间安排要能落地执行。',
  ].join('\n')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    optimizedPrompt: currentPrompt,
                    strategy: 'preserve',
                    scoreBefore: 96,
                    majorChanges: [],
                    mve: 'single run',
                    deadEndSignals: [],
                  }
                : {
                    optimizedPrompt: `${currentPrompt}\\n- 若预算明显不足，补一个严控预算版与一个放宽预算版。\\n- 在菜单里补每道菜的推荐份量或菜数映射。`,
                    strategy: 'preserve',
                    scoreBefore: 96,
                    majorChanges: ['补上预算冲突分支和更具体的份量映射。'],
                    mve: 'single run',
                    deadEndSignals: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt,
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[1] ?? '', /不要停在表面完整|surface completeness|执行细节|decision detail/i)
  assert.match(optimization.optimizedPrompt, /预算明显不足/u)
  assert.deepEqual(optimization.majorChanges, ['补上预算冲突分支和更具体的份量映射。'])
})

test('adapter retries equivalent optimizer output when same-round review guidance still points to missing gaps', async () => {
  const requestBodies: string[] = []
  const currentPrompt = [
    '你是初九。',
    '你的职责是作为总参谋，先识别老爷当前真实目标、时间预算、情绪状态与现实约束，再判断真正主线并给出最小推进动作。',
    '当多个目标冲突时，按现实推进 > 资源效率 > 情绪安抚的顺序取舍，并说明理由。',
    '默认按以下结构输出：1. 当前局势判断 2. 真正主线 3. 当前最大阻塞 4. 现在最该做的事 5. 明确不该做的事 6. 下一步最小动作。',
  ].join('\n')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    optimizedPrompt: currentPrompt,
                    strategy: 'preserve',
                    scoreBefore: 94,
                    majorChanges: [],
                    mve: 'single run',
                    deadEndSignals: [],
                  }
                : {
                    optimizedPrompt: `${currentPrompt}\n输出前自检：是否守住主线、是否处理冲突、是否给出可验证推进标准。`,
                    strategy: 'preserve',
                    scoreBefore: 94,
                    majorChanges: ['补上一条输出前自检，避免只靠整体感觉通过。'],
                    mve: 'single run',
                    deadEndSignals: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt,
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    reviewFeedbackItems: ['明确输出前的自检点，或给出可以判定是否合格的完成标准。'],
  })

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[0] ?? '', /明确输出前的自检点/)
  assert.match(requestBodies[1] ?? '', /实质修订|material revision|不要再次原样返回/i)
  assert.match(optimization.optimizedPrompt, /输出前自检/u)
})

test('adapter falls back to Chinese change diagnostics when optimizer returns English bullets for a Chinese prompt', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            optimizedPrompt: '真正的新提示词',
            strategy: 'rebuild',
            scoreBefore: 72,
            majorChanges: ['Tighten the decision rules.', 'Add stronger constraints.'],
            mve: 'Run one quick validation pass.',
            deadEndSignals: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: '这是一个中文提示词，需要继续优化结构和执行细节。',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })

  assert.deepEqual(optimization.majorChanges, [
    '本轮已生成新版本，但模型返回了异语言改动摘要；请以上方新版本正文为准。',
  ])
  assert.equal(optimization.mve, '先做一轮最小验证。')
})

test('adapter synthesizes a localized review summary when judge returns English prose for a Chinese prompt', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 88,
            hasMaterialIssues: true,
            summary: 'Needs more task-specific decision rules.',
            driftLabels: ['constraint_loss'],
            driftExplanation: 'The prompt is still too generic.',
            findings: ['Add concrete exception handling.'],
            suggestedChanges: ['Clarify the output contract.'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('这是中文候选提示词。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.summary, '本轮诊断已完成，但模型返回了异语言摘要。')
  assert.equal(review.driftExplanation, '')
  assert.deepEqual(review.findings, [
    '已检测到偏题或约束丢失信号，高分与“无实质问题”结论不能同时成立。',
  ])
  assert.deepEqual(review.suggestedChanges, [
    '先修正偏离目标或遗漏约束的部分，再重新评估整体质量。',
  ])
})

test('adapter marks summary-only language mismatches as explicit fallback summaries instead of synthesizing a trusted pass', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 98,
            hasMaterialIssues: false,
            summary: 'This prompt is already excellent and production-ready.',
            driftLabels: [],
            driftExplanation: '',
            findings: [],
            suggestedChanges: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const richPrompt = [
    '你是一个家庭聚餐策划助手。',
    '',
    '任务：根据人数、预算和忌口输出菜单、采购清单和时间安排。',
    '',
    '处理规则：',
    '1. 优先级：食品安全与忌口 > 预算不超支 > 人数吃饱 > 家庭厨房可执行。',
    '2. 若缺少人数、预算或忌口，先补问；若用户不补充，则明确默认假设后继续。',
    '3. 若预算冲突，先给预算内基础版，再说明升级项。',
    '',
    '输出要求：',
    '一、菜单',
    '二、采购清单',
    '三、时间安排',
    '',
    '自检：',
    '- 三部分齐全',
    '- 不含忌口食材',
    '- 总价不超预算',
  ].join('\\n')

  const review = await adapter.judgePrompt(richPrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.summary, '本轮诊断已完成，但模型返回了异语言摘要。')
  assert.deepEqual(review.findings, [])
  assert.deepEqual(review.suggestedChanges, [])
})

test('adapter marks empty judge summaries as explicit non-credible fallbacks instead of lazy high-score prose', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 98,
            hasMaterialIssues: false,
            summary: '',
            driftLabels: [],
            driftExplanation: '',
            findings: [],
            suggestedChanges: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const richPrompt = [
    '你是初九。',
    '你的职责是作为总参谋，先识别老爷当前真实目标、时间预算、情绪状态与现实约束，再判断真正主线并给出最小推进动作。',
    '当多个目标冲突时，按现实推进 > 资源效率 > 情绪安抚的顺序取舍，并说明理由。',
    '如果信息不足，先列出缺口，再给出不阻塞推进的暂行判断；如果存在明显风险，先阻止高代价动作。',
    '默认按以下结构输出：1. 当前局势判断 2. 真正主线 3. 当前最大阻塞 4. 现在最该做的事 5. 明确不该做的事 6. 下一步最小动作。',
    '输出前自检：是否守住主线、是否给出可执行动作、是否处理了冲突和不确定性。',
  ].join('\n')

  const review = await adapter.judgePrompt(richPrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.summary, '本轮诊断已完成，但评分摘要字段无效；请以下方问题列表或运行信息为准。')
})

test('adapter uses rubric dimension totals for thin prompts instead of trusting vibe scores', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 100,
            dimensionScores: {
              d1: 7,
              d2: 2,
              d3: 6,
              d4: 4,
              d5: 5,
              d6: 2,
              d7: 2,
              d8: 1,
              d9: 2,
            },
            dimensionReasons: buildDimensionReasons({
              d1: '任务方向清楚，但成功标准还不够硬。',
              d2: '只有人数、预算、忌口这类模糊输入，没有更明确的来源和边界。',
              d3: '菜单、采购清单和时间安排有了，但输出标准仍偏粗。',
              d4: '从分析到交付的闭环还不够完整。',
              d5: '可以直接用，但执行规则偏少。',
              d6: '异常与冲突处理基本缺失。',
              d7: '缺少证据边界和事实约束。',
              d8: '没有回退或改道机制。',
              d9: '还可以继续迭代。',
            }),
            hasMaterialIssues: true,
            summary: '这条提示词只给了任务和几个产出，核心决策规则还远远不够。',
            driftLabels: [],
            driftExplanation: '',
            findings: ['还缺预算冲突时怎么收缩菜单的规则。'],
            suggestedChanges: ['把人数到菜量的映射和预算不足时的回退方案写具体。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('你是一个家庭聚餐策划助手。根据人数、预算和忌口，给出菜单建议、采购清单和时间安排。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 31)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '这条提示词只给了任务和几个产出，核心决策规则还远远不够。')
  assert.deepEqual(review.findings, ['还缺预算冲突时怎么收缩菜单的规则。'])
  assert.deepEqual(review.suggestedChanges, ['把人数到菜量的映射和预算不足时的回退方案写具体。'])
})

test('adapter re-runs an evidence-bound review when a bare request is scored implausibly high', async () => {
  const requestBodies: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    score: 98,
                    dimensionScores: {
                      d1: 14,
                      d2: 10,
                      d3: 14,
                      d4: 14,
                      d5: 9,
                      d6: 9,
                      d7: 9,
                      d8: 9,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标很清楚。',
                      d2: '输入约束已经完整。',
                      d3: '输出契约非常明确。',
                      d4: '逻辑闭环完整。',
                      d5: '可执行性很强。',
                      d6: '鲁棒性很好。',
                      d7: '证据边界充分。',
                      d8: '反死胡同能力很强。',
                      d9: '可迭代性很好。',
                    }),
                    hasMaterialIssues: false,
                    summary: '这条提示词已经接近生产可用。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: [],
                    suggestedChanges: [],
                  }
                : {
                    score: 26,
                    dimensionScores: {
                      d1: 5,
                      d2: 0,
                      d3: 4,
                      d4: 3,
                      d5: 4,
                      d6: 1,
                      d7: 1,
                      d8: 0,
                      d9: 2,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标能看懂，但成功标准并不清楚。',
                      d2: '没有输入变量、边界条件或前提约束。',
                      d3: '只给了一个笼统任务，没有可判定的输出契约。',
                      d4: '从分析到交付的闭环基本缺失。',
                      d5: '能懂大意，但几乎没有执行规则。',
                      d6: '没有异常或冲突处理。',
                      d7: '没有证据边界或事实约束。',
                      d8: '没有回退、重试或改道机制。',
                      d9: '还能继续迭代，但目前太薄。',
                    }),
                    hasMaterialIssues: true,
                    summary: '这条 bare request 太薄，不能因为目标没漂移就给高分。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['缺少输入约束、输出契约和异常处理。'],
                    suggestedChanges: ['先把输入条件、输出结构和失败兜底写具体，再谈高分。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('洗碗大师，教我洗碗技巧', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[1] ?? '', /可疑高分|suspiciously high/i)
  assert.match(requestBodies[1] ?? '', /直接文本证据|direct textual evidence/i)
  assert.equal(review.score, 20)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '这条 bare request 太薄，不能因为目标没漂移就给高分。')
  assert.deepEqual(review.findings, ['缺少输入约束、输出契约和异常处理。'])
  assert.deepEqual(review.suggestedChanges, ['先把输入条件、输出结构和失败兜底写具体，再谈高分。'])
})

test('adapter re-runs an evidence-bound review when a short enumerated request is scored implausibly high', async () => {
  const requestBodies: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    score: 89,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 14,
                      d4: 15,
                      d5: 7,
                      d6: 9,
                      d7: 9,
                      d8: 9,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标清晰。',
                      d2: '输入约束完整。',
                      d3: '输出契约很明确。',
                      d4: '逻辑闭环完整。',
                      d5: '可执行性不错。',
                      d6: '鲁棒性较强。',
                      d7: '证据边界较稳。',
                      d8: '反死胡同能力较强。',
                      d9: '可迭代性很好。',
                    }),
                    hasMaterialIssues: false,
                    summary: '这条提示词已经很稳。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: [],
                    suggestedChanges: [],
                  }
                : {
                    score: 54,
                    dimensionScores: {
                      d1: 10,
                      d2: 5,
                      d3: 8,
                      d4: 6,
                      d5: 6,
                      d6: 5,
                      d7: 4,
                      d8: 4,
                      d9: 2,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '任务目标能看懂，但还没有压到稳定执行层。',
                      d2: '只给了人数、预算、人群与设备方向，输入变量仍偏粗。',
                      d3: '交付物列表清楚，但输出契约还不够细。',
                      d4: '缺少任务特有的取舍规则和一致性闭环。',
                      d5: '能直接用，但仍缺可执行细节。',
                      d6: '对冲突和异常场景的处理不够完整。',
                      d7: '没有明确证据边界或假设披露。',
                      d8: '没有写清无法同时满足条件时如何降级继续前进。',
                      d9: '具备继续迭代空间。',
                    }),
                    hasMaterialIssues: true,
                    summary: '这条请求把交付物列出来了，但输入契约、取舍逻辑和降级规则仍偏薄。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['还缺约束冲突时的降级策略与一致性校验。'],
                    suggestedChanges: ['把预算/设备受限时的取舍规则、假设披露和自检标准写具体。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(
    [
      '你是一个家庭聚餐策划助手。根据人数、预算、老人小孩、忌口和厨房设备，输出：',
      '1）菜单建议',
      '2）采购清单',
      '3）两小时准备时间线',
      '4）失败补救方案',
      '',
      '默认条件：',
      '- 6 人',
      '- 预算 300 元人民币',
      '- 有老人和小孩',
      '- 家常厨房',
      '- 不吃太辣',
      '- 追求好做、稳定、不翻车',
    ].join('\n'),
    0,
    {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  )

  assert.equal(requestBodies.length, 2)
  assert.match(requestBodies[1] ?? '', /直接文本证据|direct textual evidence/i)
  assert.equal(review.score, 50)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '这条请求把交付物列出来了，但输入契约、取舍逻辑和降级规则仍偏薄。')
  assert.deepEqual(review.findings, ['还缺约束冲突时的降级策略与一致性校验。'])
  assert.deepEqual(review.suggestedChanges, ['把预算/设备受限时的取舍规则、假设披露和自检标准写具体。'])
})

test('adapter keeps genuinely rich prompts eligible for high judge scores', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 97,
            hasMaterialIssues: false,
            summary: '候选提示词已经接近生产可用。',
            driftLabels: [],
            driftExplanation: '',
            findings: ['可继续微调语气细节。'],
            suggestedChanges: ['仅需做轻微润色。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const richPrompt = [
    '你是初九。',
    '你的职责是作为总参谋，先识别老爷当前真实目标、时间预算、情绪状态与现实约束，再判断真正主线并给出最小推进动作。',
    '当多个目标冲突时，按现实推进 > 资源效率 > 情绪安抚的顺序取舍，并说明理由。',
    '如果信息不足，先列出缺口，再给出不阻塞推进的暂行判断；如果存在明显风险，先阻止高代价动作。',
    '默认按以下结构输出：1. 当前局势判断 2. 真正主线 3. 当前最大阻塞 4. 现在最该做的事 5. 明确不该做的事 6. 下一步最小动作。',
    '输出前自检：是否守住主线、是否给出可执行动作、是否处理了冲突和不确定性。',
  ].join('\n')

  const review = await adapter.judgePrompt(richPrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 97)
  assert.equal(review.hasMaterialIssues, false)
  assert.equal(review.summary, '候选提示词已经接近生产可用。')
})

test('adapter scores a one-line raw request from dimension totals instead of a fake high raw score', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 96,
            dimensionScores: {
              d1: 5,
              d2: 1,
              d3: 4,
              d4: 2,
              d5: 3,
              d6: 1,
              d7: 0,
              d8: 0,
              d9: 1,
            },
            dimensionReasons: buildDimensionReasons({
              d1: '目标能看懂，但成功标准还没被展开。',
              d2: '输入条件几乎没定义。',
              d3: '只给了几个交付项，没有明确格式标准。',
              d4: '缺少分析到交付的闭环。',
              d5: '还能用，但执行力很弱。',
              d6: '异常处理缺失。',
              d7: '没有证据边界。',
              d8: '没有回退机制。',
              d9: '还具备继续扩写空间。',
            }),
            hasMaterialIssues: true,
            summary: '这版至少明确了要写家庭聚餐策划提示词，以及菜单建议、采购清单、时间安排和预算备选这些产出。',
            driftLabels: [],
            driftExplanation: '',
            findings: ['仍缺输入契约、选择逻辑和失败处理。'],
            suggestedChanges: ['把预算分档、菜量映射和冲突回退写清楚。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('请帮我写一个周末家庭聚餐策划提示词，输出菜单建议、采购清单、时间安排和预算备选。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 17)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '这版至少明确了要写家庭聚餐策划提示词，以及菜单建议、采购清单、时间安排和预算备选这些产出。')
  assert.deepEqual(review.findings, ['仍缺输入契约、选择逻辑和失败处理。'])
  assert.deepEqual(review.suggestedChanges, ['把预算分档、菜量映射和冲突回退写清楚。'])
})

test('top-band recheck timeout marks the review as non-credible instead of parking it at 94', async () => {
  let callCount = 0
  const candidatePrompt = [
    '你是周末家庭聚餐策划助手。',
    '先读取人数、预算、老人小孩、忌口和厨房条件，再输出菜单建议、采购清单、时间安排和预算备选。',
    '如果预算不足，要明确说明删减逻辑；如果信息不全，要先列出缺口，再给一个可执行暂行方案。',
    '输出必须分为：菜单、采购、时间线、预算备选、风险提醒五部分。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1
    if (callCount >= 2) {
      throw new Error('top-band timeout')
    }

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 96,
              dimensionScores: {
                d1: 15,
                d2: 10,
                d3: 15,
                d4: 15,
                d5: 9,
                d6: 9,
                d7: 9,
                d8: 9,
                d9: 5,
              },
              dimensionReasons: buildDimensionReasons({
                d1: '目标和成功标准基本都写清楚了。',
                d2: '输入变量交代完整。',
                d3: '输出契约很明确。',
                d4: '逻辑闭环已经成立。',
                d5: '执行步骤比较扎实。',
                d6: '异常处理相对完整。',
                d7: '证据边界比较硬。',
                d8: '回退机制也有覆盖。',
                d9: '可迭代性已经足够。',
              }),
              hasMaterialIssues: false,
              summary: '该提示词与目标场景基本一致，保留了人数、预算、老人小孩三项关键变量，但仍缺少更稳定的决策细化。',
              driftLabels: [],
              driftExplanation: '',
              findings: ['仍可把预算紧张时的菜单收缩规则写得更明确。'],
              suggestedChanges: ['补足预算不足时的回退分支。'],
            }),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 0)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
  assert.equal(review.dimensionScores, null)
  assert.deepEqual(review.findings, ['仍可把预算紧张时的菜单收缩规则写得更明确。'])
})

test('top-band recheck failure triggers a structured regrade instead of collapsing to 94', async () => {
  let callCount = 0
  const candidatePrompt = [
    '你是周末家庭聚餐策划助手。',
    '先读取人数、预算、老人小孩、忌口和厨房条件，再输出菜单建议、采购清单、时间安排和预算备选。',
    '如果预算不足，要明确说明删减逻辑；如果信息不全，要先列出缺口，再给一个可执行暂行方案。',
    '输出必须分为：菜单、采购、时间线、预算备选、风险提醒五部分。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 96,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 9,
                      d6: 9,
                      d7: 9,
                      d8: 9,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准基本都写清楚了。',
                      d2: '输入变量交代完整。',
                      d3: '输出契约很明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行步骤比较扎实。',
                      d6: '异常处理相对完整。',
                      d7: '证据边界比较硬。',
                      d8: '回退机制也有覆盖。',
                      d9: '可迭代性已经足够。',
                    }),
                    hasMaterialIssues: false,
                    summary: '该提示词与目标场景基本一致，保留了人数、预算、老人小孩三项关键变量，也点到了菜单、采购、时间安排和预算备选四个交付物，但整体仍偏薄。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['还缺更可判定的输出格式。'],
                    suggestedChanges: ['补上预算分档与异常分支。'],
                  }
                : callCount === 2
                  ? {
                    qualifies: false,
                    missingSignals: ['verification'],
                    summary: '本轮高分复核未通过，关键高分前提仍未全部满足。',
                    findings: ['还缺可判定的输出标准。'],
                  }
                  : {
                      score: 92,
                      dimensionScores: {
                        d1: 15,
                        d2: 10,
                        d3: 13,
                        d4: 14,
                        d5: 9,
                        d6: 8,
                        d7: 9,
                        d8: 9,
                        d9: 5,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准基本都写清楚了。',
                        d2: '输入变量交代完整。',
                        d3: '输出契约还缺一个可判定的落地格式。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行步骤比较扎实。',
                        d6: '异常处理仍少一个预算冲突兜底。',
                        d7: '证据边界比较硬。',
                        d8: '回退机制也有覆盖。',
                        d9: '可迭代性已经足够。',
                      }),
                      hasMaterialIssues: true,
                      summary: '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['输出契约明确度还缺可判定格式。', '鲁棒性还缺预算冲突兜底。'],
                      suggestedChanges: ['把输出格式写成可核对字段，并补预算冲突 fallback。'],
                    },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 92)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '该提示词与目标场景基本一致，保留了人数、预算、老人小孩三项关键变量，也点到了菜单、采购、时间安排和预算备选四个交付物，但整体仍偏薄。')
  assert.match(review.findings.join('\n'), /输出契约/u)
  assert.match(review.findings.join('\n'), /输出格式|关键结构前提/u)
})

test('top-band regrade still triggers a second evidence-bound structured rescore when the repaired score remains suspiciously full', async () => {
  const requestBodies: string[] = []
  const candidatePrompt = [
    '你是周末家庭聚餐策划助手。',
    '先读取人数、预算、老人小孩、忌口和厨房条件，再输出菜单建议、采购清单、时间安排和预算备选。',
    '如果预算不足，要明确说明删减逻辑；如果信息不全，要先列出缺口，再给一个可执行暂行方案。',
    '输出必须分为：菜单、采购、时间线、预算备选、风险提醒五部分。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestBodies.length === 1
                ? {
                    score: 95,
                    dimensionScores: {
                      d1: 14,
                      d2: 10,
                      d3: 14,
                      d4: 14,
                      d5: 9,
                      d6: 9,
                      d7: 10,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经比较清楚。',
                      d2: '输入变量交代完整。',
                      d3: '输出契约基本明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行步骤比较扎实。',
                      d6: '异常处理相对完整。',
                      d7: '证据边界比较硬。',
                      d8: '回退机制也有覆盖。',
                      d9: '可迭代性已经足够。',
                    }),
                    hasMaterialIssues: false,
                    summary: '结构已经比较强，但还需要看是否真的站得住高分。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['仍可把输出字段写得更可核对。'],
                    suggestedChanges: ['补一条预算冲突 fallback。'],
                  }
                : requestBodies.length === 2
                  ? {
                    qualifies: false,
                    missingSignals: ['verification'],
                    summary: '关键结构前提仍未全部满足。',
                    findings: ['还缺更可判定的输出标准。'],
                  }
                  : requestBodies.length === 3
                    ? {
                      score: 98,
                      dimensionScores: {
                        d1: 15,
                        d2: 10,
                        d3: 15,
                        d4: 15,
                        d5: 9,
                        d6: 9,
                        d7: 10,
                        d8: 10,
                        d9: 5,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准都已经写清楚。',
                        d2: '输入变量交代完整。',
                        d3: '输出契约非常明确。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行步骤比较扎实。',
                        d6: '异常处理相对完整。',
                        d7: '证据边界比较硬。',
                        d8: '回退机制也有覆盖。',
                        d9: '可迭代性已经足够。',
                      }),
                      hasMaterialIssues: false,
                      summary: '这版已经足够高分。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['整体已经很强。'],
                      suggestedChanges: [],
                    }
                    : {
                      score: 91,
                      dimensionScores: {
                        d1: 14,
                        d2: 10,
                        d3: 13,
                        d4: 14,
                        d5: 9,
                        d6: 8,
                        d7: 9,
                        d8: 9,
                        d9: 5,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准已经比较清楚。',
                        d2: '输入变量交代完整。',
                        d3: '输出契约还缺一个可判定字段。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行步骤比较扎实。',
                        d6: '异常处理还少一个预算冲突兜底。',
                        d7: '证据边界比较硬。',
                        d8: '回退机制也有覆盖。',
                        d9: '可迭代性已经足够。',
                      }),
                      hasMaterialIssues: true,
                      summary: '重评后仍有真实缺口，不应继续维持过满高分。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['输出契约还缺可核对字段。', '鲁棒性还缺预算冲突兜底。'],
                      suggestedChanges: ['把输出格式写成可核对字段，并补预算冲突 fallback。'],
                    },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(requestBodies.length, 4)
  assert.match(requestBodies[3] ?? '', /可疑高分|suspiciously high/i)
  assert.match(requestBodies[3] ?? '', /直接文本证据|direct textual evidence/i)
  assert.equal(review.score, 91)
  assert.equal(review.hasMaterialIssues, true)
  assert.match(review.findings.join('\n'), /输出契约|预算冲突/u)
})

test('invalid structured rescore after a suspicious top-band regrade is marked non-credible', async () => {
  const candidatePrompt = [
    '你是周末家庭聚餐策划助手。',
    '先读取人数、预算、老人小孩、忌口和厨房条件，再输出菜单建议、采购清单、时间安排和预算备选。',
    '如果预算不足，要明确说明删减逻辑；如果信息不全，要先列出缺口，再给一个可执行暂行方案。',
    '输出必须分为：菜单、采购、时间线、预算备选、风险提醒五部分。',
  ].join('\\n')
  let callCount = 0

  global.fetch = (async () => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 95,
                    dimensionScores: {
                      d1: 14,
                      d2: 10,
                      d3: 14,
                      d4: 14,
                      d5: 9,
                      d6: 9,
                      d7: 10,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经比较清楚。',
                      d2: '输入变量交代完整。',
                      d3: '输出契约基本明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行步骤比较扎实。',
                      d6: '异常处理相对完整。',
                      d7: '证据边界比较硬。',
                      d8: '回退机制也有覆盖。',
                      d9: '可迭代性已经足够。',
                    }),
                    hasMaterialIssues: false,
                    summary: '结构已经比较强，但还需要看是否真的站得住高分。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['仍可把输出字段写得更可核对。'],
                    suggestedChanges: ['补一条预算冲突 fallback。'],
                  }
                : callCount === 2
                  ? {
                    qualifies: false,
                    missingSignals: ['verification'],
                    summary: '关键结构前提仍未全部满足。',
                    findings: ['还缺更可判定的输出标准。'],
                  }
                  : callCount === 3
                    ? {
                      score: 98,
                      dimensionScores: {
                        d1: 15,
                        d2: 10,
                        d3: 15,
                        d4: 15,
                        d5: 9,
                        d6: 9,
                        d7: 10,
                        d8: 10,
                        d9: 5,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准都已经写清楚。',
                        d2: '输入变量交代完整。',
                        d3: '输出契约非常明确。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行步骤比较扎实。',
                        d6: '异常处理相对完整。',
                        d7: '证据边界比较硬。',
                        d8: '回退机制也有覆盖。',
                        d9: '可迭代性已经足够。',
                      }),
                      hasMaterialIssues: false,
                      summary: '这版已经足够高分。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['整体已经很强。'],
                      suggestedChanges: [],
                    }
                    : {
                      score: 98,
                      hasMaterialIssues: false,
                      summary: 'oops',
                    },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 4)
  assert.equal(review.score, 0)
  assert.equal(review.dimensionScores, null)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
  assert.deepEqual(review.findings, [
    '还缺更可判定的输出标准。',
    '仍可把输出字段写得更可核对。',
  ])
  assert.doesNotMatch(review.findings.join('\n'), /不可信|95\+|高分复核|高分重评/u)
})

test('suspiciously over-maxed high scores still trigger an evidence-bound repair for non-thin prompts', async () => {
  let callCount = 0
  const candidatePrompt = [
    '# 周末家庭聚餐执行提示词',
    '',
    '## 输入',
    '- 人数、预算、老人小孩、忌口、厨房设备、准备时长。',
    '- 如果信息缺失，先列缺口，再给默认假设，并标记风险。',
    '',
    '## 决策规则',
    '- 先按预算分档，再按忌口和老人小孩调整菜单。',
    '- 时间不足时优先保留主菜和汤，并删减复杂凉菜。',
    '- 设备不足时明确两口灶和电饭煲的使用顺序。',
    '',
    '## 异常与验证',
    '- 若预算冲突、食材缺失、人数变化或设备异常，必须给 fallback。',
    '- 结尾自检是否覆盖预算、忌口、时长、设备限制和异常处理。',
  ].join('\n')

  global.fetch = (async () => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 98,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 9,
                      d6: 10,
                      d7: 10,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标已经清楚。',
                      d2: '输入约束几乎完整。',
                      d3: '输出契约很明确。',
                      d4: '逻辑闭环完整。',
                      d5: '执行步骤扎实。',
                      d6: '鲁棒性很强。',
                      d7: '证据边界充分。',
                      d8: '回退机制较强。',
                      d9: '可迭代性不错。',
                    }),
                    hasMaterialIssues: false,
                    summary: '结构已经很强，但这个高分看起来过满。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['还缺一层字段级核对。'],
                    suggestedChanges: ['把字段验收规则和 fallback 触发条件继续写硬。'],
                  }
                : {
                    score: 91,
                    dimensionScores: {
                      d1: 14,
                      d2: 9,
                      d3: 13,
                      d4: 13,
                      d5: 8,
                      d6: 8,
                      d7: 9,
                      d8: 8,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标清楚，但成功标准还能更硬。',
                      d2: '输入约束较完整，但默认假设边界仍可更细。',
                      d3: '输出契约仍缺字段级核对点。',
                      d4: '逻辑闭环不错，但取舍规则仍偏口头化。',
                      d5: '执行性不错，但步骤分工还不够硬。',
                      d6: '鲁棒性仍缺预算冲突触发条件。',
                      d7: '证据边界比较稳。',
                      d8: '回退机制存在，但改道条件还可以更明确。',
                      d9: '可迭代性维持在高位。',
                    }),
                    hasMaterialIssues: true,
                    summary: '重评后仍有多个关键维度只到次高档，不应维持过满高分。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['字段级核对、取舍规则和 fallback 触发条件都还差最后一层硬约束。'],
                    suggestedChanges: ['把字段验收、fallback 触发条件和取舍顺序继续写硬。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 2)
  assert.equal(review.score, 86)
  assert.equal(review.hasMaterialIssues, true)
  assert.match(review.summary, /次高档/u)
})

test('invalid suspicious high-score repair is marked non-credible instead of preserving the original high score', async () => {
  let callCount = 0
  const candidatePrompt = [
    '# 家庭聚餐执行提示词',
    '',
    '输入包含人数、预算、忌口、老人小孩、厨房设备和时长。',
    '先按预算与忌口筛选，再决定菜单、时间线、采购清单与失败补救。',
    '如果预算不足、设备冲突或信息缺失，要明确 fallback，并在结尾做自检。',
  ].join('\n')

  global.fetch = (async () => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 97,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 9,
                      d6: 10,
                      d7: 10,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标已经清楚。',
                      d2: '输入约束几乎完整。',
                      d3: '输出契约很明确。',
                      d4: '逻辑闭环完整。',
                      d5: '执行步骤扎实。',
                      d6: '鲁棒性很强。',
                      d7: '证据边界充分。',
                      d8: '回退机制较强。',
                      d9: '可迭代性不错。',
                    }),
                    hasMaterialIssues: false,
                    summary: '这一版看起来已经接近生产可用。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: [],
                    suggestedChanges: [],
                  }
                : {
                    score: 97,
                    hasMaterialIssues: false,
                    summary: '坏 schema。',
                    findings: [],
                    suggestedChanges: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 2)
  assert.equal(review.score, 0)
  assert.equal(review.dimensionScores, null)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
  assert.deepEqual(review.findings, [])
})

test('high-band gate blockers trigger a structured regrade before 95+ can stand', async () => {
  let callCount = 0
  const candidatePrompt = [
    '你是周末家庭聚餐策划助手。',
    '先读取人数、预算、老人小孩、忌口和厨房条件，再输出菜单建议、采购清单、时间安排和预算备选。',
    '如果预算不足，要明确说明删减逻辑；如果信息不全，要先列出缺口，再给一个可执行暂行方案。',
    '输出必须分为：菜单、采购、时间线、预算备选、风险提醒五部分。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 96,
                    dimensionScores: {
                      d1: 15,
                      d2: 8,
                      d3: 15,
                      d4: 15,
                      d5: 9,
                      d6: 8,
                      d7: 10,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准基本都写清楚了。',
                      d2: '输入变量还少一个关键约束。',
                      d3: '输出契约很明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行步骤比较扎实。',
                      d6: '异常处理仍缺预算冲突兜底。',
                      d7: '证据边界比较硬。',
                      d8: '回退机制也有覆盖。',
                      d9: '可迭代性已经足够。',
                    }),
                    hasMaterialIssues: false,
                    summary: '这版已经有较强结构，但关键维度还没到 95+ 的门槛。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['输入约束与鲁棒性仍有硬缺口。'],
                    suggestedChanges: ['补齐关键输入约束并写清预算冲突 fallback。'],
                  }
                : {
                    score: 91,
                    dimensionScores: {
                      d1: 15,
                      d2: 8,
                      d3: 14,
                      d4: 14,
                      d5: 9,
                      d6: 8,
                      d7: 9,
                      d8: 9,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准基本都写清楚了。',
                      d2: '输入变量还少一个关键约束。',
                      d3: '输出契约基本明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行步骤比较扎实。',
                      d6: '异常处理仍缺预算冲突兜底。',
                      d7: '证据边界比较硬。',
                      d8: '回退机制也有覆盖。',
                      d9: '可迭代性已经足够。',
                    }),
                    hasMaterialIssues: true,
                    summary: '这版仍挡在 95+ 外，输入约束与鲁棒性都还没过门槛。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['输入约束完整度仍低于 95+ 门槛。', '鲁棒性仍低于 95+ 门槛。'],
                    suggestedChanges: ['补齐关键输入约束，并把预算冲突 fallback 写硬。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 2)
  assert.equal(review.score, 91)
  assert.equal(review.hasMaterialIssues, true)
  assert.match(review.findings.join('\n'), /硬缺口/u)
  assert.doesNotMatch(review.findings.join('\n'), /95\+|门槛/u)
})

test('suspiciously over-maxed high scores force an evidence-bound repair before top-band review', async () => {
  let callCount = 0
  const requestedSystems: string[] = []
  const candidatePrompt = [
    '你是周末家庭聚餐方案总控。',
    '输入前先确认人数、预算、老人小孩、忌口、厨房设备、可用时长和采购便利度。',
    '如果人数、预算、忌口或设备存在冲突，必须先写明冲突，再给一个最稳的降级方案。',
    '输出固定为菜单、采购、时间线、上菜顺序、失败补救五部分，并要求五部分彼此一致。',
    '菜单必须解释取舍逻辑；时间线必须覆盖提前准备、烹饪顺序和桌面收口；失败补救至少给 3 条。',
    '输出前自检预算是否匹配、忌口是否被违反、设备与时间是否可落地。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> }
    requestedSystems.push(body.messages?.[0]?.content ?? '')
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 98,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 10,
                      d6: 10,
                      d7: 10,
                      d8: 9,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经很完整。',
                      d2: '输入约束交代完整。',
                      d3: '输出契约非常明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行路径可直接照做。',
                      d6: '异常处理比较完整。',
                      d7: '证据边界已经写硬。',
                      d8: '回退机制还少一个采购失败改道分支。',
                      d9: '后续迭代接口还能再稳一点。',
                    }),
                    hasMaterialIssues: false,
                    summary: '该提示词结构完整，几乎没有明显短板。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['可继续把采购失败时的改道方案写得更明确。'],
                    suggestedChanges: ['补一个采购失败时的改道分支。'],
                  }
                : {
                    score: 91,
                    dimensionScores: {
                      d1: 15,
                      d2: 9,
                      d3: 14,
                      d4: 14,
                      d5: 10,
                      d6: 8,
                      d7: 9,
                      d8: 8,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经很完整。',
                      d2: '输入约束基本完整。',
                      d3: '输出契约基本明确，但可核对格式还不够硬。',
                      d4: '逻辑闭环大体成立。',
                      d5: '执行路径可直接照做。',
                      d6: '异常处理还少预算冲突与设备不足兜底。',
                      d7: '证据边界比较明确。',
                      d8: '回退机制还少采购失败改道分支。',
                      d9: '后续迭代接口还能再稳一点。',
                    }),
                    hasMaterialIssues: true,
                    summary: '这版主体结构已经比较强，但异常处理、回退机制和可核对格式还没收紧。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['鲁棒性与反死胡同能力仍有真实缺口。'],
                    suggestedChanges: ['把预算冲突、设备不足和采购失败的分支写硬。'],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 2)
  assert.match(requestedSystems[1] ?? '', /direct textual evidence|可疑高分/u)
  assert.equal(review.score, 91)
  assert.equal(review.hasMaterialIssues, true)
  assert.match(review.summary, /主体结构已经比较强/u)
})

test('suspicious top-band regrades trigger one more evidence-bound structured rescore', async () => {
  let callCount = 0
  const requestedSystems: string[] = []
  const candidatePrompt = [
    '你是周末家庭聚餐方案总控。',
    '输入前先确认人数、预算、老人小孩、忌口、厨房设备、可用时长和采购便利度。',
    '如果人数、预算、忌口或设备存在冲突，必须先写明冲突，再给一个最稳的降级方案。',
    '输出固定为菜单、采购、时间线、上菜顺序、失败补救五部分，并要求五部分彼此一致。',
    '菜单必须解释取舍逻辑；时间线必须覆盖提前准备、烹饪顺序和桌面收口；失败补救至少给 3 条。',
    '输出前自检预算是否匹配、忌口是否被违反、设备与时间是否可落地。',
  ].join('\\n')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> }
    requestedSystems.push(body.messages?.[0]?.content ?? '')
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 98,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 10,
                      d6: 10,
                      d7: 10,
                      d8: 9,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经很完整。',
                      d2: '输入约束交代完整。',
                      d3: '输出契约非常明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行路径可直接照做。',
                      d6: '异常处理比较完整。',
                      d7: '证据边界已经写硬。',
                      d8: '回退机制还少一个采购失败改道分支。',
                      d9: '后续迭代接口还能再稳一点。',
                    }),
                    hasMaterialIssues: false,
                    summary: '该提示词结构完整，几乎没有明显短板。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['可继续把采购失败时的改道方案写得更明确。'],
                    suggestedChanges: ['补一个采购失败时的改道分支。'],
                  }
                : callCount === 2
                  ? {
                      score: 96,
                      dimensionScores: {
                        d1: 15,
                        d2: 8,
                        d3: 15,
                        d4: 15,
                        d5: 10,
                        d6: 10,
                        d7: 10,
                        d8: 10,
                        d9: 4,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准已经很完整。',
                        d2: '输入约束还少一个关键硬边界。',
                        d3: '输出契约非常明确。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行路径可直接照做。',
                        d6: '异常处理比较完整。',
                        d7: '证据边界已经写硬。',
                        d8: '回退机制已经覆盖。',
                        d9: '后续迭代接口还能再稳一点。',
                      }),
                      hasMaterialIssues: false,
                      summary: '这版结构很强，但输入硬边界还没封死。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['输入约束仍有硬缺口。'],
                      suggestedChanges: ['把关键输入边界写成硬约束。'],
                    }
                  : callCount === 3
                    ? {
                        score: 97,
                        dimensionScores: {
                          d1: 15,
                          d2: 10,
                          d3: 15,
                          d4: 15,
                          d5: 10,
                          d6: 10,
                          d7: 10,
                          d8: 10,
                          d9: 4,
                        },
                        dimensionReasons: buildDimensionReasons({
                          d1: '目标和成功标准已经很完整。',
                          d2: '输入约束已经过线。',
                          d3: '输出契约非常明确。',
                          d4: '逻辑闭环已经成立。',
                          d5: '执行路径可直接照做。',
                          d6: '异常处理比较完整。',
                          d7: '证据边界已经写硬。',
                          d8: '回退机制已经覆盖。',
                          d9: '后续迭代接口还能再稳一点。',
                        }),
                        hasMaterialIssues: false,
                        summary: '这版已经很强，但仍缺少足够扎实的落地证据。',
                        driftLabels: [],
                        driftExplanation: '',
                        findings: ['可迭代接口仍偏薄。'],
                        suggestedChanges: ['把后续迭代接口与复盘钩子写得更硬。'],
                      }
                    : {
                        score: 92,
                        dimensionScores: {
                          d1: 15,
                          d2: 9,
                          d3: 14,
                          d4: 14,
                          d5: 10,
                          d6: 9,
                          d7: 9,
                          d8: 8,
                          d9: 4,
                        },
                        dimensionReasons: buildDimensionReasons({
                          d1: '目标和成功标准已经很完整。',
                          d2: '输入约束已经过线。',
                          d3: '输出契约还可再补一个可核对格式。',
                          d4: '逻辑闭环已经成立，但收口还可更硬。',
                          d5: '执行路径可直接照做。',
                          d6: '异常处理比较完整。',
                          d7: '证据边界还可再补一个来源限制。',
                          d8: '回退机制还少一个采购失败改道分支。',
                          d9: '后续迭代接口还能再稳一点。',
                        }),
                        hasMaterialIssues: true,
                        summary: '这版已经有较强骨架，但还没扎到接近满分所需的证据密度。',
                        driftLabels: [],
                        driftExplanation: '',
                        findings: ['证据边界、回退机制与迭代接口仍需补强。'],
                        suggestedChanges: ['把来源限制、采购失败改道和复盘接口一起写硬。'],
                      },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 4)
  assert.match(requestedSystems[1] ?? '', /direct textual evidence|可疑高分/u)
  assert.match(requestedSystems[2] ?? '', /不要把结果机械停在 94|do not mechanically park on 94/u)
  assert.match(requestedSystems[3] ?? '', /direct textual evidence|可疑高分/u)
  assert.equal(review.score, 92)
  assert.equal(review.hasMaterialIssues, true)
})

test('invalid schema during suspicious high rescore still marks the review as non-credible', async () => {
  let callCount = 0
  const candidatePrompt = [
    '你是周末家庭聚餐方案总控。',
    '输入前先确认人数、预算、老人小孩、忌口、厨房设备、可用时长和采购便利度。',
    '如果人数、预算、忌口或设备存在冲突，必须先写明冲突，再给一个最稳的降级方案。',
    '输出固定为菜单、采购、时间线、上菜顺序、失败补救五部分，并要求五部分彼此一致。',
    '菜单必须解释取舍逻辑；时间线必须覆盖提前准备、烹饪顺序和桌面收口；失败补救至少给 3 条。',
    '输出前自检预算是否匹配、忌口是否被违反、设备与时间是否可落地。',
  ].join('\\n')

  global.fetch = (async () => {
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 98,
                    dimensionScores: {
                      d1: 15,
                      d2: 10,
                      d3: 15,
                      d4: 15,
                      d5: 10,
                      d6: 10,
                      d7: 10,
                      d8: 9,
                      d9: 4,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标和成功标准已经很完整。',
                      d2: '输入约束交代完整。',
                      d3: '输出契约非常明确。',
                      d4: '逻辑闭环已经成立。',
                      d5: '执行路径可直接照做。',
                      d6: '异常处理比较完整。',
                      d7: '证据边界已经写硬。',
                      d8: '回退机制还少一个采购失败改道分支。',
                      d9: '后续迭代接口还能再稳一点。',
                    }),
                    hasMaterialIssues: false,
                    summary: '该提示词结构完整，几乎没有明显短板。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['可继续把采购失败时的改道方案写得更明确。'],
                    suggestedChanges: ['补一个采购失败时的改道分支。'],
                  }
                : callCount === 2
                  ? {
                      score: 96,
                      dimensionScores: {
                        d1: 15,
                        d2: 8,
                        d3: 15,
                        d4: 15,
                        d5: 10,
                        d6: 10,
                        d7: 10,
                        d8: 10,
                        d9: 4,
                      },
                      dimensionReasons: buildDimensionReasons({
                        d1: '目标和成功标准已经很完整。',
                        d2: '输入约束还少一个关键硬边界。',
                        d3: '输出契约非常明确。',
                        d4: '逻辑闭环已经成立。',
                        d5: '执行路径可直接照做。',
                        d6: '异常处理比较完整。',
                        d7: '证据边界已经写硬。',
                        d8: '回退机制已经覆盖。',
                        d9: '后续迭代接口还能再稳一点。',
                      }),
                      hasMaterialIssues: false,
                      summary: '这版结构很强，但输入硬边界还没封死。',
                      driftLabels: [],
                      driftExplanation: '',
                      findings: ['输入约束仍有硬缺口。'],
                      suggestedChanges: ['把关键输入边界写成硬约束。'],
                    }
                  : callCount === 3
                    ? {
                        score: 97,
                        dimensionScores: {
                          d1: 15,
                          d2: 10,
                          d3: 15,
                          d4: 15,
                          d5: 10,
                          d6: 10,
                          d7: 10,
                          d8: 10,
                          d9: 4,
                        },
                        dimensionReasons: buildDimensionReasons({
                          d1: '目标和成功标准已经很完整。',
                          d2: '输入约束已经过线。',
                          d3: '输出契约非常明确。',
                          d4: '逻辑闭环已经成立。',
                          d5: '执行路径可直接照做。',
                          d6: '异常处理比较完整。',
                          d7: '证据边界已经写硬。',
                          d8: '回退机制已经覆盖。',
                          d9: '后续迭代接口还能再稳一点。',
                        }),
                        hasMaterialIssues: false,
                        summary: '这版结构很强，但仍缺少足够扎实的落地证据。',
                        driftLabels: [],
                        driftExplanation: '',
                        findings: ['可迭代接口仍偏薄。'],
                        suggestedChanges: ['把后续迭代接口与复盘钩子写得更硬。'],
                      }
                    : {
                        score: 97,
                        dimensionScores: {
                          d1: 15,
                          d2: 9,
                          d3: 15,
                          d4: 15,
                          d5: 10,
                          d6: 9,
                          d7: 10,
                          d8: 10,
                          d9: 4,
                        },
                        hasMaterialIssues: false,
                        summary: '这版结构很强，但仍缺少足够扎实的落地证据。',
                        driftLabels: [],
                        driftExplanation: '',
                        findings: ['可迭代接口仍偏薄。'],
                        suggestedChanges: ['把后续迭代接口与复盘钩子写得更硬。'],
                      },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(candidatePrompt, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 4)
  assert.equal(review.score, 0)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
  assert.equal(review.dimensionScores, null)
  assert.deepEqual(review.findings, ['输入约束仍有硬缺口。', '可迭代接口仍偏薄。'])
})

test('non-default 10x10 structured rubric skips the default high-band blocker chain', async () => {
  let callCount = 0
  const requestedSystems: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> }
    requestedSystems.push(body.messages?.[0]?.content ?? '')
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 95,
              dimensionScores: {
                d1: 10,
                d2: 9,
                d3: 10,
                d4: 9,
                d5: 10,
                d6: 10,
                d7: 9,
                d8: 10,
                d9: 9,
                d10: 9,
              },
              dimensionReasons: buildCustomDimensionReasons([
                { id: 'd1', reason: '场景保真已经比较稳定。' },
                { id: 'd2', reason: '输入采集仍可补一个可选变量。' },
                { id: 'd3', reason: '输出结构完整。' },
                { id: 'd4', reason: '决策规则还可再补一个优先级例外。' },
                { id: 'd5', reason: '时间规划比较扎实。' },
                { id: 'd6', reason: '预算控制已覆盖主要约束。' },
                { id: 'd7', reason: '异常处理仍缺一个采购失败分支。' },
                { id: 'd8', reason: '风险提示比较明确。' },
                { id: 'd9', reason: '可执行性较强。' },
                { id: 'd10', reason: '复盘接口还有补强空间。' },
              ]),
              hasMaterialIssues: false,
              summary: '这版已经比较完整，但仍有几个局部可继续补强。',
              driftLabels: [],
              driftExplanation: '',
              findings: ['输入采集、决策例外和异常分支还可再补硬一点。'],
              suggestedChanges: ['补一个采购失败分支，并把优先级例外写硬。'],
            }),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: CUSTOM_TEN_BY_TEN_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(RICH_CANDIDATE_PROMPT, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 1)
  assert.doesNotMatch(requestedSystems[0] ?? '', /95\+|高分复核|top-band|missingSignals/u)
  assert.equal(review.score, 95)
  assert.deepEqual(review.dimensionScores, {
    d1: 10,
    d2: 9,
    d3: 10,
    d4: 9,
    d5: 10,
    d6: 10,
    d7: 9,
    d8: 10,
    d9: 9,
    d10: 9,
  })
})

test('non-default 5x20 structured rubric skips default top-band verifier semantics even at high scores', async () => {
  let callCount = 0
  const requestedSystems: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> }
    requestedSystems.push(body.messages?.[0]?.content ?? '')
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 96,
              dimensionScores: {
                d1: 19,
                d2: 19,
                d3: 20,
                d4: 19,
                d5: 19,
              },
              dimensionReasons: buildCustomDimensionReasons([
                { id: 'd1', reason: '目标与场景保真较强，但还可补一个成功判定句。' },
                { id: 'd2', reason: '输入约束覆盖较强，但还缺一个采购渠道约束。' },
                { id: 'd3', reason: '输出结构与交付物已经很完整。' },
                { id: 'd4', reason: '决策规则已经较强，但优先级例外还可更硬。' },
                { id: 'd5', reason: '异常处理与可执行性较强，但还可补一个设备不足分支。' },
              ]),
              hasMaterialIssues: false,
              summary: '这版结构已经很强，但仍有少量局部硬度可以继续补齐。',
              driftLabels: [],
              driftExplanation: '',
              findings: ['采购渠道约束、优先级例外和设备不足分支还可继续补硬。'],
              suggestedChanges: ['补一个设备不足分支，并把采购渠道限制写明。'],
            }),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: CUSTOM_FIVE_BY_TWENTY_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(RICH_CANDIDATE_PROMPT, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(callCount, 1)
  assert.doesNotMatch(requestedSystems[0] ?? '', /95\+ 的四个前提|top-band verifier|missingSignals/u)
  assert.equal(review.score, 96)
  assert.equal(review.hasMaterialIssues, false)
})

test('default-compatible custom structured rubric still keeps the default high-band chain', async () => {
  let callCount = 0
  const requestedSystems: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> }
    requestedSystems.push(body.messages?.[0]?.content ?? '')
    callCount += 1

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    score: 96,
                    dimensionScores: {
                      d1: 15,
                      d2: 9,
                      d3: 14,
                      d4: 14,
                      d5: 10,
                      d6: 9,
                      d7: 9,
                      d8: 10,
                      d9: 5,
                    },
                    dimensionReasons: buildDimensionReasons({
                      d1: '目标已经清楚。',
                      d2: '输入约束已经过线。',
                      d3: '输出契约已经过线。',
                      d4: '逻辑闭环已经过线。',
                      d5: '执行路径比较完整。',
                      d6: '鲁棒性已经过线。',
                      d7: '证据边界较强。',
                      d8: '回退机制比较扎实。',
                      d9: '可迭代性到位。',
                    }),
                    hasMaterialIssues: false,
                    summary: '这版已经达到高分复核前的结构强度。',
                    driftLabels: [],
                    driftExplanation: '',
                    findings: ['仍可把证据边界再写得更硬。'],
                    suggestedChanges: ['补一条来源限制。'],
                  }
                : {
                    qualifies: true,
                    missingSignals: [],
                    summary: '关键前提齐备。',
                    findings: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: DEFAULT_COMPATIBLE_CUSTOM_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt(RICH_CANDIDATE_PROMPT, 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.ok(callCount >= 2)
  assert.match(requestedSystems[0] ?? '', /95\+/u)
  assert.match(requestedSystems.join('\n'), /高分复核器|top-band verifier/u)
  assert.equal(review.score, 95)
})

test('adapter caps high scores when drift labels are present', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 98,
            hasMaterialIssues: false,
            summary: 'ready',
            driftLabels: ['constraint_loss'],
            driftExplanation: '丢了约束。',
            findings: [],
            suggestedChanges: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('这是一个需要守住预算和忌口约束的候选提示词。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 89)
  assert.equal(review.hasMaterialIssues, true)
  assert.deepEqual(review.driftLabels, ['constraint_loss'])
  assert.match(review.summary, /异语言摘要|偏题|约束丢失/u)
})

test('adapter ignores out-of-range raw totals when valid dimension scores are present', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 123,
            dimensionScores: {
              d1: 10,
              d2: 6,
              d3: 8,
              d4: 8,
              d5: 7,
              d6: 5,
              d7: 4,
              d8: 4,
              d9: 3,
            },
            dimensionReasons: buildDimensionReasons({
              d1: '目标已经比较清楚。',
              d2: '输入约束基本够用，但还不够硬。',
              d3: '输出要求比较明确。',
              d4: '逻辑闭环大体成立。',
              d5: '可执行性尚可。',
              d6: '异常处理还不够完整。',
              d7: '证据边界仍偏弱。',
              d8: '反死胡同能力一般。',
              d9: '具备继续迭代空间。',
            }),
            hasMaterialIssues: true,
            summary: '整体已经可用，但还不到通过线。',
            driftLabels: [],
            driftExplanation: '',
            findings: ['仍需补上异常处理。'],
            suggestedChanges: ['明确失败兜底。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: WEIGHTED_RUBRIC_MD,
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('请给出一个包含预算、菜单和时间安排的家庭聚餐方案。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.score, 55)
  assert.equal(review.hasMaterialIssues, true)
  assert.equal(review.summary, '整体已经可用，但还不到通过线。')
})

test('adapter accepts snake_case optimizer payload fields from providers', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            optimized_prompt: '优化后的新提示词',
            strategy: 'rebuild',
            score_before: 81,
            major_changes: ['补上了输入约束。'],
            mve: '先跑一个最小样例。',
            dead_end_signals: ['不要回退成泛化建议。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const result = await adapter.optimizePrompt({
    currentPrompt: '原始提示词',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
  })

  assert.equal(result.optimizedPrompt, '优化后的新提示词')
  assert.equal(result.scoreBefore, 81)
  assert.deepEqual(result.majorChanges, ['补上了输入约束。'])
  assert.deepEqual(result.deadEndSignals, ['不要回退成泛化建议。'])
})

test('adapter accepts snake_case judge payload fields from providers', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 92,
            has_material_issues: true,
            summary: '还缺异常处理。',
            drift_labels: ['constraint_loss'],
            drift_explanation: '预算约束被弱化了。',
            findings: ['预算分档还不够具体。'],
            suggested_changes: ['补上预算冲突时的处理。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const review = await adapter.judgePrompt('这是一个需要守住预算约束的中文候选提示词。', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(review.hasMaterialIssues, true)
  assert.deepEqual(review.driftLabels, ['constraint_loss'])
  assert.equal(review.driftExplanation, '预算约束被弱化了。')
  assert.ok(review.suggestedChanges.some((item) => /预算冲突/.test(item)))
})
