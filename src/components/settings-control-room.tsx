import { Link2, PlayCircle, ServerCog, Sparkles } from 'lucide-react'

import { getConversationPolicyLabel } from '@/lib/presentation'

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
    judgePassCount: number
    maxRounds: number
    noImprovementLimit: number
    workerConcurrency: number
    conversationPolicy: 'stateless' | 'pooled-3x'
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
    field: 'cpamcBaseUrl' | 'cpamcApiKey' | 'defaultTaskModel' | 'scoreThreshold' | 'judgePassCount' | 'maxRounds' | 'noImprovementLimit' | 'workerConcurrency' | 'conversationPolicy',
    value: string | number,
  ) => void
}) {
  return (
    <div className="settings-control-room">
      <section className="detail-hero">
        <div className="detail-hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={16} /> 配置台</span>
            <h1>设置控制台</h1>
            <p className="hero-lead">把连接、默认模型和运行策略拆开管理，避免把“只影响新任务”和“影响运行行为”的信息混在一起。</p>
          </div>
          <div className="summary-cluster">
            <div className="summary-card tone-pending">
              <div className="small">默认模型</div>
              <div className="summary-value">{form.defaultTaskModel || '未配置'}</div>
            </div>
            <div className="summary-card tone-running">
              <div className="small">会话策略</div>
              <div className="summary-value">{getConversationPolicyLabel(form.conversationPolicy)}</div>
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
              <p className="small">这里只负责让应用能连上 CPAMC，并拿到模型别名列表。</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="label">
              CPAMC Base URL
              <input className="input" value={form.cpamcBaseUrl} onChange={(event) => onFormChange('cpamcBaseUrl', event.target.value)} placeholder="http://localhost:8317/v1" />
            </label>
            <label className="label">
              API Key
              <input className="input" type="password" value={form.cpamcApiKey} onChange={(event) => onFormChange('cpamcApiKey', event.target.value)} placeholder="sk-..." />
            </label>
          </div>
          <div className="button-row">
            <button className="button ghost" type="button" onClick={onRefreshModels} disabled={loadingModels}>{loadingModels ? '刷新中...' : '刷新模型别名'}</button>
            <button className="button secondary" type="button" onClick={onTestConnection} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow"><ServerCog size={16} /> 默认模型</span>
              <h2 className="section-title">默认模型</h2>
              <p className="small">这里只影响新任务创建时的默认快照，不会改动已有任务。</p>
            </div>
          </div>
          <datalist id="cpamc-models">
            {models.map((model) => <option key={model.id} value={model.id} />)}
          </datalist>
          <div className="form-grid">
            <label className="label">
              默认任务模型别名
              <input className="input" list="cpamc-models" value={form.defaultTaskModel} onChange={(event) => onFormChange('defaultTaskModel', event.target.value)} placeholder="例如：gpt-5.2" />
            </label>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow"><PlayCircle size={16} /> 运行策略</span>
              <h2 className="section-title">运行策略</h2>
              <p className="small">这些设置影响自动优化、复核阈值和运行时行为。</p>
            </div>
            <button className="button" type="button" onClick={onSave} disabled={saving}>{saving ? '保存中...' : '保存设置'}</button>
          </div>
          <div className="form-grid">
            <label className="label">
              分数阈值
              <input className="input" type="number" value={form.scoreThreshold} onChange={(event) => onFormChange('scoreThreshold', Number(event.target.value))} />
            </label>
            <label className="label">
              裁判数量
              <input className="input" type="number" value={form.judgePassCount} onChange={(event) => onFormChange('judgePassCount', Number(event.target.value))} />
            </label>
            <label className="label">
              最大轮数
              <input className="input" type="number" value={form.maxRounds} onChange={(event) => onFormChange('maxRounds', Number(event.target.value))} />
            </label>
            <label className="label">
              无提升上限
              <input className="input" type="number" value={form.noImprovementLimit} onChange={(event) => onFormChange('noImprovementLimit', Number(event.target.value))} />
            </label>
            <label className="label">
              并发数
              <input className="input" type="number" value={form.workerConcurrency} onChange={(event) => onFormChange('workerConcurrency', Number(event.target.value))} />
            </label>
            <label className="label">
              会话策略
              <select className="select" value={form.conversationPolicy} onChange={(event) => onFormChange('conversationPolicy', event.target.value)}>
                <option value="stateless">{getConversationPolicyLabel('stateless')}</option>
                <option value="pooled-3x">{getConversationPolicyLabel('pooled-3x')}</option>
              </select>
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
