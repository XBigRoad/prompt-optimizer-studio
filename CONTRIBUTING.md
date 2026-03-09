# Contributing

Thanks for contributing to Prompt Optimizer Studio. By contributing, you agree that your contributions are provided under `AGPL-3.0-only`.

## English

### Ground Rules

- Keep the product semantics intact.
- Do not weaken the final-prompt-first delivery model.
- Do not expose provider-internal paths in the UI.
- Keep reviewer isolation intact: reviewer must not see historical aggregated issue lists or one-shot steering text.
- Prefer narrow, verifiable changes over broad refactors.

### Local Setup

```bash
npm install
npm run dev
```

If you want the Docker path:

```bash
docker compose up -d --build
```

### Before Opening A PR

Run:

```bash
npm run check
```

If your change affects runtime packaging or deployment behavior, also run:

```bash
docker build -t prompt-optimizer-studio:self-hosted .
```

### Pull Request Notes

- Describe the user-visible change clearly.
- Link the relevant issue or design/plan doc when available.
- Add or update tests for behavior changes.
- Include screenshots for meaningful UI changes.
- If you need consistent README demo data before taking screenshots, run `npm run demo:seed`.
  It writes a local demo database and updates `docs/screenshots/demo-manifest.json`.
- Keep commits focused and easy to review.

## 中文

感谢你为 Prompt Optimizer Studio 做贡献。提交贡献即表示你同意这些改动将以 `AGPL-3.0-only` 的方式提供。

### 基本约束

- 不要破坏现有产品语义。
- 不要削弱“最终完整提示词优先”的交付方式。
- 不要在 UI 中暴露 provider 内部路径。
- 保持 reviewer 隔离：reviewer 不能看到历史聚合问题，也不能看到一次性的下一轮人工引导。
- 优先做范围清晰、可验证的改动，避免无关大重构。

### 本地启动

```bash
npm install
npm run dev
```

如果你要验证 Docker 路径：

```bash
docker compose up -d --build
```

### 提交 PR 前

请先运行：

```bash
npm run check
```

如果改动影响运行时打包或部署行为，再额外运行：

```bash
docker build -t prompt-optimizer-studio:self-hosted .
```

### PR 说明

- 清楚说明用户可见变化。
- 有对应 issue 或设计/计划文档时，请补上引用。
- 行为变更必须补测试或更新测试。
- 有明显 UI 变化时，请附截图。
- 如果需要先生成稳定的 README 演示数据再截图，请运行 `npm run demo:seed`。
  它会写入本地演示数据库，并更新 `docs/screenshots/demo-manifest.json`。
- 保持提交粒度清晰，方便 review。
