# Docker 自托管部署

**中文** | [英文](docker-self-hosted_EN.md)

## 摘要

这份文档说明当前 `Self-Hosted / Server Edition` 的推荐 Docker 部署方式。

你会得到：

- 单容器自托管部署
- 发布版官方 Docker 镜像（GHCR）
- 通过 Docker 挂载卷持久化 SQLite
- 与本地 `npm` 运行一致的服务端 worker 行为
- 用于烟雾检查的 `/api/health` 接口

这不是什么：

- 不是官方在线浏览器本地存储版
- 不是自动更新的 SaaS 托管版
- 也不代表所有只允许浏览器访问的环境都能兼容所有 provider

## 前置条件

- 已安装 Docker 与 Compose
- 可用宿主机端口，默认 `3000`

## 快速启动

### 方式 1：源码构建

```bash
git clone https://github.com/XBigRoad/prompt-optimizer-studio.git
cd prompt-optimizer-studio
cp .env.example .env
docker compose up -d --build
```

如果你已经在仓库目录里，只需要：

```bash
cp .env.example .env
docker compose up -d --build
```

### 方式 2：官方镜像

发布版会同步推送到：

```text
ghcr.io/xbigroad/prompt-optimizer-studio
```

直接运行：

```bash
docker run -d \
  --name prompt-optimizer-studio \
  -p 3000:3000 \
  -v prompt_optimizer_data:/app/data \
  --restart unless-stopped \
  ghcr.io/xbigroad/prompt-optimizer-studio:latest
```

如果要锁定具体版本：

```bash
ghcr.io/xbigroad/prompt-optimizer-studio:<tag>
```

如果你想跟主线最新提交，可以使用：

```bash
ghcr.io/xbigroad/prompt-optimizer-studio:main
```

打开：

```text
http://localhost:3000
```

健康检查：

```bash
curl http://localhost:3000/api/health
```

## 数据位置

容器内默认 SQLite 路径：

```text
/app/data/prompt-optimizer.db
```

这个路径会通过挂载到 `/app/data` 的 Compose 命名卷持久化。

## 运行说明

- `Base URL` 和 `API Key` 仍然在配置台里配置。
- 当前配置台支持：
  - `快速选择服务商`
  - `接口协议` 手动覆盖
  - `全局评分标准覆写`
  - `同时运行任务数 / 分数阈值 / 最大轮数`
- 单任务还支持任务级评分标准覆写，适合把实验任务和正式任务分开调参。
- 请求由服务端容器发出，所以它依然是兼容 OpenAI-compatible 端点最广的一种部署形态。
- 当前公开版还包含中英双语界面切换，便于团队演示与跨语言协作。

## 更新方式

对于当前这种基于仓库本地构建的 Docker 方式，推荐直接重新构建并重启：

```bash
docker compose up -d --build
```

如果你使用的是官方镜像模式，更新方式是：

```bash
docker pull ghcr.io/xbigroad/prompt-optimizer-studio:latest
docker stop prompt-optimizer-studio
docker rm prompt-optimizer-studio
docker run -d \
  --name prompt-optimizer-studio \
  -p 3000:3000 \
  -v prompt_optimizer_data:/app/data \
  --restart unless-stopped \
  ghcr.io/xbigroad/prompt-optimizer-studio:latest
```

## 本地源码运行与 Docker 运行的区别

本地源码运行：

- 应用文件直接来自你的仓库目录
- SQLite 默认写到工作目录下的 `data/prompt-optimizer.db`

Docker 运行：

- 应用在容器内运行
- SQLite 默认写到 `/app/data/prompt-optimizer.db`
- 数据是否持续保留取决于挂载卷是否存在
