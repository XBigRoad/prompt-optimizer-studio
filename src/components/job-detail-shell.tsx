'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { JobRoundCard, type RoundCandidateView } from '@/components/job-round-card'
import {
  getConversationPolicyLabel,
  getJobDisplayError,
  getJobStatusLabel,
  getTaskModelLabel,
  resolveLatestFullPrompt,
} from '@/lib/presentation'

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
type JobRunMode = 'auto' | 'step'

interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
  summary: string
  findings: string[]
  suggestedChanges: string[]
}

interface Candidate {
  id: string
  roundNumber: number
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  averageScore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  aggregatedIssues: string[]
  judges: JudgeRun[]
}

interface ModelOption {
  id: string
  label: string
}

interface SettingsPayload {
  maxRounds: number
}

interface JobDetailPayload {
  job: {
    id: string
    title: string
    rawPrompt: string
    optimizerModel: string
    judgeModel: string
    pendingOptimizerModel: string | null
    pendingJudgeModel: string | null
    cancelRequestedAt: string | null
    pauseRequestedAt: string | null
    nextRoundInstruction: string | null
    goalAnchor: {
      goal: string
      deliverable: string
      driftGuard: string[]
    }
    status: JobStatus
    runMode: JobRunMode
    currentRound: number
    bestAverageScore: number
    maxRoundsOverride: number | null
    passStreak: number
    lastReviewScore: number
    errorMessage: string | null
    conversationPolicy: 'stateless' | 'pooled-3x'
  }
  candidates: Candidate[]
}

export function JobDetailShell({ jobId }: { jobId: string }) {
  const [detail, setDetail] = useState<JobDetailPayload | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({ maxRounds: 8 })
  const [taskModel, setTaskModel] = useState('')
  const [maxRoundsOverrideValue, setMaxRoundsOverrideValue] = useState('')
  const [nextRoundInstruction, setNextRoundInstruction] = useState('')
  const [goalAnchorGoal, setGoalAnchorGoal] = useState('')
  const [goalAnchorDeliverable, setGoalAnchorDeliverable] = useState('')
  const [goalAnchorDriftGuardText, setGoalAnchorDriftGuardText] = useState('')
  const [modelDirty, setModelDirty] = useState(false)
  const [maxRoundsDirty, setMaxRoundsDirty] = useState(false)
  const [steeringDirty, setSteeringDirty] = useState(false)
  const [goalAnchorDirty, setGoalAnchorDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [savingModels, setSavingModels] = useState(false)
  const [savingMaxRounds, setSavingMaxRounds] = useState(false)
  const [savingSteering, setSavingSteering] = useState(false)
  const [savingGoalAnchor, setSavingGoalAnchor] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resumingStep, setResumingStep] = useState(false)
  const [resumingAuto, setResumingAuto] = useState(false)
  const [copyingPrompt, setCopyingPrompt] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      try {
        const [detailResponse, modelsResponse, settingsResponse] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
        ])
        const detailPayload = await detailResponse.json()
        const modelsPayload = await modelsResponse.json()
        const settingsPayload = await settingsResponse.json()
        if (!detailResponse.ok) {
          throw new Error(detailPayload.error ?? 'Failed to load job detail.')
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? 'Failed to load settings.')
        }
        if (!cancelled) {
          setDetail(detailPayload)
          setSettings({ maxRounds: settingsPayload.settings.maxRounds })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load job detail.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    timer = setInterval(() => {
      void load()
    }, 3000)

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [jobId])

  useEffect(() => {
    if (!detail || modelDirty) {
      return
    }

    setTaskModel(detail.job.pendingOptimizerModel ?? detail.job.optimizerModel)
  }, [detail, modelDirty])

  useEffect(() => {
    if (!detail || maxRoundsDirty) {
      return
    }

    setMaxRoundsOverrideValue(
      detail.job.maxRoundsOverride === null ? '' : String(detail.job.maxRoundsOverride),
    )
  }, [detail, maxRoundsDirty])

  useEffect(() => {
    if (!detail || steeringDirty) {
      return
    }

    setNextRoundInstruction(detail.job.nextRoundInstruction ?? '')
  }, [detail, steeringDirty])

  useEffect(() => {
    if (!detail || goalAnchorDirty) {
      return
    }

    setGoalAnchorGoal(detail.job.goalAnchor.goal)
    setGoalAnchorDeliverable(detail.job.goalAnchor.deliverable)
    setGoalAnchorDriftGuardText(detail.job.goalAnchor.driftGuard.join('\n'))
  }, [detail, goalAnchorDirty])

  const isRunning = detail?.job.status === 'running'
  const isPaused = detail?.job.status === 'paused'
  const canEdit = detail ? detail.job.status !== 'completed' : false
  const canSteer = detail ? !['completed', 'cancelled'].includes(detail.job.status) : false
  const canRestart = detail ? ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(detail.job.status) : false
  const canCancel = detail ? !['completed', 'cancelled'].includes(detail.job.status) : false
  const canPause = detail ? !['completed', 'cancelled', 'paused'].includes(detail.job.status) : false
  const canResume = detail ? !['completed', 'cancelled', 'running'].includes(detail.job.status) : false
  const scheduledModel = useMemo(() => {
    if (!detail?.job.pendingOptimizerModel && !detail?.job.pendingJudgeModel) {
      return null
    }
    return detail.job.pendingOptimizerModel ?? detail.job.optimizerModel
  }, [detail])
  const effectiveMaxRounds = detail?.job.maxRoundsOverride ?? settings.maxRounds
  const latestFullPrompt = useMemo(
    () => detail ? resolveLatestFullPrompt(detail.job.rawPrompt, detail.candidates) : '',
    [detail],
  )

  async function retry() {
    setRetrying(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Retry failed.')
      }
      setError(null)
      setActionMessage('任务已重新开始。')
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setSteeringDirty(false)
      setGoalAnchorDirty(false)
      setExpandedRounds({})
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job }, candidates: [] } : current)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Retry failed.')
      setActionMessage(null)
    } finally {
      setRetrying(false)
    }
  }

  async function saveModel() {
    setSavingModels(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optimizerModel: taskModel,
          judgeModel: taskModel,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Save failed.')
      }
      setError(null)
      setModelDirty(false)
      setActionMessage(isRunning ? '任务模型已保存，将在下一轮生效。' : '任务模型已保存。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingModels(false)
    }
  }

  async function saveMaxRoundsOverride() {
    setSavingMaxRounds(true)
    try {
      const normalizedValue = maxRoundsOverrideValue.trim()
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxRoundsOverride: normalizedValue ? Number(normalizedValue) : null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Save failed.')
      }
      setError(null)
      setMaxRoundsDirty(false)
      setActionMessage(isRunning ? '任务级最大轮数已保存，将在下一轮检查时生效。' : '任务级最大轮数已保存。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingMaxRounds(false)
    }
  }

  async function pauseTask() {
    setPausing(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Pause failed.')
      }
      setError(null)
      setActionMessage(isRunning ? '已请求暂停，当前轮结束后会停下。' : '任务已暂停。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : 'Pause failed.')
      setActionMessage(null)
    } finally {
      setPausing(false)
    }
  }

  async function resumeStep() {
    setResumingStep(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-step`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Resume step failed.')
      }
      setError(null)
      setActionMessage('任务将继续一轮，完成后会自动回到暂停。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume step failed.')
      setActionMessage(null)
    } finally {
      setResumingStep(false)
    }
  }

  async function resumeAuto() {
    setResumingAuto(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-auto`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Resume auto failed.')
      }
      setError(null)
      setActionMessage('任务已恢复自动运行。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume auto failed.')
      setActionMessage(null)
    } finally {
      setResumingAuto(false)
    }
  }

  async function saveNextRoundInstruction() {
    setSavingSteering(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextRoundInstruction,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Save failed.')
      }
      setError(null)
      setSteeringDirty(false)
      setActionMessage(
        isRunning
          ? '人工引导已保存，将在下一轮生效。'
          : '人工引导已保存，继续运行后生效。',
      )
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function saveGoalAnchor() {
    setSavingGoalAnchor(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalAnchor: {
            goal: goalAnchorGoal,
            deliverable: goalAnchorDeliverable,
            driftGuard: goalAnchorDriftGuardText
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean),
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Save failed.')
      }
      setError(null)
      setGoalAnchorDirty(false)
      setActionMessage('核心目标锚点已保存。后续所有轮次都会受它约束。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingGoalAnchor(false)
    }
  }

  async function copyLatestPrompt() {
    if (!latestFullPrompt) {
      return
    }

    setCopyingPrompt(true)
    try {
      await navigator.clipboard.writeText(latestFullPrompt)
      setActionMessage('最新完整提示词已复制。')
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Copy failed.')
      setActionMessage(null)
    } finally {
      setCopyingPrompt(false)
    }
  }

  async function cancelTask() {
    setCancelling(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Cancel failed.')
      }
      setError(null)
      setActionMessage(isRunning ? '已请求取消，当前轮结束后会停止。' : '任务已取消。')
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setSteeringDirty(false)
      setGoalAnchorDirty(false)
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Cancel failed.')
      setActionMessage(null)
    } finally {
      setCancelling(false)
    }
  }

  function toggleRound(candidateId: string) {
    setExpandedRounds((current) => ({
      ...current,
      [candidateId]: !current[candidateId],
    }))
  }

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <div className="nav-row">
            <Link href="/" className="link">返回队列</Link>
            <Link href="/settings" className="link">设置</Link>
          </div>
          {loading ? <div className="notice">正在读取任务详情...</div> : null}
          {detail ? (
            <>
              <div className="hero-grid hero-grid-tight">
                <div>
                  <h1>{detail.job.title}</h1>
                </div>
                <div className="summary-strip">
                  <span className={`status ${detail.job.status}`}>{getJobStatusLabel(detail.job.status)}</span>
                  <span className="pill pending">任务模型：{getTaskModelLabel(detail.job.optimizerModel, detail.job.judgeModel)}</span>
                  <span className="pill pending">运行模式：{detail.job.runMode === 'step' ? '单步' : '自动'}</span>
                  <span className="pill running">轮次：{detail.job.currentRound}</span>
                  <span className="pill pending">轮数上限：{effectiveMaxRounds}{detail.job.maxRoundsOverride === null ? '（全局）' : '（任务级）'}</span>
                  <span className="pill completed">连续通过：{detail.job.passStreak}</span>
                  <span className="pill completed">最佳分数：{detail.job.bestAverageScore.toFixed(2)}</span>
                  <span className="pill pending">会话：{getConversationPolicyLabel(detail.job.conversationPolicy)}</span>
                </div>
              </div>
            </>
          ) : null}
          {actionMessage ? <div className="notice success">{actionMessage}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
          {getJobDisplayError(detail?.job.errorMessage ?? null) ? <div className="notice error">{getJobDisplayError(detail?.job.errorMessage ?? null)}</div> : null}
          {detail?.job.cancelRequestedAt ? <div className="notice">已请求取消，当前轮结束后将停止，不会再开启下一轮。</div> : null}
          {detail?.job.pauseRequestedAt ? <div className="notice">已请求暂停，当前轮结束后会自动停下。</div> : null}
          {isPaused ? <div className="notice">任务当前处于暂停状态，可以继续一轮或恢复自动运行。</div> : null}
          {detail?.job.nextRoundInstruction ? <div className="notice">已保存下一轮人工引导，优化器会在下一轮读取，但不会直接拼进提示词正文。</div> : null}
          {scheduledModel ? <div className="notice">下一轮将生效的任务模型：`{scheduledModel}`。</div> : null}
        </section>

        {detail ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="section-title">当前最新完整提示词</h2>
                  <p className="small">这里始终展示你现在最应该复制使用的完整版本。若已有轮次结果，优先取最新一轮；否则回退到原始输入。</p>
                </div>
                <div className="button-row">
                  <button className="button" type="button" onClick={copyLatestPrompt} disabled={copyingPrompt || !latestFullPrompt}>
                    {copyingPrompt ? '复制中...' : '一键复制完整提示词'}
                  </button>
                </div>
              </div>
              <pre className="pre compact">{latestFullPrompt}</pre>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="section-title">核心目标锚点</h2>
                  <p className="small">这里定义这条任务真正要完成什么。结构、表达和提示词技巧可以优化，但目标与关键交付物不能漂移。</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="label">
                  核心目标
                  <textarea
                    className="textarea"
                    value={goalAnchorGoal}
                    onChange={(event) => {
                      setGoalAnchorDirty(true)
                      setGoalAnchorGoal(event.target.value)
                    }}
                    disabled={!canEdit}
                    placeholder="这条提示词最终到底要完成什么任务。"
                  />
                </label>
                <label className="label">
                  关键交付物
                  <textarea
                    className="textarea"
                    value={goalAnchorDeliverable}
                    onChange={(event) => {
                      setGoalAnchorDirty(true)
                      setGoalAnchorDeliverable(event.target.value)
                    }}
                    disabled={!canEdit}
                    placeholder="最重要的最终输出产物是什么。"
                  />
                </label>
                <label className="label">
                  防漂移条款
                  <textarea
                    className="textarea"
                    value={goalAnchorDriftGuardText}
                    onChange={(event) => {
                      setGoalAnchorDirty(true)
                      setGoalAnchorDriftGuardText(event.target.value)
                    }}
                    disabled={!canEdit}
                    placeholder="每行一条：什么样的改写会被视为偏题。"
                  />
                </label>
              </div>
              <p className="small">reviewer 会把“是否忠实于这里的核心目标和交付物”当成硬门槛；即使更安全、更规范，只要偏题也不能高分通过。</p>
              <div className="button-row">
                {canEdit ? (
                  <button className="button ghost" type="button" onClick={saveGoalAnchor} disabled={savingGoalAnchor}>
                    {savingGoalAnchor ? '保存中...' : '保存核心目标锚点'}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="section-title">任务控制</h2>
                  <p className="small">
                    {detail.job.status === 'completed'
                      ? '当前任务已经完成，只读展示。若要换模型，请基于当前结果新建任务。'
                      : isRunning
                        ? '运行中修改的任务模型或任务级最大轮数只会在下一轮检查时生效，当前请求不会被打断。'
                      : isPaused
                          ? '当前任务已暂停。你可以继续一轮、恢复自动运行，或直接调整任务模型与任务级最大轮数。'
                          : '你可以直接修改任务模型、任务级最大轮数、下一轮人工引导，或重新开始/取消任务。'}
                  </p>
                </div>
              </div>
              <datalist id="job-model-aliases">
                {models.map((model) => <option key={model.id} value={model.id} />)}
              </datalist>
              <div className="form-grid">
                <label className="label">
                  任务模型别名
                  <input
                    className="input"
                    list="job-model-aliases"
                    value={taskModel}
                    onChange={(event) => {
                      setModelDirty(true)
                      setTaskModel(event.target.value)
                    }}
                    disabled={!canEdit}
                    placeholder="例如：gpt-5.2"
                  />
                </label>
                <label className="label">
                  任务级最大轮数
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={99}
                    value={maxRoundsOverrideValue}
                    onChange={(event) => {
                      setMaxRoundsDirty(true)
                      setMaxRoundsOverrideValue(event.target.value)
                    }}
                    disabled={!canEdit}
                    placeholder={`留空则跟随全局默认 ${settings.maxRounds}`}
                  />
                </label>
                <label className="label" id="next-round-steering">
                  下一轮人工引导
                  <textarea
                    className="textarea"
                    value={nextRoundInstruction}
                    onChange={(event) => {
                      setSteeringDirty(true)
                      setNextRoundInstruction(event.target.value)
                    }}
                    disabled={!canSteer}
                    placeholder="例如：保持结构不变，只把语气改得更自然；不要继续增加规则密度。"
                  />
                </label>
              </div>
              <p className="small">
                留空表示使用全局默认最大轮数 {settings.maxRounds}。任务级覆盖只作用于当前任务，不会影响其它任务。
              </p>
              <p className="small">
                人工引导只作用于下一轮优化指令，不会直接写进最终提示词正文；它的影响会通过下一轮产出的完整提示词自然传递。
              </p>
              <div className="button-row">
                {canEdit ? (
                  <button className="button" type="button" onClick={saveModel} disabled={savingModels}>
                    {savingModels ? '保存中...' : isRunning ? '保存到下一轮' : '保存任务模型'}
                  </button>
                ) : null}
                {canSteer ? (
                  <button className="button ghost" type="button" onClick={saveNextRoundInstruction} disabled={savingSteering}>
                    {savingSteering ? '保存中...' : '保存人工引导'}
                  </button>
                ) : null}
                {canEdit ? (
                  <button className="button ghost" type="button" onClick={saveMaxRoundsOverride} disabled={savingMaxRounds}>
                    {savingMaxRounds ? '保存中...' : '保存任务级轮数'}
                  </button>
                ) : null}
                {canPause ? (
                  <button className="button secondary" type="button" onClick={pauseTask} disabled={pausing || Boolean(detail.job.pauseRequestedAt)}>
                    {pausing ? '处理中...' : isRunning ? '暂停（本轮后）' : '暂停'}
                  </button>
                ) : null}
                {canResume ? (
                  <button className="button secondary" type="button" onClick={resumeStep} disabled={resumingStep}>
                    {resumingStep ? '处理中...' : '继续一轮'}
                  </button>
                ) : null}
                {canResume ? (
                  <button className="button secondary" type="button" onClick={resumeAuto} disabled={resumingAuto}>
                    {resumingAuto ? '处理中...' : '恢复自动运行'}
                  </button>
                ) : null}
                {canRestart ? (
                  <button className="button secondary" type="button" onClick={retry} disabled={retrying}>
                    {retrying ? '处理中...' : '重新开始'}
                  </button>
                ) : null}
                {canCancel ? (
                  <button className="button danger" type="button" onClick={cancelTask} disabled={cancelling || Boolean(detail.job.cancelRequestedAt)}>
                    {cancelling ? '处理中...' : '取消任务'}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">原始输入</h2>
              <details className="fold-card">
                <summary>查看原始提示词</summary>
                <pre className="pre compact">{detail.job.rawPrompt}</pre>
              </details>
            </section>

            <section className="panel">
              <h2 className="section-title">优化过程诊断</h2>
              <p className="small">这里只保留每轮的紧凑诊断摘要。真正要复制使用的内容，请以上方“当前最新完整提示词”为准。</p>
              {detail.candidates.length === 0 ? <div className="notice">还没有产出候选稿。</div> : null}
              <div className="shell">
                {detail.candidates.map((candidate) => (
                  <JobRoundCard
                    key={candidate.id}
                    candidate={candidate as RoundCandidateView}
                    expanded={Boolean(expandedRounds[candidate.id])}
                    onToggle={() => toggleRound(candidate.id)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
