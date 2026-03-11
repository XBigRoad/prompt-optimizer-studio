import { Sparkles } from "lucide-react"

import { ModelAliasCombobox } from "@/components/ui/model-alias-combobox"
import { useI18n, useLocaleText } from "@/lib/i18n"
import type { ApiProtocol } from "@/lib/server/types"

type ProviderPreset = {
  key: string
  label: string
  baseUrl: string
  protocol: ApiProtocol
}

function getProtocolLabel(protocol: ApiProtocol, locale: "zh-CN" | "en") {
  switch (protocol) {
    case "openai-compatible":
      return "OpenAI-compatible"
    case "anthropic-native":
      return "Anthropic"
    case "gemini-native":
      return "Gemini"
    case "mistral-native":
      return "Mistral"
    case "cohere-native":
      return "Cohere"
    case "auto":
    default:
      return locale === "zh-CN" ? "自动判断" : "Auto detect"
  }
}

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
    apiProtocol: ApiProtocol
    defaultTaskModel: string
    scoreThreshold: number
    maxRounds: number
    customRubricMd: string
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
    field: "cpamcBaseUrl" | "cpamcApiKey" | "apiProtocol" | "defaultTaskModel" | "scoreThreshold" | "maxRounds" | "customRubricMd",
    value: string | number,
  ) => void
}) {
  const { locale } = useI18n()
  const text = useLocaleText()

  const providerPresets: ProviderPreset[] = [
    { key: "manual", label: text("— 手动配置 —", "— Manual setup —"), baseUrl: "", protocol: "auto" },
    { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "openai-compatible" },
    { key: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com", protocol: "anthropic-native" },
    { key: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", protocol: "gemini-native" },
    { key: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", protocol: "mistral-native" },
    { key: "cohere", label: "Cohere", baseUrl: "https://api.cohere.com", protocol: "cohere-native" },
    { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", protocol: "openai-compatible" },
    { key: "kimi", label: "Moonshot (Kimi)", baseUrl: "https://api.moonshot.cn/v1", protocol: "openai-compatible" },
    { key: "qwen", label: locale === "zh-CN" ? "通义千问 (Qwen)" : "Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai-compatible" },
    { key: "glm", label: locale === "zh-CN" ? "智谱 (GLM)" : "GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", protocol: "openai-compatible" },
    { key: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", protocol: "openai-compatible" },
  ]

  return (
    <div className="settings-control-room">
      <section className="detail-hero settings-hero">
        <div className="settings-hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> {text("连接与策略", "Connection & policy")}</span>
          <h1>{text("配置台", "Settings Desk")}</h1>
          <p className="hero-lead">
            {text(
              "把连接、默认模型、评分标准和运行策略收进同一张工作台里：对外始终只看见 Base URL / API Key / 模型别名。",
              "Keep connection, default model, scoring, and runtime policy on one desk while the visible contract stays Base URL / API key / model alias.",
            )}
          </p>
          <p className="small">
            {text(
              "支持 OpenAI-compatible（Kimi / Qwen / GLM / DeepSeek / OpenRouter 等）以及 Anthropic、Gemini、Mistral、Cohere 官方接口。",
              "Supports OpenAI-compatible gateways such as Kimi, Qwen, GLM, DeepSeek, and OpenRouter, plus Anthropic, Gemini, Mistral, and Cohere native APIs.",
            )}
          </p>
        </div>
      </section>

      {loading ? <div className="notice">{text("正在加载设置...", "Loading settings...")}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel settings-panel settings-connection-strip">
          <div className="section-head">
            <div className="settings-copy-stack">
              <h2 className="section-title">{text("连接", "Connection")}</h2>
              <p className="small">{text("默认自动判断协议；使用反代或企业网关时，可以手动指定接口协议来保证可用性。", "Protocol detection stays automatic by default. If you use a proxy or enterprise gateway, pin the protocol manually for a stable connection.")}</p>
            </div>
            <div className="settings-inline-status">
              <span className="small">{text("协议识别", "Protocol")}</span>
              <strong>{getProtocolLabel(form.apiProtocol, locale)}</strong>
            </div>
          </div>
          <div className="form-grid settings-connection-grid">
            <label className="label">
              {text("快速选择服务商", "Quick provider preset")}
              <select
                className="input"
                value={providerPresets.find((preset) => preset.baseUrl === form.cpamcBaseUrl && preset.protocol === form.apiProtocol)?.key ?? "manual"}
                onChange={(event) => {
                  const preset = providerPresets.find((item) => item.key === event.target.value)
                  if (preset) {
                    onFormChange("cpamcBaseUrl", preset.baseUrl)
                    onFormChange("apiProtocol", preset.protocol)
                  }
                }}
              >
                {providerPresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
            </label>
            <label className="label">
              Base URL
              <input
                className="input"
                value={form.cpamcBaseUrl}
                onChange={(event) => onFormChange("cpamcBaseUrl", event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="label">
              API Key
              <input
                className="input"
                type="password"
                value={form.cpamcApiKey}
                onChange={(event) => onFormChange("cpamcApiKey", event.target.value)}
                placeholder="sk-... / AIza..."
              />
            </label>
            <label className="label">
              {text("接口协议", "API protocol")}
              <select className="input" value={form.apiProtocol} onChange={(event) => onFormChange("apiProtocol", event.target.value)}>
                <option value="auto">{text("自动判断", "Auto detect")}</option>
                <option value="openai-compatible">OpenAI-compatible</option>
                <option value="anthropic-native">Anthropic</option>
                <option value="gemini-native">Gemini</option>
                <option value="mistral-native">Mistral</option>
                <option value="cohere-native">Cohere</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="button ghost" type="button" onClick={onRefreshModels} disabled={loadingModels}>{loadingModels ? text("刷新中...", "Refreshing...") : text("刷新模型列表", "Refresh model list")}</button>
            <button className="button secondary" type="button" onClick={onTestConnection} disabled={testing}>{testing ? text("测试中...", "Testing...") : text("测试连接", "Test connection")}</button>
          </div>
      </section>

      <div className="settings-grid settings-grid-compact">
        <section className="panel settings-panel settings-panel-compact">
          <div className="section-head">
            <div className="settings-copy-stack">
              <h2 className="section-title">{text("默认模型", "Default model")}</h2>
              <p className="small">{text("对外只保留单一模型别名。优化器 / 复核器在任务里共享同一个可见模型名，不暴露 provider 内部路径。", "Keep one visible model alias in the UI. Optimizer and reviewer share that alias in each task, without exposing provider internals.")}</p>
            </div>
          </div>
          <div className="form-grid">
            <ModelAliasCombobox
              inputId="settings-default-task-model"
              label={text("默认模型别名", "Default model alias")}
              value={form.defaultTaskModel}
              options={models}
              placeholder={locale === "zh-CN" ? "例如：gpt-5.2 / claude-sonnet-4 / gemini-2.5-pro" : "For example: gpt-5.2 / claude-sonnet-4 / gemini-2.5-pro"}
              disabled={loading || loadingModels}
              onChange={(next) => onFormChange("defaultTaskModel", next)}
            />
          </div>
        </section>

        <section className="panel settings-panel settings-panel-compact settings-rubric-panel">
          <div className="section-head">
            <div className="settings-copy-stack">
              <h2 className="section-title">{text("评分标准", "Scoring standard")}</h2>
              <p className="small">{text("自定义复核打分依据。留空则使用内置默认标准；支持 Markdown。", "Customize how the reviewer scores prompts. Leave it empty to use the built-in default. Markdown is supported.")}</p>
            </div>
            {form.customRubricMd ? (
              <button className="button ghost" type="button" onClick={() => onFormChange("customRubricMd", "")}>{text("恢复默认", "Restore default")}</button>
            ) : null}
          </div>
          <div className="form-grid">
            <label className="label">
              {text("全局评分标准覆写", "Global scoring override")}
              <textarea
                className="textarea"
                rows={8}
                value={form.customRubricMd}
                onChange={(event) => onFormChange("customRubricMd", event.target.value)}
                placeholder={locale === "zh-CN"
                  ? "留空表示使用内置默认标准。示例：\n\n# 自定义评分标准 (0-100)\n\n1. 目标清晰度 (20)\n2. 输出契约明确度 (20)\n3. 逻辑闭环 (20)\n4. 可执行性 (20)\n5. 鲁棒性 (20)"
                  : "Leave empty to use the built-in default. Example:\n\n# Custom scoring standard (0-100)\n\n1. Goal clarity (20)\n2. Output contract (20)\n3. Logical closure (20)\n4. Executability (20)\n5. Robustness (20)"}
              />
            </label>
          </div>
        </section>

        <section className="panel settings-panel settings-panel-compact">
          <div className="section-head">
            <div className="settings-copy-stack">
              <h2 className="section-title">{text("运行策略", "Runtime policy")}</h2>
              <p className="small">{text("这里保留会直接改变运行结果的默认值：复核阈值和默认最大轮数。", "Keep only the defaults that directly change runtime behavior here: score threshold and default max rounds.")}</p>
            </div>
            <button className="button" type="button" onClick={onSave} disabled={saving}>{saving ? text("保存中...", "Saving...") : text("保存设置", "Save settings")}</button>
          </div>
          <div className="form-grid">
            <label className="label">
              {text("分数阈值", "Score threshold")}
              <input className="input" type="number" value={form.scoreThreshold} onChange={(event) => onFormChange("scoreThreshold", Number(event.target.value))} />
            </label>
            <label className="label">
              {text("最大轮数", "Max rounds")}
              <input className="input" type="number" value={form.maxRounds} onChange={(event) => onFormChange("maxRounds", Number(event.target.value))} />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
