'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { SettingsControlRoom } from '@/components/settings-control-room'
import { StudioFrame } from '@/components/studio-frame'

interface SettingsForm {
  cpamcBaseUrl: string
  cpamcApiKey: string
  defaultTaskModel: string
  scoreThreshold: number
  maxRounds: number
}

interface ModelOption {
  id: string
  label: string
}

const DEFAULT_FORM: SettingsForm = {
  cpamcBaseUrl: '',
  cpamcApiKey: '',
  defaultTaskModel: '',
  scoreThreshold: 95,
  maxRounds: 8,
}

export function SettingsShell() {
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
          throw new Error(settingsPayload.error ?? 'Failed to load settings.')
        }

        if (!cancelled) {
          setForm({
            cpamcBaseUrl: settingsPayload.settings.cpamcBaseUrl,
            cpamcApiKey: settingsPayload.settings.cpamcApiKey,
            defaultTaskModel: settingsPayload.settings.defaultOptimizerModel,
            scoreThreshold: settingsPayload.settings.scoreThreshold,
            maxRounds: settingsPayload.settings.maxRounds,
          })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load settings.')
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
          defaultOptimizerModel: form.defaultTaskModel,
          defaultJudgeModel: form.defaultTaskModel,
          scoreThreshold: form.scoreThreshold,
          maxRounds: form.maxRounds,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save settings.')
      }
      setForm((current) => ({
        ...current,
        defaultTaskModel: payload.settings.defaultOptimizerModel,
        scoreThreshold: payload.settings.scoreThreshold,
        maxRounds: payload.settings.maxRounds,
      }))
      setMessage('设置已保存。')
      setError(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings.')
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
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Connection test failed.')
      }
      setModels(payload.models ?? [])
      setMessage(payload.message ?? '连接测试通过。')
      setError(null)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Connection test failed.')
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
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to fetch models.')
      }
      setModels(payload.models)
      setMessage(`已刷新 ${payload.models.length} 个模型别名。`)
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to fetch models.')
      setMessage(null)
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <main>
      <StudioFrame title="配置台" currentPath="/settings">
        <motion.div
          className="shell"
          initial={{ opacity: 0, y: 12 }}
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
