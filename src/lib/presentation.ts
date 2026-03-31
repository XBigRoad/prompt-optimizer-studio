import type { ConversationPolicy } from "@/lib/engine/conversation-policy"
import { normalizeEscapedMultilineText } from "@/lib/prompt-text"
import type { JobStatus } from "@/lib/server/types"

export type JobFailureKind = "infra" | "content"
export type JobScoreState = "available" | "not_generated"

function isEnglish(locale?: string) {
  return locale === "en"
}

function matchesInfraFailureMessage(errorMessage: string) {
  return /(fetch failed|timeout|timed out|gateway time-?out|bad gateway|the operation was aborted|etimedout|econnreset|econnrefused|socket hang up|cloudflare|upstream|network|\b50[234]\b|stream error|internal_error|received from peer|server_error)/i.test(errorMessage)
}

export function isStructuredResultFormatError(errorMessage: string | null) {
  if (!errorMessage) {
    return false
  }

  return (
    /Model did not return valid JSON\. Payload:/i.test(errorMessage)
    || /JSON at position \d+/i.test(errorMessage)
    || /Unexpected end of JSON input/i.test(errorMessage)
    || /after array element in JSON/i.test(errorMessage)
  )
}

export function getJobScoreState(job: {
  currentRound: number
  candidateCount?: number | null
  bestAverageScore?: number | null
  lastReviewScore?: number | null
}): JobScoreState {
  const hasCandidate = typeof job.candidateCount === "number"
    ? job.candidateCount > 0
    : job.currentRound > 0
  const hasReviewScore = Math.max(
    Number(job.bestAverageScore ?? 0),
    Number(job.lastReviewScore ?? 0),
  ) > 0

  return hasCandidate || hasReviewScore ? "available" : "not_generated"
}

export function getJobFailureKind(job: {
  status: JobStatus
  currentRound: number
  candidateCount?: number | null
  errorMessage: string | null
}): JobFailureKind | null {
  if (job.status !== "failed") {
    return null
  }

  if (job.errorMessage && matchesInfraFailureMessage(job.errorMessage)) {
    return "infra"
  }

  const scoreState = getJobScoreState(job)
  return scoreState === "not_generated" ? "infra" : "content"
}

export function getJobScoreDisplay(job: {
  bestAverageScore: number
  currentRound: number
  candidateCount?: number | null
  lastReviewScore?: number | null
}, locale: "zh-CN" | "en" = "zh-CN") {
  void locale
  return getJobScoreState(job) === "not_generated"
    ? "—"
    : Math.max(job.bestAverageScore, Number(job.lastReviewScore ?? 0)).toFixed(2)
}

export function getJobScoreMeta(job: {
  currentRound: number
  candidateCount?: number | null
  bestAverageScore?: number | null
  lastReviewScore?: number | null
}, locale: "zh-CN" | "en" = "zh-CN") {
  if (getJobScoreState(job) !== "not_generated") {
    return null
  }

  return isEnglish(locale) ? "No score generated yet" : "未产生成绩"
}
export function getConversationPolicyLabel(policy: ConversationPolicy, locale: "zh-CN" | "en" = "zh-CN") {
  switch (policy) {
    case "stateless":
      return isEnglish(locale) ? "Fresh conversation" : "全新对话"
    case "pooled-3x":
      return isEnglish(locale) ? "Refresh after 3 turns" : "三次后换新会话"
  }
}

export function getJobStatusLabel(status: JobStatus, locale: "zh-CN" | "en" = "zh-CN") {
  switch (status) {
    case "pending":
      return isEnglish(locale) ? "Queued" : "排队中"
    case "running":
      return isEnglish(locale) ? "Running" : "运行中"
    case "paused":
      return isEnglish(locale) ? "Paused" : "已暂停"
    case "completed":
      return isEnglish(locale) ? "Completed" : "已完成"
    case "failed":
      return isEnglish(locale) ? "Failed" : "失败"
    case "manual_review":
      return isEnglish(locale) ? "Needs review" : "人工复核"
    case "cancelled":
      return isEnglish(locale) ? "Cancelled" : "已取消"
  }
}

export function getTaskModelLabel(
  optimizerModel: string,
  judgeModel: string,
  locale: "zh-CN" | "en" = "zh-CN",
) {
  if (optimizerModel === judgeModel) {
    return optimizerModel
  }

  return isEnglish(locale)
    ? `Mixed: ${optimizerModel} / ${judgeModel}`
    : `混合：${optimizerModel} / ${judgeModel}`
}

export function resolveLatestFullPrompt(
  rawPrompt: string,
  candidates: Array<{ optimizedPrompt: string }>,
) {
  return normalizeEscapedMultilineText(candidates[0]?.optimizedPrompt ?? rawPrompt)
}

export function isDeliveredFinalRoundOutput(
  jobStatus: JobStatus,
  outputCandidateId: string | null,
  finalCandidateId: string | null,
) {
  return jobStatus === 'completed'
    && Boolean(outputCandidateId)
    && Boolean(finalCandidateId)
    && outputCandidateId === finalCandidateId
}

export function getPromptPreview(latestPrompt: string, maxLength: number = 180) {
  const compact = normalizeEscapedMultilineText(latestPrompt).replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength).trimEnd()}...`
}

export function getDashboardDecisionSummary(job: {
  status: JobStatus
  currentRound?: number
  candidateCount?: number | null
  bestAverageScore?: number
  latestPrompt: string
  errorMessage: string | null
}, locale: "zh-CN" | "en" = "zh-CN") {
  const displayError = getJobDisplayError(job.errorMessage, locale, {
    hasUsableResult: (job.currentRound ?? 0) > 0 || (job.candidateCount ?? 0) > 0 || (job.bestAverageScore ?? 0) > 0,
  })

  switch (job.status) {
    case "manual_review":
      return {
        reason: displayError ?? (
          isEnglish(locale)
            ? "This run stopped for review before the next round."
            : "这一轮已停在人工复核，正在等你确认方向后再继续。"
        ),
        nextStep: isEnglish(locale)
          ? "Check or add steering first, then decide whether to run one more round."
          : "建议先补充或检查引导，再决定继续一轮。",
        preview: displayError ? null : getPromptPreview(job.latestPrompt, 88),
      }
    case "paused":
      return {
        reason: displayError ?? (
          isEnglish(locale)
            ? "The job is currently paused and waiting for your decision."
            : "任务当前已暂停，正在等待你的下一步决定。"
        ),
        nextStep: isEnglish(locale)
          ? "If the direction is right, run one more round; if not, edit steering first."
          : "如果方向正确就继续一轮；如果要纠偏，先编辑引导。",
        preview: displayError ? null : getPromptPreview(job.latestPrompt, 88),
      }
    case "running":
      return {
        reason: isEnglish(locale)
          ? "The job is running automatically and does not need intervention right now."
          : "任务正在自动运行，当前不需要你立即介入。",
        nextStep: isEnglish(locale)
          ? "Observe the result first before adding more steering."
          : "建议先观察结果，不要同时追加新的人工引导。",
        preview: null,
      }
    default:
      return {
        reason: displayError ?? getPromptPreview(job.latestPrompt, 88),
        nextStep: isEnglish(locale)
          ? "Open the details to review the latest full prompt."
          : "打开详情，查看当前最新完整提示词。",
        preview: null,
      }
  }
}

export function partitionDashboardJobs<T extends {
  status: JobStatus
}>(jobs: T[]) {
  const active: T[] = []
  const queued: T[] = []
  const completed: T[] = []
  const history: T[] = []

  for (const job of jobs) {
    switch (job.status) {
      case "running":
      case "paused":
      case "manual_review":
        active.push(job)
        break
      case "pending":
        queued.push(job)
        break
      case "completed":
        completed.push(job)
        break
      case "failed":
      case "cancelled":
        history.push(job)
        break
    }
  }

  return {
    active: prioritizeActiveDashboardJobs(active),
    queued,
    recentCompleted: completed.slice(0, 4),
    history: [...completed.slice(4), ...history],
  }
}

export function prioritizeActiveDashboardJobs<T extends {
  status: JobStatus
}>(jobs: T[]) {
  const priority = new Map<JobStatus, number>([
    ["manual_review", 0],
    ["paused", 1],
    ["running", 2],
  ])

  return [...jobs].sort((left, right) => {
    const leftPriority = priority.get(left.status) ?? 99
    const rightPriority = priority.get(right.status) ?? 99
    return leftPriority - rightPriority
  })
}

export function focusDashboardJobs<T>(grouped: {
  active: T[]
  queued: T[]
  recentCompleted: T[]
  history: T[]
}, actionableOnly: boolean) {
  if (!actionableOnly) {
    return grouped
  }

  return {
    active: grouped.active,
    queued: [] as T[],
    recentCompleted: [] as T[],
    history: [] as T[],
  }
}

export function groupHistoryJobsByTitle<T extends {
  id: string
  title: string
  createdAt: string
}>(jobs: T[]) {
  const groups = new Map<string, { key: string; title: string; jobs: T[] }>()

  for (const job of jobs) {
    const key = normalizeDashboardTitle(job.title)
    const existing = groups.get(key)
    if (existing) {
      existing.jobs.push(job)
      continue
    }
    groups.set(key, {
      key,
      title: job.title.trim() || "未命名任务",
      jobs: [job],
    })
  }

  return [...groups.values()]
    .map((group) => {
      const jobsByRecency = [...group.jobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      return {
        ...group,
        title: jobsByRecency[0]?.title.trim() || group.title,
        jobs: jobsByRecency,
      }
    })
    .sort((left, right) => {
      const leftLatest = left.jobs[0]?.createdAt ?? ""
      const rightLatest = right.jobs[0]?.createdAt ?? ""
      return rightLatest.localeCompare(leftLatest)
    })
}

function normalizeDashboardTitle(title: string) {
  const normalized = title.replace(/\s+/g, "").trim().toLocaleLowerCase()
  return normalized || "untitled"
}

export function getJobDisplayError(
  errorMessage: string | null,
  locale: "zh-CN" | "en" = "zh-CN",
  options: { hasUsableResult?: boolean } = {},
) {
  if (!errorMessage) {
    return null
  }

  if (errorMessage === "请先配置模型名称。") {
    return isEnglish(locale)
      ? "This is a failure record from an older build. You can now change the model and restart directly."
      : "这是旧版本遗留失败记录。现在可以直接修改模型后重新开始。"
  }

  if (/^候选稿分数字段无效：/.test(errorMessage)) {
    return isEnglish(locale)
      ? "The model returned an invalid score for this round, so the result was blocked from being written. Retry directly; if it keeps happening, switch models or try again later."
      : "模型本轮返回了无效分数，系统已拦截这次结果写入。请直接重试；若反复出现，建议更换模型或稍后再试。"
  }

  if (isStructuredResultFormatError(errorMessage)) {
    return isEnglish(locale)
      ? 'The model returned an incomplete structured result, so this round could not be parsed. Retry directly; if it keeps happening, tighten the format requirement or switch models.'
      : '模型返回了格式不完整的结构化结果，系统没法继续解析这一轮。请直接重试；若反复出现，建议补充更明确的格式要求，或切换模型后再试。'
  }

  if (matchesInfraFailureMessage(errorMessage)) {
    if (options.hasUsableResult) {
      return isEnglish(locale)
        ? "This run failed at the request/provider layer, but the current result and score were preserved. Retry directly; if it keeps happening, check the gateway, model availability, or network connectivity."
        : "本次是请求层失败，但系统已保留当前结果与分数。可直接重试；若频繁出现，再看网关、模型可用性或网络连通性。"
    }

    return isEnglish(locale)
      ? "This run failed at the request/provider layer, so no score was generated. Retry directly; if it keeps happening, check the gateway, model availability, or network connectivity."
      : "本次是请求层失败，系统尚未产生成绩。可直接重试；若频繁出现，再看网关、模型可用性或网络连通性。"
  }

  return errorMessage
}

export function formatRunCount(count: number, locale: "zh-CN" | "en" = "zh-CN") {
  if (!isEnglish(locale)) {
    return `${count} 次运行`
  }

  return `${count} ${count === 1 ? 'run' : 'runs'}`
}
