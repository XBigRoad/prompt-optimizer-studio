'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { SettingsControlRoom } from '@/components/settings-control-room'
import { StudioFrame } from '@/components/studio-frame'
import { useLocaleText } from '@/lib/i18n'
import type { ReasoningEffort } from '@/lib/reasoning-effort'
import type { ApiProtocol } from '@/lib/server/types'

interface SettingsForm {
  cpamcBaseUrl: string
  cpamcApiKey: string
  apiProtocol: ApiProtocol
  defaultTaskModel: string
  reasoningEffort: ReasoningEffort
  scoreThreshold: number
  maxRounds: number
  workerConcurrency: number
  customRubricMd: string
}

interface ModelOption {
  id: string
  label: string
}

const DEFAULT_FORM: SettingsForm = {
  cpamcBaseUrl: '',
  cpamcApiKey: '',
  apiProtocol: 'auto',
  defaultTaskModel: '',
  reasoningEffort: 'default',
  scoreThreshold: 95,
  maxRounds: 8,
  workerConcurrency: 2,
  customRubricMd: '',
}

export function SettingsShell() {
  const text = useLocaleText()
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [models, setModels] = useState<ModelOption[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [settingsResponse, modelsResponse] = await Promise.all([
          fetch('/api/settings', { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
        ])
        const settingsPayload = await settingsResponse.json()
        const modelsPayload = await modelsResponse.json()

        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? text('设置加载失败。', 'Failed to load settings.'))
        }

        if (!cancelled) {
          setForm({
            cpamcBaseUrl: settingsPayload.settings.cpamcBaseUrl,
            cpamcApiKey: settingsPayload.settings.cpamcApiKey,
            apiProtocol: settingsPayload.settings.apiProtocol ?? 'auto',
            defaultTaskModel: settingsPayload.settings.defaultOptimizerModel,
            reasoningEffort: settingsPayload.settings.defaultOptimizerReasoningEffort ?? 'default',
            scoreThreshold: settingsPayload.settings.scoreThreshold,
            maxRounds: settingsPayload.settings.maxRounds,
            workerConcurrency: settingsPayload.settings.workerConcurrency,
            customRubricMd: settingsPayload.settings.customRubricMd ?? '',
          })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : text('设置加载失败。', 'Failed to load settings.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpamcBaseUrl: form.cpamcBaseUrl,
          cpamcApiKey: form.cpamcApiKey,
          apiProtocol: form.apiProtocol,
          defaultOptimizerModel: form.defaultTaskModel,
          defaultJudgeModel: form.defaultTaskModel,
          defaultOptimizerReasoningEffort: form.reasoningEffort,
          defaultJudgeReasoningEffort: form.reasoningEffort,
          scoreThreshold: form.scoreThreshold,
          maxRounds: form.maxRounds,
          workerConcurrency: form.workerConcurrency,
          customRubricMd: form.customRubricMd,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('设置保存失败。', 'Failed to save settings.'))
      }
      setForm((current) => ({
        ...current,
        apiProtocol: payload.settings.apiProtocol ?? current.apiProtocol,
        defaultTaskModel: payload.settings.defaultOptimizerModel,
        reasoningEffort: payload.settings.defaultOptimizerReasoningEffort ?? current.reasoningEffort,
        scoreThreshold: payload.settings.scoreThreshold,
        maxRounds: payload.settings.maxRounds,
        workerConcurrency: payload.settings.workerConcurrency,
      }))
      setMessage(text('设置已保存。', 'Settings saved.'))
      setError(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('设置保存失败。', 'Failed to save settings.'))
      setMessage(null)
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    try {
      const response = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpamcBaseUrl: form.cpamcBaseUrl,
          cpamcApiKey: form.cpamcApiKey,
          apiProtocol: form.apiProtocol,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('连接测试失败。', 'Connection test failed.'))
      }
      setModels(payload.models ?? [])
      setMessage(payload.message ?? text('连接测试通过。', 'Connection test succeeded.'))
      setError(null)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : text('连接测试失败。', 'Connection test failed.'))
      setMessage(null)
    } finally {
      setTesting(false)
    }
  }

  async function refreshModels() {
    setLoadingModels(true)
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpamcBaseUrl: form.cpamcBaseUrl,
          cpamcApiKey: form.cpamcApiKey,
          apiProtocol: form.apiProtocol,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('拉取模型列表失败。', 'Failed to fetch models.'))
      }
      setModels(payload.models)
      setMessage(text(`已刷新 ${payload.models.length} 个模型别名。`, `Refreshed ${payload.models.length} model aliases.`))
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : text('拉取模型列表失败。', 'Failed to fetch models.'))
      setMessage(null)
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <main>
      <StudioFrame title={text('配置台', 'Settings Desk')} currentPath="/settings">
        <motion.div
          className="shell"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <SettingsControlRoom
            form={form}
            models={models}
            loading={loading}
            saving={saving}
            testing={testing}
            loadingModels={loadingModels}
            message={message}
            error={error}
            onSave={save}
            onTestConnection={testConnection}
            onRefreshModels={refreshModels}
            onFormChange={(field, value) => {
              setForm((current) => ({ ...current, [field]: value }))
            }}
          />
        </motion.div>
      </StudioFrame>
    </main>
  )
}
