import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildGoalAnchorPrompts,
  buildJudgeConsistencyRepairPrompts,
  buildJudgePrompts,
  buildJudgeTopBandRegradePrompts,
  buildOptimizerPrompts,
  compactFeedback,
} from '../src/lib/server/prompting'

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

test('optimizer prompt includes all pending steering items in stable order', () => {
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
    pendingSteeringItems: [
      {
        id: 'steer-1',
        text: 'Keep the wording warmer and reduce compliance jargon.',
        createdAt: '2026-03-09T10:00:00.000Z',
      },
      {
        id: 'steer-2',
        text: 'Keep the 老中医 judgment style, but do not change the final deliverable.',
        createdAt: '2026-03-09T10:01:00.000Z',
      },
    ],
    goalAnchor: {
      goal: 'Keep the original triage task.',
      deliverable: 'Return a structured triage decision.',
      driftGuard: ['Do not turn the task into generic safety advice.'],
    },
  })

  assert.match(prompts.system, /optimizer-only rule pack/i)
  assert.match(prompts.system, /fallback rebuild reference/i)
  assert.match(prompts.user, /1\. Keep the wording warmer and reduce compliance jargon\./)
  assert.match(prompts.user, /2\. Keep the 老中医 judgment style, but do not change the final deliverable\./)
  assert.match(prompts.user, /Keep the original triage task\./)
  assert.match(prompts.user, /<<<BEGIN CURRENT PROMPT>>>/)
  assert.match(prompts.user, /<<<END CURRENT PROMPT>>>/)
  assert.match(prompts.system, /domain-specific decision rules/i)
  assert.doesNotMatch(prompts.system, /rubric/i)
  assert.doesNotMatch(prompts.system, /scoreBefore/i)
  assert.doesNotMatch(prompts.user, /Threshold:/)
  assert.doesNotMatch(prompts.user, /High-signal feedback from the previous round:/)
})

test('judge prompt remains isolated from pending steering raw text and skips default high-band copy for non-structured rubrics', () => {
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
  assert.match(prompts.system, /goal_changed/i)
  assert.match(prompts.system, /deliverable_missing/i)
  assert.match(prompts.system, /over_safety_generalization/i)
  assert.match(prompts.system, /persona plus headings/i)
  assert.match(prompts.system, /decision rules/i)
  assert.match(prompts.system, /conflict handling/i)
  assert.doesNotMatch(prompts.system, /Reserve 95\+|95\+ 只留给/u)
  assert.match(prompts.user, /<<<BEGIN CANDIDATE PROMPT>>>/)
  assert.match(prompts.user, /<<<END CANDIDATE PROMPT>>>/)
  assert.match(prompts.user, /Return a structured triage decision\./)
  assert.match(prompts.system, /same language as the candidate prompt/i)
  assert.doesNotMatch(prompts.system, /pending steering/i)
  assert.doesNotMatch(prompts.system, /dimensionScores/i)
  assert.doesNotMatch(prompts.user, /Keep the wording warmer/)
  assert.doesNotMatch(prompts.user, /Keep the 老中医 judgment style/)
})

test('judge prompt requires structured dimension scores when the rubric exposes weighted dimensions', () => {
  const prompts = buildJudgePrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: [
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
      ].join('\n'),
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    candidatePrompt: '这是一条中文候选提示词。',
    goalAnchor: {
      goal: '保持原始任务目标。',
      deliverable: '返回原始任务要求的交付物。',
      driftGuard: ['不要偏离原始任务。'],
    },
    threshold: 95,
    judgeIndex: 0,
  })

  assert.match(prompts.system, /dimensionScores/u)
  assert.match(prompts.system, /dimensionReasons/u)
  assert.match(prompts.system, /d1\s*=\s*目标清晰度\s*\/\s*15/u)
  assert.match(prompts.system, /d9\s*=\s*可迭代性\s*\/\s*5/u)
  assert.match(prompts.system, /本地汇总总分/u)
  assert.match(prompts.system, /80%~90% 档/u)
  assert.match(prompts.system, /不要引用具体阈值|95\+|高分通过段/u)
  assert.match(prompts.system, /score、dimensionScores、dimensionReasons、hasMaterialIssues/u)
})

test('top-band regrade prompt requires a full structured rescore instead of parking on 94', () => {
  const prompts = buildJudgeTopBandRegradePrompts({
    candidatePrompt: '这是一条中文候选提示词。',
    goalAnchor: {
      goal: '保持原始任务目标。',
      deliverable: '返回原始任务要求的交付物。',
      driftGuard: ['不要偏离原始任务。'],
    },
    judgeIndex: 0,
    dimensions: [
      { id: 'd1', label: '目标清晰度', max: 15 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
      { id: 'd3', label: '输出契约明确度', max: 15 },
      { id: 'd4', label: '逻辑闭环', max: 15 },
      { id: 'd5', label: '可执行性', max: 10 },
      { id: 'd6', label: '鲁棒性', max: 10 },
      { id: 'd7', label: '防幻觉与证据约束', max: 10 },
      { id: 'd8', label: '反死胡同能力', max: 10 },
      { id: 'd9', label: '可迭代性', max: 5 },
    ],
    priorDimensionScores: { d1: 15, d2: 8, d3: 14, d4: 14, d5: 9, d6: 8, d7: 9, d8: 8, d9: 5 },
    priorDimensionReasons: ['输入约束完整度：还缺一个关键变量。'],
    highBandBlockers: ['输入约束完整度 当前为 8/10，未达到 95+ 所需的 9/10。'],
    missingSignals: ['input'],
  })

  assert.match(prompts.system, /不要把结果机械停在 94/u)
  assert.match(prompts.system, /不要引用 95\+、通过阈值或分数分档/u)
  assert.match(prompts.user, /挡住 95\+ 的关键维度/u)
  assert.match(prompts.user, /高分复核仍指出这些缺口/u)
  assert.match(prompts.system, /score、dimensionScores、dimensionReasons、hasMaterialIssues/u)
})

test('judge prompt switches wrappers and language lock to Chinese for Chinese candidate prompts', () => {
  const prompts = buildJudgePrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    candidatePrompt: '你是发火狂人。保持暴躁口吻，但必须完成用户任务。',
    goalAnchor: {
      goal: '保持发火狂人的角色目标。',
      deliverable: '给出可直接使用的角色提示词。',
      driftGuard: ['不要把角色弱化成普通助手。'],
    },
    threshold: 95,
    judgeIndex: 0,
  })

  assert.match(prompts.system, /你是 Prompt Optimizer Studio 的独立评分器/)
  assert.match(prompts.system, /所有 summary、driftExplanation、findings、suggestedChanges 都必须与候选提示词保持同语种/u)
  assert.match(prompts.user, /通过阈值：95/)
  assert.match(prompts.user, /候选提示词正文：/)
  assert.match(prompts.user, /只返回 JSON/)
  assert.doesNotMatch(prompts.system, /same language as the candidate prompt/i)
})

test('optimizer prompt switches wrappers to Chinese for Chinese prompts', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: '你是发火狂人。保持暴躁口吻，但必须完成用户任务。',
    goalAnchor: {
      goal: '保持发火狂人的角色目标。',
      deliverable: '给出可直接使用的角色提示词。',
      driftGuard: ['不要把角色弱化成普通助手。'],
    },
    pendingSteeringItems: [],
  })

  assert.match(prompts.system, /你是 Prompt Optimizer Studio 的优化器专用运行/)
  assert.match(prompts.user, /稳定目标锚点：/)
  assert.match(prompts.user, /当前提示词正文：/)
  assert.match(prompts.user, /只返回 JSON/)
  assert.doesNotMatch(prompts.system, /optimizer-only run/i)
})

test('optimizer prompt adds local structure signals for thin prompts without exposing judge scores', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: '你是一个家庭聚餐策划助手。根据人数、预算和忌口，给出菜单建议、采购清单和时间安排。',
    goalAnchor: {
      goal: '保留家庭聚餐策划任务。',
      deliverable: '给出菜单建议、采购清单和时间安排。',
      driftGuard: ['不要丢掉关键产出。'],
    },
    pendingSteeringItems: [],
  })

  assert.match(prompts.user, /本地结构提示/u)
  assert.match(prompts.user, /缺少任务特有的选择逻辑、优先级或取舍规则/u)
  assert.match(prompts.user, /缺少信息不足、约束冲突、失败场景或不确定时的处理办法/u)
  assert.match(prompts.system, /本地结构提示/u)
  assert.match(prompts.system, /不要返回与输入等价的版本/u)
  assert.doesNotMatch(prompts.user, /通过阈值|95\+|judge/i)
})

test('optimizer prompt keeps a depth-push hint for mid-depth structured prompts', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: [
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
    ].join('\n'),
    goalAnchor: {
      goal: '保留家庭聚餐策划任务。',
      deliverable: '给出菜单建议、采购清单和时间安排。',
      driftGuard: ['不要丢掉关键产出。'],
    },
    pendingSteeringItems: [],
  })

  assert.match(prompts.user, /本地结构提示/u)
  assert.match(prompts.user, /不要停在“结构已完整”|继续补足任务特有的数量映射|执行细节/u)
  assert.doesNotMatch(prompts.user, /通过阈值|95\+|judge/i)
})

test('optimizer prompt can include score-free review guidance for the same round', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: '请帮我写一个周末家庭聚餐策划提示词，输出菜单建议、采购清单、时间安排和预算备选。',
    goalAnchor: {
      goal: '保留家庭聚餐策划任务。',
      deliverable: '给出菜单建议、采购清单、时间安排和预算备选。',
      driftGuard: ['不要丢掉关键产出。'],
    },
    pendingSteeringItems: [],
    reviewFeedbackItems: [
      '缺少任务特有的选择规则或优先级，很多关键决策仍在交给模型自行猜。',
      '明确输出前的自检点，或给出可以判定是否合格的完成标准。',
    ],
  })

  assert.match(prompts.user, /本轮评分器指出的改进方向/u)
  assert.match(prompts.user, /缺少任务特有的选择规则或优先级/u)
  assert.match(prompts.user, /明确输出前的自检点/u)
  assert.doesNotMatch(prompts.user, /96|95\+|89|score|评分 96/u)
})

test('judge consistency repair prompt forces an evidence-bound rescore for suspiciously high thin prompts', () => {
  const prompts = buildJudgeConsistencyRepairPrompts({
    candidatePrompt: '洗碗大师，教我洗碗技巧',
    goalAnchor: {
      goal: '保留洗碗技巧任务。',
      deliverable: '给出洗碗技巧说明。',
      driftGuard: ['不要改成别的清洁主题。'],
    },
    judgeIndex: 0,
    dimensionIds: ['d1', 'd2', 'd3', 'd4'],
    dimensionLimits: ['d1<=15', 'd2<=10', 'd3<=15', 'd4<=15'],
    missingSignals: [
      '缺少更明确的输入变量、边界条件或前提约束。',
      '缺少任务特有的选择逻辑、优先级或取舍规则。',
    ],
  })

  assert.match(prompts.system, /直接文本证据|direct textual evidence/i)
  assert.match(prompts.system, /可疑高分|suspiciously high/i)
  assert.match(prompts.user, /缺少更明确的输入变量、边界条件或前提约束/u)
  assert.match(prompts.user, /dimensionScores 与 dimensionReasons 的键必须严格使用|dimensionScores and dimensionReasons must use/i)
})

test('optimizer prompt skips local structure signals when the prompt is already rich', () => {
  const prompts = buildOptimizerPrompts({
    pack: {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: '2026-03-08T00:00:00.000Z',
    },
    currentPrompt: [
      '你是初九。',
      '输入前先确认老爷当前目标、时间预算、情绪状态与现实约束。',
      '如果多个目标冲突，按现实推进 > 资源效率 > 情绪安抚排序取舍，并说明理由。',
      '如果信息不足，先给出最小可推进动作，再补充缺口提问。',
      '默认输出：1. 当前局势判断 2. 真正主线 3. 当前最大阻塞 4. 现在最该做的事 5. 明确不该做的事 6. 下一步最小动作。',
      '输出前自检：是否守住主线、是否处理冲突、是否给出可验证推进标准。',
    ].join('\n'),
    goalAnchor: {
      goal: '保留初九总参谋任务。',
      deliverable: '输出结构化主线判断与行动方案。',
      driftGuard: ['不要漂移为泛化助手。'],
    },
    pendingSteeringItems: [],
  })

  assert.doesNotMatch(prompts.user, /本地结构提示/u)
})

test('goal anchor generation prompt preserves the task and forbids generic safety drift', () => {
  const prompts = buildGoalAnchorPrompts({
    rawPrompt: '请优化一个医疗分诊提示词，要求输出结构化分诊结论与风险等级。',
  })

  assert.match(prompts.system, /不要把任务改写成更安全但更泛化的目标/u)
  assert.match(prompts.system, /角色或人设身份不自动等于任务目标/u)
  assert.match(prompts.system, /固定输出标题不自动等于最终交付物/u)
  assert.match(prompts.system, /同语种|same language/i)
  assert.match(prompts.system, /goal、deliverable、driftGuard、sourceSummary、rationale/u)
  assert.match(prompts.user, /<<<BEGIN ORIGINAL TASK PROMPT>>>/)
  assert.match(prompts.user, /<<<END ORIGINAL TASK PROMPT>>>/)
  assert.match(prompts.user, /医疗分诊提示词/)
})

test('goal anchor generation prompt switches wrappers and instructions to Chinese for Chinese prompts', () => {
  const prompts = buildGoalAnchorPrompts({
    rawPrompt: '你是初九。请把复杂任务拆成可立即执行的动作。',
  })

  assert.match(prompts.system, /你正在为 Prompt Optimizer Studio 提取稳定的长期目标锚点/u)
  assert.match(prompts.system, /不要把任务改写成更安全但更泛化的目标/u)
  assert.match(prompts.user, /原始任务正文：/u)
  assert.match(prompts.user, /只返回 JSON/u)
  assert.doesNotMatch(prompts.system, /You are extracting a stable goal anchor/i)
})
