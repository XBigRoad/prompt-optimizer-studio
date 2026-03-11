# Provider Coverage Implementation Plan

> **For Codex/Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 扩展设置与 provider adapter，使产品支持 `OpenAI-compatible + Anthropic/Gemini/Mistral/Cohere`，并允许用户通过“接口协议”在自动判断失灵时手动覆盖。

**Architecture:** 继续沿用当前 `provider-adapter -> model-adapter -> settings routes` 的结构，不引入新的 provider 路由层。后端新增 `apiProtocol` 设置字段，由 `createProviderAdapter()` 优先读取显式协议、其次回退到 Base URL 自动识别；设置页增加协议选择并把连接测试/模型拉取一起接上。实现按 TDD 进行，先锁住协议推断和设置路由，再补 UI 与集成验证。

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, SQLite-backed settings store

---

### Task 1: 扩展协议类型与 provider-adapter 单测

**Files:**
- Modify: `src/lib/server/types.ts`
- Modify: `src/lib/server/provider-adapter.ts`
- Test: `tests/provider-adapter.test.ts`

**Step 1: Write the failing test**

在 `tests/provider-adapter.test.ts` 新增这些断言：

```typescript
test('inferApiProtocol detects Mistral and Cohere official endpoints', () => {
  assert.equal(inferApiProtocol('https://api.mistral.ai/v1'), 'mistral-native')
  assert.equal(inferApiProtocol('https://api.cohere.com'), 'cohere-native')
})

test('createProviderAdapter honors explicit apiProtocol override', () => {
  const adapter = createProviderAdapter({
    cpamcBaseUrl: 'https://proxy.example.com',
    cpamcApiKey: 'key',
    apiProtocol: 'anthropic-native',
  })

  assert.equal(adapter.protocol, 'anthropic-native')
})
```

再补两组请求/模型列表测试：

```typescript
test('Mistral native adapter posts chat completions with bearer auth', async () => {
  // capture url/headers/body
  // expect https://api.mistral.ai/v1/chat/completions
})

test('Cohere native adapter posts chat endpoint with bearer auth', async () => {
  // capture url/headers/body
  // expect https://api.cohere.com/v2/chat
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test tests/provider-adapter.test.ts
```

Expected:
- FAIL，提示缺少 `mistral-native / cohere-native` 类型或适配实现

**Step 3: Write minimal implementation**

在 `src/lib/server/types.ts` 与 `src/lib/server/provider-adapter.ts`：

- 扩展 `ApiProtocol`
- 让 `createProviderAdapter()` 支持读取 `settings.apiProtocol`
- 新增 `MistralNativeProviderAdapter`
- 新增 `CohereNativeProviderAdapter`
- 为这两类协议补 `normalizeProviderModelCatalog()`

关键实现约束：

```typescript
type ApiProtocol =
  | 'auto'
  | 'openai-compatible'
  | 'anthropic-native'
  | 'gemini-native'
  | 'mistral-native'
  | 'cohere-native'
```

`createProviderAdapter()` 逻辑：

```typescript
const protocol = settings.apiProtocol && settings.apiProtocol !== 'auto'
  ? settings.apiProtocol
  : inferApiProtocol(settings.cpamcBaseUrl)
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm test tests/provider-adapter.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add tests/provider-adapter.test.ts src/lib/server/types.ts src/lib/server/provider-adapter.ts
git commit -m "feat: extend provider adapter protocol coverage"
```

### Task 2: 持久化设置中的接口协议

**Files:**
- Modify: `src/lib/server/types.ts`
- Modify: `src/lib/server/constants.ts`
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/settings.ts`
- Modify: `src/app/api/settings/route.ts`
- Test: `tests/settings-routes.test.ts`

**Step 1: Write the failing test**

在 `tests/settings-routes.test.ts` 新增：

```typescript
test('settings POST persists apiProtocol and models GET uses stored protocol', async () => {
  const settingsRoute = await import('../src/app/api/settings/route')
  const modelsRoute = await import('../src/app/api/settings/models/route')

  const saveResponse = await settingsRoute.POST(new Request('http://localhost/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      cpamcBaseUrl: 'https://proxy.example.com',
      cpamcApiKey: 'key',
      apiProtocol: 'cohere-native',
      defaultOptimizerModel: 'command-r',
      defaultJudgeModel: 'command-r',
      scoreThreshold: 95,
      maxRounds: 8,
    }),
  }))

  assert.equal(saveResponse.status, 200)
  // assert payload.settings.apiProtocol === 'cohere-native'
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test tests/settings-routes.test.ts
```

Expected:
- FAIL，提示 `apiProtocol` 未保存或未返回

**Step 3: Write minimal implementation**

修改 settings 相关文件：

- `AppSettings` 增加 `apiProtocol`
- `DEFAULT_SETTINGS` 增加 `apiProtocol: 'auto'`
- `settings` 表 schema/回填逻辑增加 `api_protocol`
- `getSettings()` / `saveSettings()` 读写 `api_protocol`
- `POST /api/settings` 接受并校验 `apiProtocol`

校验逻辑示例：

```typescript
function normalizeApiProtocol(value: unknown): AppSettings['apiProtocol'] {
  const allowed = new Set([
    'auto',
    'openai-compatible',
    'anthropic-native',
    'gemini-native',
    'mistral-native',
    'cohere-native',
  ])
  return allowed.has(String(value)) ? (value as AppSettings['apiProtocol']) : 'auto'
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm test tests/settings-routes.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add tests/settings-routes.test.ts src/lib/server/types.ts src/lib/server/constants.ts src/lib/server/db.ts src/lib/server/settings.ts src/app/api/settings/route.ts
git commit -m "feat: persist api protocol in settings"
```

### Task 3: 让模型拉取与连接测试使用协议分流

**Files:**
- Modify: `src/lib/server/models.ts`
- Modify: `src/app/api/settings/models/route.ts`
- Modify: `src/app/api/settings/test-connection/route.ts`
- Test: `tests/settings-routes.test.ts`

**Step 1: Write the failing test**

为 `POST /api/settings/models` 和 `POST /api/settings/test-connection` 增加断言，确保 body 中传入 `apiProtocol` 时会一起传给 provider adapter。

可用方式：

```typescript
mock.method(modelsModule, 'fetchCpamcModels', async (settings) => {
  assert.equal(settings.apiProtocol, 'mistral-native')
  return [{ id: 'mistral-large-latest', label: 'mistral-large-latest' }]
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test tests/settings-routes.test.ts
```

Expected:
- FAIL，说明 routes 没有透传 `apiProtocol`

**Step 3: Write minimal implementation**

更新：

- `fetchCpamcModels()` 接收 `apiProtocol`
- `settings/models` 的 GET/POST 都透传 `apiProtocol`
- `settings/test-connection` 的 POST 也透传 `apiProtocol`

**Step 4: Run test to verify it passes**

Run:

```bash
npm test tests/settings-routes.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add tests/settings-routes.test.ts src/lib/server/models.ts src/app/api/settings/models/route.ts src/app/api/settings/test-connection/route.ts
git commit -m "feat: route model discovery through selected protocol"
```

### Task 4: 设置页增加接口协议字段

**Files:**
- Modify: `src/components/settings-shell.tsx`
- Modify: `src/components/settings-control-room.tsx`
- Test: `tests/control-room-layout.test.ts`

**Step 1: Write the failing test**

在 `tests/control-room-layout.test.ts` 增加 settings 页面结构断言：

```typescript
assert.match(markup, /接口协议/)
assert.match(markup, /自动判断/)
assert.match(markup, /OpenAI-compatible/)
assert.match(markup, /Anthropic/)
assert.match(markup, /Gemini/)
assert.match(markup, /Mistral/)
assert.match(markup, /Cohere/)
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test tests/control-room-layout.test.ts
```

Expected:
- FAIL，当前 settings UI 尚未包含协议字段

**Step 3: Write minimal implementation**

在 `SettingsShell`：

- `SettingsForm` 增加 `apiProtocol`
- load/save/test/refresh payload 一并传递

在 `SettingsControlRoom`：

- 连接分区增加 `接口协议`
- 使用原生 `select` 即可，先不和 Combobox 任务耦合
- Hero 摘要卡显示当前协议（`自动判断` 或手动协议）

**Step 4: Run test to verify it passes**

Run:

```bash
npm test tests/control-room-layout.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add tests/control-room-layout.test.ts src/components/settings-shell.tsx src/components/settings-control-room.tsx
git commit -m "feat: add api protocol selector to settings"
```

### Task 5: 集成验证与文档同步

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/SESSION_STATE.md`
- Modify: `docs/HANDOFF_LOG.md`
- Optional: `docs/open-source-launch.md`

**Step 1: Run focused test suite**

Run:

```bash
npm test tests/provider-adapter.test.ts
npm test tests/settings-routes.test.ts
npm test tests/control-room-layout.test.ts
```

Expected:
- All PASS

**Step 2: Run full verification**

Run:

```bash
npm run check
```

Expected:
- `typecheck` PASS
- `test` PASS
- `build` PASS

**Step 3: Update trio docs**

- `TASKS.md`：把 `V0.2-02` 标成已完成或拆剩余子项
- `SESSION_STATE.md`：把 `next_task_id` 推进到 `V0.2-03`
- `HANDOFF_LOG.md`：记录本轮 provider adapter 与 settings 协议选择收口情况

**Step 4: Commit**

```bash
git add docs/TASKS.md docs/SESSION_STATE.md docs/HANDOFF_LOG.md docs/open-source-launch.md
git commit -m "docs: record provider coverage implementation handoff"
```
