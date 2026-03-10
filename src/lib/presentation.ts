import type { ConversationPolicy } from '@/lib/engine/conversation-policy'
import type { JobStatus } from '@/lib/server/types'

export function getConversationPolicyLabel(policy: ConversationPolicy) {
  switch (policy) {
    case 'stateless':
      return '全新对话'
    case 'pooled-3x':
      return '三次后换新会话'
  }
}

export function getJobStatusLabel(status: JobStatus) {
  switch (status) {
    case 'pending':
      return '排队中'
    case 'running':
      return '运行中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'manual_review':
      return '人工复核'
    case 'cancelled':
      return '已取消'
  }
}

export function getTaskModelLabel(optimizerModel: string, judgeModel: string) {
  if (optimizerModel === judgeModel) {
    return optimizerModel
  }

  return `混合：${optimizerModel} / ${judgeModel}`
}

export function resolveLatestFullPrompt(
  rawPrompt: string,
  candidates: Array<{ optimizedPrompt: string }>,
) {
  return candidates[0]?.optimizedPrompt ?? rawPrompt
}

export function getPromptPreview(latestPrompt: string, maxLength: number = 180) {
  const compact = latestPrompt.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength).trimEnd()}...`
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
      case 'running':
      case 'paused':
      case 'manual_review':
        active.push(job)
        break
      case 'pending':
        queued.push(job)
        break
      case 'completed':
        completed.push(job)
        break
      case 'failed':
      case 'cancelled':
        history.push(job)
        break
    }
  }

  return {
    active: prioritizeActiveDashboardJobs(active),
    queued,
    recentCompleted: completed.slice(0, 3),
    history: [...completed.slice(3), ...history],
  }
}

export function prioritizeActiveDashboardJobs<T extends {
  status: JobStatus
}>(jobs: T[]) {
  const priority = new Map<JobStatus, number>([
    ['manual_review', 0],
    ['paused', 1],
    ['running', 2],
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
      title: job.title.trim() || '未命名任务',
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
      const leftLatest = left.jobs[0]?.createdAt ?? ''
      const rightLatest = right.jobs[0]?.createdAt ?? ''
      return rightLatest.localeCompare(leftLatest)
    })
}

function normalizeDashboardTitle(title: string) {
  const normalized = title.replace(/\s+/g, '').trim().toLocaleLowerCase()
  return normalized || 'untitled'
}

export function getJobDisplayError(errorMessage: string | null) {
  if (!errorMessage) {
    return null
  }

  if (errorMessage === '请先配置模型名称。') {
    return '这是旧版本遗留失败记录。现在可以直接修改模型后重新开始。'
  }

  if (/^候选稿分数字段无效：/.test(errorMessage)) {
    return '模型本轮返回了无效分数，系统已拦截这次结果写入。请直接重试；若反复出现，建议更换模型或稍后再试。'
  }

  return errorMessage
}
