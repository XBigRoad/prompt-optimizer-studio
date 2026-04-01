# Docker Self-Hosted Deployment

[Chinese](docker-self-hosted.md) | **English**

## Summary

This guide explains the recommended Docker deployment path for the current `Self-Hosted / Server Edition` of Prompt Optimizer Studio.

What you get:

- one-container self-hosted deployment
- official release image on GHCR
- SQLite persisted through a mounted Docker volume
- the same server-side worker behavior as local `npm` execution
- a simple `/api/health` endpoint for smoke checks

What this is not:

- not an official hosted browser-local edition
- not an auto-updating SaaS deployment
- not a guarantee that every browser-only environment can reach every provider

## Prerequisites

- Docker with Compose support
- an available host port, default `3000`

## Quick Start

### Option 1: Build From Source

```bash
git clone https://github.com/XBigRoad/prompt-optimizer-studio.git
cd prompt-optimizer-studio
cp .env.example .env
docker compose up -d --build
```

If you are already inside the repository, you only need:

```bash
cp .env.example .env
docker compose up -d --build
```

### Option 2: Official Image

Release builds are also published to:

```text
ghcr.io/xbigroad/prompt-optimizer-studio
```

Run directly with:

```bash
docker run -d \
  --name prompt-optimizer-studio \
  -p 3000:3000 \
  -v prompt_optimizer_data:/app/data \
  --restart unless-stopped \
  ghcr.io/xbigroad/prompt-optimizer-studio:latest
```

To pin a specific version:

```bash
ghcr.io/xbigroad/prompt-optimizer-studio:<tag>
```

If you want the newest image built from `main`, use:

```bash
ghcr.io/xbigroad/prompt-optimizer-studio:main
```

Open:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/api/health
```

## Data Location

Inside the container, the default SQLite path is:

```text
/app/data/prompt-optimizer.db
```

That path is backed by the named Compose volume mounted at `/app/data`.

## Runtime Notes

- `Base URL` and `API Key` are still configured from the Config Desk.
- The current Config Desk also supports:
  - quick provider presets
  - API protocol override
  - global scoring override
  - concurrent jobs / score threshold / max rounds
- Individual jobs can also carry their own scoring override, which helps separate experiments from production runs.
- Requests are sent from the server container, so this deployment shape is the broadest compatibility path for OpenAI-compatible endpoints.
- The current public build also includes an in-app bilingual UI toggle for Chinese and English operators.

## Update Flow

For the current repository-based Docker setup, rebuild and restart with:

```bash
docker compose up -d --build
```

If you use the official image workflow, update with:

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

## Local Repo Run Vs Docker

Local repo run:

- app files live in your cloned repository
- SQLite defaults to `data/prompt-optimizer.db` under the working directory

Docker run:

- app runs from the container
- SQLite defaults to `/app/data/prompt-optimizer.db`
- persistence depends on the mounted Docker volume
