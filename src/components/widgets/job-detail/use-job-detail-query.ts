'use client'

import { useEffect, useState } from 'react'

import type {
  EffectiveRubricSource,
  JobDetailPayload,
  ModelOption,
  RubricPayload,
  SettingsPayload,
} from '@/components/widgets/job-detail/job-detail-types'

export function useJobDetailQuery(input: {
  jobId: string
  text: (zh: string, en: string) => string
}) {
  const { jobId, text } = input
  const [detail, setDetail] = useState<JobDetailPayload | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({ maxRounds: 8 })
  const [effectiveRubricMd, setEffectiveRubricMd] = useState('')
  const [effectiveRubricSource, setEffectiveRubricSource] = useState<EffectiveRubricSource>('default')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      try {
        const [detailResponse, modelsResponse, settingsResponse, rubricResponse] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
          fetch(`/api/jobs/${jobId}/rubric`, { cache: 'no-store' }),
        ])
        const detailPayload = await detailResponse.json()
        const modelsPayload = await modelsResponse.json()
        const settingsPayload = await settingsResponse.json()
        const rubricPayload = await rubricResponse.json().catch(() => null) as RubricPayload | null
        if (!detailResponse.ok) {
          throw new Error(detailPayload.error ?? text('任务详情加载失败。', 'Failed to load job detail.'))
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? text('设置加载失败。', 'Failed to load settings.'))
        }
        if (!cancelled) {
          setDetail(detailPayload)
          setSettings({ maxRounds: settingsPayload.settings.maxRounds })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
          if (rubricResponse.ok && rubricPayload) {
            setEffectiveRubricMd(typeof rubricPayload.rubricMd === 'string' ? rubricPayload.rubricMd : '')
            setEffectiveRubricSource(rubricPayload.source ?? 'default')
          } else {
            setEffectiveRubricMd('')
            setEffectiveRubricSource('default')
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : text('任务详情加载失败。', 'Failed to load job detail.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    timer = setInterval(() => void load(), 3000)

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [jobId, text])

  return {
    detail,
    setDetail,
    models,
    settings,
    effectiveRubricMd,
    effectiveRubricSource,
    loading,
    error,
    setError,
  }
}
