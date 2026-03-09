# Docker Self-Hosted Deployment

## English

### Summary

This guide explains the recommended Docker deployment path for the current `Self-Hosted / Server Edition` of Prompt Optimizer Studio.

What you get:
- one-container self-hosted deployment,
- SQLite persisted through a mounted Docker volume,
- the same server-side worker behavior as local `npm` execution,
- a simple `/api/health` endpoint for smoke checks.

What this is not:
- not an official hosted browser-local edition,
- not an auto-updating SaaS deployment,
- not a guarantee that every browser-only environment can reach every provider.

### Prerequisites

- Docker with Compose support
- an available host port, default `3000`

### Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/api/health
```

### Data Location

Inside the container, the default SQLite path is:

```text
/app/data/prompt-optimizer.db
```

That path is backed by the named Compose volume mounted at `/app/data`.

### Runtime Notes

- Base URL and API key are still configured from the Settings page.
- Requests are sent from the server container, so this deployment shape is the broadest compatibility path for OpenAI-compatible endpoints.
- Provider-internal routing details are still not exposed in the UI.

### Update Flow

For the current repository-based Docker setup, rebuild and restart with:

```bash
docker compose up -d --build
```

If you later switch to a published image workflow, update with:

```bash
docker compose pull
docker compose up -d
```

### Local Repo Run Vs Docker

Local repo run:
- app files live in your cloned repository,
- SQLite defaults to `data/prompt-optimizer.db` under the working directory.

Docker run:
- app runs from the container,
- SQLite defaults to `/app/data/prompt-optimizer.db`,
- persistence depends on the mounted Docker volume.

## 中文

### 摘要

这份文档说明当前 `Self-Hosted / Server Edition` 的推荐 Docker 部署方式。

你会得到：
- 单容器自托管部署，
- 通过 Docker 挂载卷持久化 SQLite，
- 与本地 `npm` 运行一致的服务端 worker 行为，
- 用于烟雾检查的 `/api/health` 接口。

这不是什么：
- 不是官方在线浏览器本地存储版，
- 不是自动更新的 SaaS 托管版，
- 也不代表所有只允许浏览器访问的环境都能兼容所有 provider。

### 前置条件

- 已安装 Docker 与 Compose
- 可用宿主机端口，默认 `3000`

### 快速启动

```bash
cp .env.example .env
docker compose up -d --build
```

打开：

```text
http://localhost:3000
```

健康检查：

```bash
curl http://localhost:3000/api/health
```

### 数据位置

容器内默认 SQLite 路径：

```text
/app/data/prompt-optimizer.db
```

这个路径会通过挂载到 `/app/data` 的 Compose 命名卷持久化。

### 运行说明

- `Base URL` 和 `API Key` 仍然在设置页里配置。
- 请求由服务端容器发出，所以它依然是兼容 OpenAI-compatible 端点最广的一种部署形态。
- UI 仍不会暴露 provider 内部路由细节。

### 更新方式

对于当前这种基于仓库本地构建的 Docker 方式，推荐直接重新构建并重启：

```bash
docker compose up -d --build
```

如果后续切换成发布镜像模式，再使用：

```bash
docker compose pull
docker compose up -d
```

### 本地源码运行 与 Docker 运行 的区别

本地源码运行：
- 应用文件直接来自你的仓库目录，
- SQLite 默认写到工作目录下的 `data/prompt-optimizer.db`。

Docker 运行：
- 应用在容器内运行，
- SQLite 默认写到 `/app/data/prompt-optimizer.db`，
- 数据是否持续保留取决于挂载卷是否存在。
