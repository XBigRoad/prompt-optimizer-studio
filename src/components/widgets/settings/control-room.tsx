import { Activity, CheckCircle2, Settings2, Sparkles } from "lucide-react"

import { ModelAliasCombobox } from "@/components/shared/ui/model-alias-combobox"
import { SelectField } from "@/components/shared/ui/select-field"
import { useI18n, useLocaleText } from "@/lib/i18n"
import { buildReasoningEffortOptions } from "@/lib/reasoning-effort"
import type { ApiProtocol } from "@/lib/contracts"

type ProviderPreset = {
  key: string
  label: string
  baseUrl: string
  protocol: ApiProtocol
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
    reasoningEffort?: string
    scoreThreshold: number
    maxRounds: number
    workerConcurrency: number
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
    field: "cpamcBaseUrl" | "cpamcApiKey" | "apiProtocol" | "defaultTaskModel" | "reasoningEffort" | "scoreThreshold" | "maxRounds" | "workerConcurrency" | "customRubricMd",
    value: string | number,
  ) => void
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const reasoningEffortOptions = buildReasoningEffortOptions(locale)

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

  const protocolOptions = [
    { value: "auto", label: text("自动判断", "Auto detect") },
    { value: "openai-compatible", label: "OpenAI-compatible" },
    { value: "anthropic-native", label: "Anthropic" },
    { value: "gemini-native", label: "Gemini" },
    { value: "mistral-native", label: "Mistral" },
    { value: "cohere-native", label: "Cohere" },
  ]

  return (
    <div className="settings-control-room">
      <section className="settings-page-header" data-ui="settings-page-header">
        <h1>{text("配置台", "Settings Desk")}</h1>
        <p className="small">
          {text(
            "只需要填 Base URL 和 API Key。其余都是默认值与可选覆写，随用随改。",
            "You only need a Base URL and API key. Everything else is optional defaults and overrides.",
          )}
        </p>
      </section>

      {loading ? <div className="notice">{text("正在加载设置...", "Loading settings...")}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <form
        className="settings-form"
        data-ui="settings-connection-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <section className="panel settings-panel settings-connection-strip">
          <div className="section-head">
            <div className="settings-copy-stack">
              <h2 className="section-title has-icon">
                <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                  <Settings2 size={18} />
                </span>
                {text("连接", "Connection")}
              </h2>
              <p className="small">
                {text(
                  "协议默认自动判断。只有在网关或兼容层下才需要手动指定。",
                  "Keep protocol on auto unless you are using a gateway or compatibility layer.",
                )}
              </p>
            </div>
          </div>
          <div className="section-body-stack">
            <div className="form-grid settings-connection-grid">
              <SelectField
                label={text("快速选择服务商", "Quick provider preset")}
                value={providerPresets.find((preset) => preset.baseUrl === form.cpamcBaseUrl && preset.protocol === form.apiProtocol)?.key ?? "manual"}
                options={providerPresets.map((preset) => ({ value: preset.key, label: preset.label }))}
                onChange={(next) => {
                  const preset = providerPresets.find((item) => item.key === next)
                  if (preset) {
                    onFormChange("cpamcBaseUrl", preset.baseUrl)
                    onFormChange("apiProtocol", preset.protocol)
                  }
                }}
              />
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
              <SelectField
                label={text("接口协议", "API protocol")}
                value={form.apiProtocol}
                options={protocolOptions}
                onChange={(next) => onFormChange("apiProtocol", next)}
              />
            </div>
            <div className="button-row">
              <button className="button ghost" type="button" onClick={onRefreshModels} disabled={loadingModels}>{loadingModels ? text("刷新中...", "Refreshing...") : text("刷新模型列表", "Refresh model list")}</button>
              <button className="button secondary" type="button" onClick={onTestConnection} disabled={testing}>{testing ? text("测试中...", "Testing...") : text("测试连接", "Test connection")}</button>
            </div>
          </div>
        </section>

        <div className="settings-grid settings-grid-compact">
          <div className="settings-secondary-layout" data-ui="settings-secondary-layout">
            <div className="settings-rubric-column" data-ui="settings-rubric-column">
              <section
                className="panel settings-panel settings-panel-compact settings-rubric-panel"
                data-ui="settings-rubric-panel"
              >
                <div className="section-head">
                  <div className="settings-copy-stack">
                    <h2 className="section-title has-icon">
                      <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                        <CheckCircle2 size={18} />
                      </span>
                      {text("评分标准", "Scoring standard")}
                    </h2>
                    <p className="small">{text("自定义复核打分依据。留空则使用内置默认标准；支持 Markdown。", "Customize how the reviewer scores prompts. Leave it empty to use the built-in default. Markdown is supported.")}</p>
                  </div>
                </div>
                <div className="section-body-stack compact">
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
                  {form.customRubricMd ? (
                    <div className="settings-inline-actions">
                      <button className="button ghost" type="button" onClick={() => onFormChange("customRubricMd", "")}>{text("恢复默认", "Restore default")}</button>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="settings-side-column" data-ui="settings-side-column">
              <section
                className="panel settings-panel settings-panel-compact settings-side-panel"
                data-ui="settings-side-panel"
              >
                <div className="section-head">
                  <div className="settings-copy-stack">
                    <h2 className="section-title has-icon">
                      <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                        <Sparkles size={18} />
                      </span>
                      {text("默认模型", "Default model")}
                    </h2>
                    <p className="small">{text("统一默认任务模型。优化器 / 复核器对外共用同一别名。", "Keep one default task model. Optimizer and reviewer share the same visible alias.")}</p>
                  </div>
                </div>
                <div className="section-body-stack">
                  <div className="form-grid">
                    <ModelAliasCombobox
                      inputId="settings-default-task-model"
                      label={text("默认任务模型", "Default task model")}
                      value={form.defaultTaskModel}
                      options={models}
                      placeholder={locale === "zh-CN" ? "例如：gpt-5.2 / claude-sonnet-4 / gemini-2.5-pro" : "For example: gpt-5.2 / claude-sonnet-4 / gemini-2.5-pro"}
                      disabled={loading || loadingModels}
                      onChange={(next) => onFormChange("defaultTaskModel", next)}
                    />
                    <SelectField
                      label={text("推理强度", "Reasoning effort")}
                      value={form.reasoningEffort ?? 'default'}
                      options={reasoningEffortOptions}
                      onChange={(next) => onFormChange("reasoningEffort", next)}
                    />
                    <p className="small">
                      {text(
                        "默认同步作用于优化器和复核器。不同模型 / 网关的支持范围可能不同。",
                        "This default applies to optimizer and reviewer together. Support varies by model and gateway.",
                      )}
                    </p>
                  </div>
                </div>
              </section>

              <section
                className="panel settings-panel settings-panel-compact settings-side-panel"
                data-ui="settings-side-panel"
              >
                <div className="section-head">
                  <div className="settings-copy-stack">
                    <h2 className="section-title has-icon">
                      <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                        <Activity size={18} />
                      </span>
                      {text("运行策略", "Runtime policy")}
                    </h2>
                    <p className="small">{text("只保留 3 个会直接影响结果的默认值：并发、阈值、轮数。", "Keep only the three defaults that directly change outcomes: concurrency, threshold, and round cap.")}</p>
                  </div>
                </div>
                <div className="section-body-stack">
                  <div className="form-grid">
                    <label className="label">
                      {text("同时运行任务数", "Concurrent jobs")}
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={4}
                        value={form.workerConcurrency}
                        onChange={(event) => onFormChange("workerConcurrency", Number(event.target.value))}
                      />
                    </label>
                    <label className="label">
                      {text("分数阈值", "Score threshold")}
                      <input className="input" type="number" value={form.scoreThreshold} onChange={(event) => onFormChange("scoreThreshold", Number(event.target.value))} />
                    </label>
                    <label className="label">
                      {text("最大轮数", "Max rounds")}
                      <input className="input" type="number" value={form.maxRounds} onChange={(event) => onFormChange("maxRounds", Number(event.target.value))} />
                    </label>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="settings-save-bar" data-ui="settings-save-bar">
          <p className="small">
            {text(
              "保存后会更新新的默认连接、模型、评分标准与运行策略；已在运行的任务不会被强行改写。",
              "Saving updates the defaults for connection, model, scoring, and runtime policy without force-rewriting jobs that are already running.",
            )}
          </p>
          <button className="button" type="submit" disabled={saving}>
            {saving ? text("保存中...", "Saving...") : text("保存设置", "Save settings")}
          </button>
        </div>
      </form>
    </div>
  )
}
