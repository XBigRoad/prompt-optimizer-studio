# 广覆盖 API 接入与 Release 版本分发设计

日期：2026-03-11

## Summary

这次不把“支持更多模型/API”理解成一个个硬编码 provider 名单，而是改成两层策略：

- 第一层：按 **协议族** 做稳定适配
- 第二层：按 **热门平台** 做兼容映射与文案说明

这样可以在不暴露 provider 内部路径的前提下，把更多国内外常见模型平台纳入支持范围。

同时，GitHub 发布策略继续走 **tag -> Release**，让每个版本都能在 Releases 里被下载和回看；当前仓库已经有基于 `v*` tag 的自动 Release workflow，后续只需要补资产与发布说明，不需要推翻重做。

## Product Goals

### 1. 连接侧

- 前台仍然以 `Base URL / API Key / 模型名` 为主
- 不把 provider 内部 path 暴露给用户
- 对热门国内外平台做到“能接就接”，而不是只写死 3 家
- 允许官方原生接口，也允许 OpenAI-compatible 平台

### 2. 发布侧

- 每个版本都能在 GitHub Releases 找到
- 每个版本至少可下载源码
- 后续可选再附带自托管/Docker 使用资产
- 历史版本不覆盖，保留可追溯下载链路

## Decision 1：按协议族支持，而不是按 provider 名单堆砌

推荐支持矩阵：

### A. `openai-compatible`（默认主干）

这是覆盖面最大的基础协议。优先支持：

- OpenAI 官方 `/v1/models`
- OpenAI 官方 `/v1/chat/completions`
- 可逐步补 `responses`

这一层可以直接覆盖大量平台，包括但不限于：

- OpenAI 官方
- Groq
- DeepSeek
- OpenRouter
- Together
- Fireworks
- DashScope / 百炼兼容模式
- SiliconFlow
- 许多企业代理网关和自建代理层

官方参考：

- OpenAI Models API：<https://platform.openai.com/docs/api-reference/models>
- Groq OpenAI Compatibility：<https://console.groq.com/docs/openai>
- DeepSeek API Docs：<https://api-docs.deepseek.com/>
- 阿里云百炼 OpenAI 兼容说明：<https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api>

### B. `anthropic-native`

原生接口走 Anthropic Messages API。

官方参考：

- Anthropic Getting Started：<https://docs.anthropic.com/en/api/getting-started>

补充说明：

- Anthropic 在 2025 年也提供了 OpenAI-compatible endpoint
- 但仍建议保留原生 `Messages` 适配层，避免长期被兼容层限制

官方参考：

- Anthropic API release notes：<https://docs.anthropic.com/en/release-notes/api>

### C. `gemini-native`

原生接口走 Gemini `generateContent` 与 `models.list`。

官方参考：

- Gemini Generate Content：<https://ai.google.dev/api/generate-content>
- Gemini Models List：<https://ai.google.dev/api/rest/generativelanguage/models/list>

补充说明：

- Gemini 也提供 OpenAI compatibility 文档
- 但原生接口对模型列举、能力扩展、后续多模态兼容更稳

官方参考：

- Gemini OpenAI compatibility：<https://ai.google.dev/gemini-api/docs/openai>

### D. `mistral-native`

原生接口走 Mistral `POST /v1/chat/completions` 和模型接口。

官方参考：

- Mistral Quickstart：<https://docs.mistral.ai/getting-started/quickstart/>
- Mistral API Specs：<https://docs.mistral.ai/api>

### E. `cohere-native`

原生接口走 Cohere Chat API。

官方参考：

- Cohere Chat API：<https://docs.cohere.com/docs/chat-api>

## Decision 2：UI 保持三字段主心智，但增加“协议类型”兜底

只靠 Base URL 自动判断虽然简洁，但不够可靠：

- 自定义反代域名会让 host 检测失效
- 同一 provider 可能同时提供兼容接口和原生接口
- 企业网关可能用统一域名转发多个协议

推荐交互：

- 主字段仍然是：
  - `Base URL`
  - `API Key`
  - `模型名`
- 增加一个轻量字段：
  - `接口协议`

建议枚举：

- `自动判断`
- `OpenAI-compatible`
- `Anthropic`
- `Gemini`
- `Mistral`
- `Cohere`

语义：

- 默认 `自动判断`
- 当命中已知 host 时，后台自动选择协议
- 当用户使用反代或企业网关时，可手动覆盖

这样既满足“前台仍以 Base URL / API Key / 模型名为主”，又避免自动判断失灵时彻底不可用。

## Decision 3：热门平台覆盖方式

对“现阶段国内外比较火的都要支持”，建议采用下面的实现原则：

### Tier 1：一线稳定支持

- OpenAI
- Anthropic
- Gemini
- Mistral
- Cohere
- 所有 OpenAI-compatible 平台

### Tier 2：通过 `openai-compatible` 明确宣称兼容

文案上可以明确写“常见兼容平台包括但不限于”：

- Groq
- DeepSeek
- DashScope / 百炼兼容模式
- OpenRouter
- Together
- Fireworks
- SiliconFlow

这样做的好处：

- 实现上不需要为每个平台单独写一套 UI
- 对用户承诺的是“协议兼容能力”，不是脆弱的 provider 白名单
- 后续新增平台时，多数只需要补文档和连接测试映射，不需要重写核心调度逻辑

## Decision 4：Release 历史版本分发沿用 GitHub Releases

当前仓库已经有：

- `.github/workflows/release.yml`
- 触发条件：push `v*` tag
- 行为：执行 `npm run check` 后创建/更新 GitHub Release

这意味着：

- 每个 `vX.Y.Z` 都会在 Releases 中留下记录
- GitHub Release 页面会保留历史版本
- 用户可以下载每个版本对应的源码归档

当前 workflow 文件：

- `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/.github/workflows/release.yml`

## Decision 5：Release v0.2 增加“可直接用”的下载资产

除了 GitHub 自动提供的源码压缩包，建议后续在 release 里再附至少一类资产：

- `prompt-optimizer-studio-self-hosted-vX.Y.Z.zip`

建议内容：

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `README` 中的部署说明副本或链接

如果后续要继续增强，可再补：

- 截图包
- demo manifest
- 校验和文件

## Implementation Guidance

### Backend

- 抽象 `provider adapter` 为协议族层，而不是 provider 名层
- `test connection` 和 `fetch models` 都走同一套 adapter 接口
- 优先保证：
  - 列模型
  - 发起单轮文本生成
  - 处理错误信息

### Settings UI

- 连接区增加 `接口协议`
- 默认模型区升级为成熟 Combobox
- 文案不出现 provider 内部 path，只说协议和兼容范围

### README / Release 文案

- 不再只写“OpenAI-compatible + Anthropic + Gemini”
- 改成“支持 OpenAI-compatible + 多家官方原生接口”
- Release 页面强调：
  - 每个版本都在 Releases 可下载
  - Docker/self-hosted 用户可按 tag 选择版本

## Proposed Task Reorder

建议把当前主线优先级调整为：

1. `V0.2-02` 广覆盖 provider adapter 与协议识别
2. `V0.2-03` UI 原语成熟化与设置页搜索选择器升级
3. `V0.2-01` rubric / eval-set 配置化
4. `V0.2-04` 手动完成任务并归档
5. `V0.2-05` README / Release / assets / screenshots 收口

原因：

- 没有广覆盖连接能力，公开版价值会被立即质疑
- Release 历史版本策略已经有雏形，适合在 v0.2 一起收口

## Non-goals For This Round

- 不做 provider logo 墙式复杂 UI
- 不做每家平台单独高级参数面板
- 不把 provider 内部 path 暴露到前台
- 不为冷门平台单独写一套原生 SDK 适配

## Recommendation

下一步最值得直接开的实现任务：

- 先做 `provider adapter` 的协议层抽象
- 同步补 `接口协议` 设置字段与连接测试/模型拉取分流
- 再把设置页和详情页的模型选择器换成成熟 Combobox

Release 这边暂时不需要推倒重来：

- 保留现有 tag 驱动 Release workflow
- 在 v0.2 再补 release assets 和发布清单即可
