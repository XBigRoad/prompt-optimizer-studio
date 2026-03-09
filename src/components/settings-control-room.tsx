import { Link2, PlayCircle, ServerCog, Sparkles } from 'lucide-react'

export function SettingsControlRoom({
  form,
  models,
  loading,
  saving,
  testing,
  loadingModels,
  message,
  error,
  onSave,
  onTestConnection,
  onRefreshModels,
  onFormChange,
}: {
  form: {
    cpamcBaseUrl: string
    cpamcApiKey: string
    defaultTaskModel: string
    scoreThreshold: number
    maxRounds: number
  }
  models: Array<{ id: string; label: string }>
  loading: boolean
  saving: boolean
  testing: boolean
  loadingModels: boolean
  message: string | null
  error: string | null
  onSave: () => void
  onTestConnection: () => void
  onRefreshModels: () => void
  onFormChange: (
    field: 'cpamcBaseUrl' | 'cpamcApiKey' | 'defaultTaskModel' | 'scoreThreshold' | 'maxRounds',
    value: string | number,
  ) => void
}) {
  return (
    <div className="settings-control-room">
      <section className="detail-hero">
        <div className="detail-hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={16} /> 配置台</span>
            <h1>配置台</h1>
            <p className="hero-lead">用同一套 Base URL / API Key / 模型别名，接入 OpenAI-compatible、Anthropic 官方和 Gemini 官方接口。</p>
          </div>
          <div className="summary-cluster">
            <div className="summary-card tone-pending">
              <div className="small">默认模型</div>
              <div className="summary-value">{form.defaultTaskModel || '未配置'}</div>
            </div>
            <div className="summary-card tone-running">
              <div className="small">协议识别</div>
              <div className="summary-value">自动判断</div>
            </div>
          </div>
        </div>
      </section>

      {loading ? <div className="notice">正在加载设置...</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow"><Link2 size={16} /> 连接</span>
              <h2 className="section-title">连接</h2>
              <p className="small">前台始终只填 Base URL 和 API Key，后端会自动选择兼容接口、Anthropic 原生接口或 Gemini 原生接口。</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="label">
              Base URL
              <input
                className="input"
                value={form.cpamcBaseUrl}
                onChange={(event) => onFormChange('cpamcBaseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="label">
              API Key
              <input
                className="input"
                type="password"
                value={form.cpamcApiKey}
                onChange={(event) => onFormChange('cpamcApiKey', event.target.value)}
                placeholder="sk-... / AIza..."
              />
            </label>
          </div>
          <div className="button-row">
            <button className="button ghost" type="button" onClick={onRefreshModels} disabled={loadingModels}>{loadingModels ? '刷新中...' : '刷新模型列表'}</button>
            <button className="button secondary" type="button" onClick={onTestConnection} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow"><ServerCog size={16} /> 默认模型</span>
              <h2 className="section-title">默认模型</h2>
              <p className="small">对外只保留单一模型别名。optimizer / reviewer 在任务里共享同一个可见模型名，不暴露 provider 内部路径。</p>
            </div>
          </div>
          <datalist id="model-aliases">
            {models.map((model) => <option key={model.id} value={model.id} />)}
          </datalist>
          <div className="form-grid">
            <label className="label">
              默认模型别名
              <input className="input" list="model-aliases" value={form.defaultTaskModel} onChange={(event) => onFormChange('defaultTaskModel', event.target.value)} placeholder="例如：gpt-5.2 / claude-sonnet-4 / gemini-2.5-pro" />
            </label>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow"><PlayCircle size={16} /> 运行策略</span>
              <h2 className="section-title">运行策略</h2>
              <p className="small">公开设置页只保留当前真正影响运行行为的字段：复核阈值和默认最大轮数。</p>
            </div>
            <button className="button" type="button" onClick={onSave} disabled={saving}>{saving ? '保存中...' : '保存设置'}</button>
          </div>
          <div className="form-grid">
            <label className="label">
              分数阈值
              <input className="input" type="number" value={form.scoreThreshold} onChange={(event) => onFormChange('scoreThreshold', Number(event.target.value))} />
            </label>
            <label className="label">
              最大轮数
              <input className="input" type="number" value={form.maxRounds} onChange={(event) => onFormChange('maxRounds', Number(event.target.value))} />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
