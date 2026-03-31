import { analyzePromptShape, describePromptShapeSignals } from '@/lib/prompt-shape'
import { formatGoalAnchorForPrompt } from '@/lib/server/goal-anchor'
import {
  isDefaultCompatibleRubricDimensions,
  parseRubricDimensions,
} from '@/lib/server/rubric-dimensions'
import type { GoalAnchor, PromptPackVersion, SteeringItem } from '@/lib/server/types'

export function compactFeedback(
  feedback: string[],
  options: { maxItems?: number; maxItemLength?: number } = {},
) {
  const maxItems = options.maxItems ?? 8
  const maxItemLength = options.maxItemLength ?? 220
  const seen = new Set<string>()
  const result: string[] = []

  for (const rawItem of feedback) {
    const item = rawItem.trim()
    if (!item || item === '[object Object]' || seen.has(item)) {
      continue
    }
    seen.add(item)
    result.push(item.length > maxItemLength ? `${item.slice(0, maxItemLength)}...` : item)
    if (result.length >= maxItems) {
      break
    }
  }

  return result
}

export function buildOptimizerPrompts(input: {
  pack: PromptPackVersion
  currentPrompt: string
  goalAnchor: GoalAnchor
  pendingSteeringItems?: SteeringItem[]
  reviewFeedbackItems?: string[]
}) {
  const language = detectPromptLanguage(input.currentPrompt)
  const system = [
    pickLanguage(language,
      '你是 Prompt Optimizer Studio 的优化器专用运行。',
      'You are Prompt Optimizer Studio. This is an optimizer-only run.',
    ),
    pickLanguage(language,
      '你的任务是优化提示词本身。你不负责评分，也不负责迎合 judge 的打分腔调。',
      'Your job is to improve the prompt itself. You do not judge it, score it, or optimize for judge phrasing.',
    ),
    pickLanguage(language,
      '把这次调用视为全新的隔离会话，不继承任何上文记忆。',
      'Treat this run as a brand-new isolated conversation with no prior memory.',
    ),
    pickLanguage(language,
      '优化结果、改动摘要与最小验证建议都必须和输入提示词保持同语种。',
      'Keep the user language consistent with the input prompt.',
    ),
    pickLanguage(language,
      '当提示词结构已经稳时优先 preserve；只有当前结构明显薄弱或损坏时才 rebuild。',
      'Use preserve when the prompt is already structurally sound; use rebuild only when the current structure is clearly weak or broken.',
    ),
    pickLanguage(language,
      '只要新增内容确实提升执行价值，合理补全是允许的；只删除重复、空壳和假完整。',
      'Reasonable added completeness is good when it adds real execution value. Only remove repetition, empty scaffolding, and fake completeness.',
    ),
    pickLanguage(language,
      '当结构已经稳住时，继续强化任务特有的决策规则、冲突优先级、不确定性边界和执行细节，而不是停在表面润色。',
      'When the structure is already sound, keep pushing on domain-specific decision rules, conflict priorities, uncertainty boundaries, and execution detail instead of stopping at cosmetic cleanup.',
    ),
    pickLanguage(language,
      '如果本次输入附带了“本地结构提示”，就必须正面处理这些结构缺口；除非这些缺口已经在当前提示词中被解决，否则不要返回与输入等价的版本。',
      'If this run includes local structure signals, you must address those structural gaps. Do not return an equivalent prompt unless the current prompt already resolves them.',
    ),
    pickLanguage(language,
      '如果本次输入附带了“本轮评分器指出的改进方向”，就必须正面处理这些缺口；这些内容已经去分数化，只代表仍待补强的方向。',
      'If this run includes same-round review guidance, you must address those gaps directly. The guidance is score-free and only represents the remaining areas to strengthen.',
    ),
    pickLanguage(language,
      '不要强塞泛化守卫章节、厚模板或仪式化脚手架给并不需要它们的提示词。',
      'Do not force generic guardrail sections, heavy templates, or ceremonial scaffolding into prompts that do not benefit from them.',
    ),
    pickLanguage(language,
      '必须返回 JSON 字段：optimizedPrompt、strategy、majorChanges、mve、deadEndSignals。',
      'Required JSON fields: optimizedPrompt, strategy, majorChanges, mve, deadEndSignals.',
    ),
    pickLanguage(language,
      'majorChanges 和 deadEndSignals 保持精炼，优先 3-6 条短句，不要长篇解释。',
      'Keep majorChanges and deadEndSignals concise. Prefer 3-6 short items, not long essays.',
    ),
    pickLanguage(language,
      '只有 CURRENT PROMPT block 内的文本才是待优化提示词；目标锚点、人工引导、边界标记和包装语都不属于提示词正文。',
      'Only the text inside the CURRENT PROMPT block is the prompt to optimize. Goal anchors, steering, boundary markers, and wrapper instructions are not part of the prompt text.',
    ),
    pickLanguage(language,
      '不要把包装语、边界标记、goal-anchor 行或评分语言复制进 optimizedPrompt。',
      'Do not copy wrapper instructions, boundary markers, goal-anchor lines, or scoring language into optimizedPrompt.',
    ),
    pickLanguage(language, '优化器专用规则包：', 'Optimizer-only rule pack:'),
    input.pack.skillMd,
    pickLanguage(language, '兜底 rebuild 参考（仅在当前提示词结构明显损坏时使用）：', 'Fallback rebuild reference (use only if the current prompt is structurally broken):'),
    input.pack.templateMd,
  ].join('\n\n')

  const steeringText = formatSteeringItemsForPrompt(input.pendingSteeringItems ?? [])
  const localStructureSignals = formatLocalStructureSignals(input.currentPrompt, language)
  const reviewFeedbackText = formatReviewFeedbackItemsForPrompt(input.reviewFeedbackItems ?? [])
  const user = [
    pickLanguage(language, '稳定目标锚点：', 'Stable goal anchor:'),
    formatGoalAnchorForPrompt(input.goalAnchor),
    pickLanguage(language, '当前提示词正文：', 'CURRENT PROMPT block:'),
    formatPromptBlock('CURRENT PROMPT', input.currentPrompt),
    ...(reviewFeedbackText ? [
      pickLanguage(language, '本轮评分器指出的改进方向（已去分数化，仅供补强参考）：', 'Same-round review guidance (score-free, for revision only):'),
      reviewFeedbackText,
    ] : []),
    ...(localStructureSignals ? [
      pickLanguage(language, '本地结构提示（仅供优化器减法/补强参考，不是评分反馈）：', 'Local structure signals (optimizer-only hints, not judge feedback):'),
      localStructureSignals,
    ] : []),
    pickLanguage(language, '下一轮人工引导：', 'User steering for the next round:'),
    steeringText,
    pickLanguage(language, '只返回 JSON。', 'Return only JSON.'),
  ].join('\n\n')

  return { system, user }
}

export function buildJudgePrompts(input: {
  pack: PromptPackVersion
  candidatePrompt: string
  goalAnchor: GoalAnchor
  threshold: number
  judgeIndex: number
}) {
  const language = detectPromptLanguage(input.candidatePrompt)
  const rubricDimensions = parseRubricDimensions(input.pack.rubricMd)
  const usesDefaultTopBandPolicy = isDefaultCompatibleRubricDimensions(rubricDimensions)
  const dimensionScoringInstructions = rubricDimensions.length > 0
    ? buildDimensionScoringInstructions(rubricDimensions, language)
    : []
  const system = [
    pickLanguage(language, `你是 Prompt Optimizer Studio 的独立评分器 #${input.judgeIndex + 1}。`, `You are isolated judge #${input.judgeIndex + 1} for Prompt Optimizer Studio.`),
    pickLanguage(language, '你不是 optimizer。请严格、独立地评审。', 'You are not the optimizer. Critique strictly and independently.'),
    pickLanguage(language, '把这次调用视为全新的隔离会话，不继承任何上文记忆。', 'Assume this is a fresh new conversation with no prior chat context.'),
    pickLanguage(language, '所有 summary、driftExplanation、findings、suggestedChanges 都必须与候选提示词保持同语种。', 'Write summary, driftExplanation, findings, and suggestedChanges in the same language as the candidate prompt.'),
    pickLanguage(language, '目标保真是硬门槛。如果候选提示词偏离目标、丢失交付物或违反漂移边界，必须将 hasMaterialIssues 设为 true，且分数不得高于 89。', 'Goal fidelity is a hard gate. If the candidate drifts from the goal, loses the deliverable, or violates the drift guard, you must set hasMaterialIssues=true and keep the score below 90.'),
    pickLanguage(language, '只有人设和标题还不够拿高分。如果提示词看起来整洁，但任务逻辑、限制条件、决策规则、边界处理或输出契约偏薄，就必须在对应 rubric 维度真实扣分。', 'A persona plus headings is not enough for a top score. If the prompt is neat but thin on task logic, constraints, decision rules, edge handling, or concrete output contract, you must deduct the corresponding rubric dimensions honestly.'),
    pickLanguage(language, '不要只因为结构整齐就给高分。高分必须建立在任务特有的决策规则、冲突处理和不确定性/证据边界之上。', 'Do not award a high score only for clean structure. High scores require task-specific decision rules, concrete conflict handling, and uncertainty or evidence boundaries that fit the domain.'),
    ...(
      usesDefaultTopBandPolicy
        ? [
          pickLanguage(language, '95+ 只留给接近生产可用的提示词：必须同时具备明确输入契约、任务特有的决策规则、冲突/异常处理和可判定的输出标准。缺少其中任一项，都不能通过高分复核。', 'Reserve 95+ for prompts that are close to production-ready: they must have a clear input contract, task-specific decision rules, conflict or edge-case handling, and verifiable output criteria. Missing any one of these should fail the high-score recheck.'),
        ]
        : []
    ),
    pickLanguage(language, '分数档位必须拉开：满分只留给几乎无可挑剔、接近生产可用的维度；80%~90% 档代表很强但仍缺 1 个非琐碎缺口；50%~70% 档代表已有部分约束但仍不稳定或不完整；0%~40% 档代表该维度基本缺失、泛化或停留在表面。', 'Use wide score bands: full marks are only for dimensions that are nearly flawless and close to production-ready; the 80%-90% band means strong but still missing one non-trivial element; the 50%-70% band means partially specified but still unstable or incomplete; the 0%-40% band means the dimension is mostly missing, generic, or surface-level.'),
    pickLanguage(language, 'summary 与 findings 必须直接描述真正缺口，不要引用具体阈值、通过门槛或分数分档；如果整体已经较强但仍不稳，就直接点名还挡路的关键维度。', 'Summary and findings must describe the real gaps directly. Do not mention numeric thresholds, passing gates, or score bands; if the prompt is already strong but still not stable, name the key blocking dimensions plainly.'),
    pickLanguage(language, '如果候选提示词本质上仍只是“你是谁 + 任务目标 + 输出几项内容”，就必须在输入契约、决策规则、异常处理和完成标准等维度真实扣分，而不是靠整体观感给高分。', 'If the candidate is still basically “who you are + the task + a list of output items”, you must deduct the input contract, decision rules, edge handling, and completion criteria dimensions directly instead of awarding a high score by vibe.'),
    pickLanguage(language, '只要增加的长度确实带来执行价值，就是允许的；真正要扣的是重复、空壳和假完整。', 'Useful length is allowed when it adds real execution value. Penalize redundancy, empty scaffolding, and fake completeness instead of length itself.'),
    pickLanguage(language, 'driftLabels 只能使用这个固定词表：goal_changed, deliverable_missing, over_safety_generalization, constraint_loss, focus_shift。', 'Use drift labels only from this fixed vocabulary: goal_changed, deliverable_missing, over_safety_generalization, constraint_loss, focus_shift.'),
    ...dimensionScoringInstructions,
    pickLanguage(
      language,
      rubricDimensions.length > 0
        ? '只返回 JSON，字段必须是：score、dimensionScores、dimensionReasons、hasMaterialIssues、summary、driftLabels、driftExplanation、findings、suggestedChanges。'
        : '只返回 JSON，字段必须是：score、hasMaterialIssues、summary、driftLabels、driftExplanation、findings、suggestedChanges。',
      rubricDimensions.length > 0
        ? 'Return JSON only with fields: score, dimensionScores, dimensionReasons, hasMaterialIssues, summary, driftLabels, driftExplanation, findings, suggestedChanges.'
        : 'Return JSON only with fields: score, hasMaterialIssues, summary, driftLabels, driftExplanation, findings, suggestedChanges.',
    ),
    pickLanguage(language, 'findings 和 suggestedChanges 必须是精炼字符串数组，每个数组最多 6 条短句。', 'Keep findings and suggestedChanges concise strings only. Each array should contain at most 6 short items.'),
    pickLanguage(language, '如果没有 drift，driftLabels 返回 []，driftExplanation 返回空字符串。', 'If there is no drift, return driftLabels as [] and driftExplanation as an empty string.'),
    pickLanguage(language, 'findings 和 suggestedChanges 中不要返回嵌套对象。', 'Do not return nested objects inside findings or suggestedChanges.'),
    pickLanguage(language, '只有 CANDIDATE PROMPT block 内的文本才是被评分提示词；不要把包装语或边界标记当作提示词内容。', 'Only the text inside the CANDIDATE PROMPT block is the prompt being judged. Do not treat wrapper instructions or boundary markers as part of the prompt.'),
    pickLanguage(language, '评分标准：', 'Scoring rubric:'),
    input.pack.rubricMd,
    pickLanguage(language, '不要重写整条提示词，只指出真正有分量的问题。', 'Do not rewrite the full prompt. Point out only material issues.'),
  ].join('\n\n')

  const user = [
    pickLanguage(language, `通过阈值：${input.threshold}（仅供内部判定，summary/findings 不得引用这个数值）`, `Passing threshold: ${input.threshold} (internal only; do not quote this number in the summary or findings).`),
    pickLanguage(language, '目标锚点：', 'Goal anchor:'),
    formatGoalAnchorForPrompt(input.goalAnchor),
    pickLanguage(language, '候选提示词正文：', 'CANDIDATE PROMPT block:'),
    formatPromptBlock('CANDIDATE PROMPT', input.candidatePrompt),
    pickLanguage(language, '只返回 JSON。', 'Return only JSON.'),
  ].join('\n\n')

  return { system, user }
}

export function buildJudgeConsistencyRepairPrompts(input: {
  candidatePrompt: string
  goalAnchor: GoalAnchor
  judgeIndex: number
  dimensionIds: string[]
  dimensionLimits: string[]
  missingSignals: string[]
}) {
  const language = detectPromptLanguage(input.candidatePrompt)
  const scoreTemplate = input.dimensionIds.map((id) => `"${id}": 0`).join(', ')
  const reasonTemplate = input.dimensionIds.map((id) => `"${id}": ""`).join(', ')
  const template = [
    '{',
    '  "score": 0,',
    `  "dimensionScores": {${scoreTemplate}},`,
    `  "dimensionReasons": {${reasonTemplate}},`,
    '  "hasMaterialIssues": true,',
    '  "summary": "",',
    '  "driftLabels": [],',
    '  "driftExplanation": "",',
    '  "findings": [],',
    '  "suggestedChanges": []',
    '}',
  ].join('\n')

  const system = [
    pickLanguage(language, `你是 Prompt Optimizer Studio 的一致性复核器 #${input.judgeIndex + 1}。`, `You are consistency verifier #${input.judgeIndex + 1} for Prompt Optimizer Studio.`),
    pickLanguage(language, '上一版 structured review 对这条薄 prompt 给出了可疑高分。现在必须重新评分，而且只能根据候选提示词正文里已经出现的直接文本证据打分。', 'The previous structured review assigned a suspiciously high score to this thin prompt. Re-score it now using only direct textual evidence already present in the candidate prompt.'),
    pickLanguage(language, '不要因为目标没漂移、表面整洁或角色名成立，就默认给高分。没有直接证据的维度必须真实扣分。', 'Do not award a high score just because the goal did not drift, the formatting is neat, or the role name is intact. Any dimension without direct evidence must lose points honestly.'),
    pickLanguage(language, '如果静态阅读已经显示缺少关键信号，就必须把这些缺口反映到分维分数、findings 与 suggestedChanges 里，而不是只写保真或表扬。', 'If static reading already shows key signals are missing, reflect those gaps in the dimension scores, findings, and suggestedChanges instead of writing only fidelity notes or praise.'),
    pickLanguage(language, `dimensionScores 与 dimensionReasons 的键必须严格使用：${input.dimensionIds.join(', ')}。`, `dimensionScores and dimensionReasons must use these exact keys: ${input.dimensionIds.join(', ')}.`),
    pickLanguage(language, `分数上限必须严格遵守：${input.dimensionLimits.join(', ')}。所有分数都必须是整数。`, `Strictly obey these score ceilings: ${input.dimensionLimits.join(', ')}. Every score must be an integer.`),
    pickLanguage(language, '只返回 JSON，字段必须是：score、dimensionScores、dimensionReasons、hasMaterialIssues、summary、driftLabels、driftExplanation、findings、suggestedChanges。', 'Return JSON only with fields: score, dimensionScores, dimensionReasons, hasMaterialIssues, summary, driftLabels, driftExplanation, findings, suggestedChanges.'),
    pickLanguage(language, '只允许返回下面这个 JSON 结构：', 'Return only this JSON shape:'),
    template,
  ].join('\n\n')

  const user = [
    pickLanguage(language, '目标锚点：', 'Goal anchor:'),
    formatGoalAnchorForPrompt(input.goalAnchor),
    pickLanguage(language, '静态阅读已发现这些缺失信号：', 'Static reading already found these missing signals:'),
    input.missingSignals.length > 0
      ? input.missingSignals.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : pickLanguage(language, 'None', 'None'),
    pickLanguage(language, '候选提示词正文：', 'CANDIDATE PROMPT block:'),
    formatPromptBlock('CANDIDATE PROMPT', input.candidatePrompt),
    pickLanguage(language, `dimensionScores 与 dimensionReasons 的键必须严格使用：${input.dimensionIds.join(', ')}。`, `dimensionScores and dimensionReasons must use these exact keys: ${input.dimensionIds.join(', ')}.`),
    pickLanguage(language, '重新做一次 evidence-bound structured review。只根据候选提示词正文已有证据打分，不要参考上一次的乐观结论。', 'Run an evidence-bound structured review now. Score only from evidence in the candidate prompt itself and do not inherit the earlier optimistic conclusion.'),
  ].join('\n\n')

  return { system, user }
}

export function buildGoalAnchorPrompts(input: {
  rawPrompt: string
}) {
  const language = detectPromptLanguage(input.rawPrompt)
  const system = [
    pickLanguage(language, '你正在为 Prompt Optimizer Studio 提取稳定的长期目标锚点。', 'You are extracting a stable goal anchor for Prompt Optimizer Studio.'),
    pickLanguage(language, '不要把任务改写成更安全但更泛化的目标。', 'Do not rewrite the task into a safer but more generic goal.'),
    pickLanguage(language, '你的职责是保留原始任务本身。', 'Your job is to preserve the original task.'),
    pickLanguage(language, '角色或人设身份不自动等于任务目标。', 'Role or persona identity is not automatically the goal.'),
    pickLanguage(language, '固定输出标题不自动等于最终交付物。', 'Fixed output headings are not automatically the deliverable.'),
    pickLanguage(language, '忽略包装语，聚焦真正的任务、交付物和漂移边界。', 'Ignore wrapper instructions and focus on the real task, deliverable, and drift boundaries.'),
    pickLanguage(language, 'goal、deliverable、driftGuard、sourceSummary、rationale 都必须与原任务保持同语种。', 'goal, deliverable, driftGuard, sourceSummary, and rationale must stay in the same language as the original task.'),
    pickLanguage(language, '只返回 JSON，字段必须是：goal、deliverable、driftGuard、sourceSummary、rationale。', 'Return JSON only with fields: goal, deliverable, driftGuard, sourceSummary, rationale.'),
    pickLanguage(language, 'driftGuard 必须是 2-4 条精炼字符串，定义什么算漂移。', 'driftGuard must be an array of 2-4 concise strings that define what counts as drift.'),
    pickLanguage(language, 'rationale 必须是 2-4 条精炼字符串，解释为什么这个锚点匹配原任务。', 'rationale must be an array of 2-4 concise strings explaining why this goal anchor matches the original task.'),
    pickLanguage(language, '不要移除核心目标、关键交付物，也不要把任务替换成泛化安全建议。', 'Do not remove the core objective, do not remove the key deliverable, and do not replace the task with generic safety advice.'),
  ].join('\n\n')

  const user = [
    pickLanguage(language, '原始任务正文：', 'ORIGINAL TASK PROMPT block:'),
    formatPromptBlock('ORIGINAL TASK PROMPT', input.rawPrompt),
    pickLanguage(language, '提取稳定的目标锚点。只返回 JSON。', 'Extract the stable goal anchor. Return only JSON.'),
  ].join('\n\n')

  return { system, user }
}

export function buildJudgeTopBandRecheckPrompts(input: {
  candidatePrompt: string
  goalAnchor: GoalAnchor
  dimensionScores: Record<string, number>
  dimensionReasons: string[]
  judgeIndex: number
}) {
  const language = detectPromptLanguage(input.candidatePrompt)
  const system = [
    pickLanguage(language, `你是 Prompt Optimizer Studio 的高分复核器 #${input.judgeIndex + 1}。`, `You are top-band verifier #${input.judgeIndex + 1} for Prompt Optimizer Studio.`),
    pickLanguage(language, '你不是重新整体评分，而是只判断这条候选提示词是否真的配得上 95+。', 'You are not rescoring the whole prompt. Only verify whether this candidate truly deserves 95+.'),
    pickLanguage(language, '95+ 的四个前提必须同时满足：明确输入契约、任务特有的决策规则、冲突/异常处理、可判定的输出标准。缺任何一项，都不能通过。', 'All four prerequisites for 95+ must be present at the same time: a clear input contract, task-specific decision rules, conflict or edge handling, and verifiable output criteria. Missing any one fails the recheck.'),
    pickLanguage(language, '只返回 JSON，字段必须是：qualifies、missingSignals、summary、findings。', 'Return JSON only with fields: qualifies, missingSignals, summary, findings.'),
    pickLanguage(language, 'missingSignals 只能使用这四个固定值：input, decision, edge, verification。', 'Use only these four fixed values for missingSignals: input, decision, edge, verification.'),
    pickLanguage(language, 'summary 和 findings 都必须与候选提示词保持同语种。', 'Write summary and findings in the same language as the candidate prompt.'),
    pickLanguage(language, 'summary 和 findings 只描述仍缺什么，不要引用 95+、通过阈值或高分分档。', 'Use summary and findings to describe only what is still missing. Do not mention 95+, the passing threshold, or score-band wording.'),
  ].join('\n\n')

  const user = [
    pickLanguage(language, '目标锚点：', 'Goal anchor:'),
    formatGoalAnchorForPrompt(input.goalAnchor),
    pickLanguage(language, '结构化分项得分：', 'Structured dimension scores:'),
    Object.entries(input.dimensionScores).map(([key, value]) => `${key}: ${value}`).join('\n'),
    pickLanguage(language, '结构化分项理由：', 'Structured dimension reasons:'),
    input.dimensionReasons.length > 0
      ? input.dimensionReasons.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : pickLanguage(language, 'None', 'None'),
    pickLanguage(language, '候选提示词正文：', 'CANDIDATE PROMPT block:'),
    formatPromptBlock('CANDIDATE PROMPT', input.candidatePrompt),
    pickLanguage(language, '只判断是否真的满足 95+，不要重写提示词。', 'Only judge whether it truly meets 95+. Do not rewrite the prompt.'),
  ].join('\n\n')

  return { system, user }
}

export function buildJudgeTopBandRegradePrompts(input: {
  candidatePrompt: string
  goalAnchor: GoalAnchor
  judgeIndex: number
  dimensions: Array<{ id: string; label: string; max: number }>
  priorDimensionScores: Record<string, number>
  priorDimensionReasons: string[]
  highBandBlockers: string[]
  missingSignals: string[]
}) {
  const language = detectPromptLanguage(input.candidatePrompt)
  const dimensionScoringInstructions = buildDimensionScoringInstructions(input.dimensions, language)
  const scoreTemplate = input.dimensions.map((dimension) => `"${dimension.id}": 0`).join(', ')
  const reasonTemplate = input.dimensions.map((dimension) => `"${dimension.id}": ""`).join(', ')
  const template = [
    '{',
    '  "score": 0,',
    `  "dimensionScores": {${scoreTemplate}},`,
    `  "dimensionReasons": {${reasonTemplate}},`,
    '  "hasMaterialIssues": true,',
    '  "summary": "",',
    '  "driftLabels": [],',
    '  "driftExplanation": "",',
    '  "findings": [],',
    '  "suggestedChanges": []',
    '}',
  ].join('\n')

  const system = [
    pickLanguage(language, `你是 Prompt Optimizer Studio 的高分重评器 #${input.judgeIndex + 1}。`, `You are top-band recalibrator #${input.judgeIndex + 1} for Prompt Optimizer Studio.`),
    pickLanguage(language, '上一版结果试图进入 95+，但关键维度门槛或高分前提没有全部满足。现在必须重做完整 structured review，并给出真实分数。', 'The previous result tried to enter 95+, but the key-dimension gate or top-band prerequisites were not fully met. Re-run the full structured review now and return the honest score.'),
    pickLanguage(language, '不要把结果机械停在 94，也不要沿用上一次的乐观总分。重新逐维评分，让总分反映真实质量层级。', 'Do not park the result at 94 and do not inherit the earlier optimistic total. Re-score dimension by dimension so the total reflects the real quality band.'),
    pickLanguage(language, '只有当关键维度都达到各自上限的 90% 以上，且高分前提齐备时，才允许进入 95+。', 'A prompt may enter 95+ only when every key dimension reaches at least 90% of its own maximum and the top-band prerequisites are all present.'),
    pickLanguage(language, 'summary 与 findings 只描述真正还缺的结构条件，不要引用 95+、通过阈值或分数分档。', 'Summary and findings must describe only the structural conditions that are still missing; do not mention 95+, the passing threshold, or score bands.'),
    ...dimensionScoringInstructions,
    pickLanguage(language, '只返回 JSON，字段必须是：score、dimensionScores、dimensionReasons、hasMaterialIssues、summary、driftLabels、driftExplanation、findings、suggestedChanges。', 'Return JSON only with fields: score, dimensionScores, dimensionReasons, hasMaterialIssues, summary, driftLabels, driftExplanation, findings, suggestedChanges.'),
    pickLanguage(language, '只允许返回下面这个 JSON 结构：', 'Return only this JSON shape:'),
    template,
  ].join('\n\n')

  const user = [
    pickLanguage(language, '目标锚点：', 'Goal anchor:'),
    formatGoalAnchorForPrompt(input.goalAnchor),
    pickLanguage(language, '上一版分维得分：', 'Previous dimension scores:'),
    Object.entries(input.priorDimensionScores).map(([key, value]) => `${key}: ${value}`).join('\n'),
    pickLanguage(language, '上一版分维理由（仅供对照，不可直接沿用）：', 'Previous dimension reasons (for comparison only, do not inherit blindly):'),
    input.priorDimensionReasons.length > 0
      ? input.priorDimensionReasons.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : pickLanguage(language, 'None', 'None'),
    pickLanguage(language, '挡住 95+ 的关键维度：', 'Key dimensions currently blocking 95+:'),
    input.highBandBlockers.length > 0
      ? input.highBandBlockers.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : pickLanguage(language, 'None', 'None'),
    pickLanguage(language, '高分复核仍指出这些缺口：', 'The top-band verification still found these missing prerequisites:'),
    input.missingSignals.length > 0
      ? input.missingSignals.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : pickLanguage(language, 'None', 'None'),
    pickLanguage(language, '候选提示词正文：', 'CANDIDATE PROMPT block:'),
    formatPromptBlock('CANDIDATE PROMPT', input.candidatePrompt),
    pickLanguage(language, '现在请重新返回完整 structured review，总分必须真实反映分维得分之和。', 'Now return the full structured review again, and make sure the total genuinely matches the dimension scores.'),
  ].join('\n\n')

  return { system, user }
}

function formatSteeringItemsForPrompt(items: SteeringItem[]) {
  if (items.length === 0) {
    return 'None'
  }

  return items
    .map((item, index) => `${index + 1}. ${item.text}`)
    .join('\n')
}

function formatReviewFeedbackItemsForPrompt(items: string[]) {
  const normalized = compactFeedback(items, { maxItems: 8, maxItemLength: 220 })
  if (normalized.length === 0) {
    return ''
  }

  return normalized
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')
}

function formatPromptBlock(label: string, prompt: string) {
  return [`<<<BEGIN ${label}>>>`, prompt, `<<<END ${label}>>>`].join('\n')
}

function formatLocalStructureSignals(prompt: string, language: 'zh-CN' | 'en') {
  const analysis = analyzePromptShape(prompt)
  const items = describePromptShapeSignals(analysis, language).slice(0, 4)

  if (!analysis.isThinShell && !analysis.isUnderSpecified && !analysis.needsDepthFollowup && items.length === 0) {
    return ''
  }

  return items.length > 0
    ? items.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : analysis.needsDepthFollowup
      ? pickLanguage(
        language,
        '1. 当前提示词已有基础结构，但还不能停在“结构已完整”；继续补足任务特有的数量映射、预算/条件分档、冲突分支或更可判定的执行细节。',
        '1. This prompt has a solid base, but do not stop at surface completeness; keep adding task-specific mappings, budget or condition bands, conflict branches, or more judgeable execution detail.',
      )
      : pickLanguage(
        language,
        '1. 当前提示词结构已基本成型，继续优先强化任务特有的决策规则与执行细节。',
        '1. The current prompt structure is already sound; keep pushing on task-specific decision rules and execution detail.',
      )
}

function buildDimensionScoringInstructions(
  dimensions: Array<{ id: string; label: string; max: number }>,
  language: 'zh-CN' | 'en',
) {
  const schema = dimensions
    .map((dimension) => `${dimension.id} = ${dimension.label} / ${dimension.max}`)
    .join('\n')
  const scoreTemplate = dimensions.map((dimension) => `"${dimension.id}": 0`).join(', ')
  const reasonTemplate = dimensions.map((dimension) => `"${dimension.id}": ""`).join(', ')
  const limitText = dimensions.map((dimension) => `${dimension.id}<=${dimension.max}`).join(', ')
  const template = [
    '{',
    '  "score": 0,',
    `  "dimensionScores": {${scoreTemplate}},`,
    `  "dimensionReasons": {${reasonTemplate}},`,
    '  "hasMaterialIssues": true,',
    '  "summary": "",',
    '  "driftLabels": [],',
    '  "driftExplanation": "",',
    '  "findings": [],',
    '  "suggestedChanges": []',
    '}',
  ].join('\n')

  return [
    pickLanguage(
      language,
      '评分时必须先按 rubric 逐项打分，再写入 dimensionScores。score 字段只保留给兼容层；系统会按 dimensionScores 本地汇总总分，不会信任你凭整体感觉拍出来的总分。',
      'You must score the rubric dimension by dimension first, then fill dimensionScores. The score field is only for compatibility; the system will recompute the total locally from dimensionScores and will not trust an overall score assigned by vibe.',
    ),
    pickLanguage(
      language,
      'dimensionScores 必须是一个对象，键名使用下面这些固定维度 id，值为 0 到该维度上限之间的整数：',
      'dimensionScores must be an object. Use the exact dimension ids below as keys, with integer values between 0 and each dimension maximum:',
    ),
    schema,
    pickLanguage(
      language,
      'dimensionReasons 也必须是一个对象，使用同样的维度 id 作为键；每个值都要是一句精炼理由，说明该维度为什么得到这个分数。',
      'dimensionReasons must also be an object keyed by the same dimension ids. Each value must be one concise reason explaining why that dimension earned its score.',
    ),
    pickLanguage(
      language,
      '各维度必须按统一分数阶梯打分：满分=几乎无可挑剔且接近生产可用；80%~90% 档=很强但仍缺 1 个非琐碎缺口；50%~70% 档=已有部分约束但仍不稳定或不完整；0%~40% 档=该维度基本缺失、泛化或停留在表面。',
      'Score every dimension with the same banding: full marks = nearly flawless and close to production-ready; the 80%-90% band = strong but still missing one non-trivial element; the 50%-70% band = partially specified but still unstable or incomplete; the 0%-40% band = mostly missing, generic, or surface-level.',
    ),
    pickLanguage(
      language,
      '不要把“基本不错”直接打成满分。只要该维度还能指出一个真实、非琐碎的缺口，就应落在次高档而不是满分。',
      'Do not jump from “pretty good” to full marks. If you can still name a real non-trivial gap in that dimension, it belongs in the next band down rather than at the maximum.',
    ),
    pickLanguage(
      language,
      '即使 summary、findings 或 suggestedChanges 很短，也必须把全部维度和对应理由补全。',
      'Even if summary, findings, or suggestedChanges are short, you must still fill every dimension and its reason.',
    ),
    pickLanguage(
      language,
      `分数上限必须严格遵守：${limitText}。所有分数都必须是整数。`,
      `Strictly obey these score ceilings: ${limitText}. Every score must be an integer.`,
    ),
    pickLanguage(
      language,
      '返回时请直接填下面这个固定 JSON 模板，不要新增字段，不要改键名，也不要自定义维度名：',
      'Fill this exact JSON template directly. Do not add fields, rename keys, or invent custom dimension ids:',
    ),
    template,
    pickLanguage(
      language,
      '如果 dimensionScores 或 dimensionReasons 缺项、超上限、不是整数或理由为空，会被视为无效结构化评分，这轮结果不会计入可信通过。',
      'If dimensionScores or dimensionReasons is missing items, exceeds maxima, uses non-integers, or leaves reasons empty, the structured review will be treated as invalid and the round will not count as a credible pass.',
    ),
  ]
}

function detectPromptLanguage(value: string): 'zh-CN' | 'en' {
  return /[\u3400-\u9fff]/.test(value) ? 'zh-CN' : 'en'
}

function pickLanguage<T>(language: 'zh-CN' | 'en', zh: T, en: T) {
  return language === 'zh-CN' ? zh : en
}
