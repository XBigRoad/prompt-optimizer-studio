# Docker Self-Hosted Deployment

[Chinese](docker-self-hosted.md) | **English**

## Summary

This guide explains the recommended Docker deployment path for the current `Self-Hosted / Server Edition` of Prompt Optimizer Studio.

What you get:

- one-container self-hosted deployment
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

## Data Location

Inside the container, the default SQLite path is:

```text
/app/data/prompt-optimizer.db
```

That path is backed by the named Compose volume mounted at `/app/data`.

## Runtime Notes

- `Base URL` and `API Key` are still configured from the Config Desk.
- Requests are sent from the server container, so this deployment shape is the broadest compatibility path for OpenAI-compatible endpoints.
- Provider-internal routing details are not exposed in the UI.

## Update Flow

For the current repository-based Docker setup, rebuild and restart with:

```bash
docker compose up -d --build
```

If you later switch to a published image workflow, update with:

```bash
docker compose pull
docker compose up -d
```

## Local Repo Run Vs Docker

Local repo run:

- app files live in your cloned repository
- SQLite defaults to `data/prompt-optimizer.db` under the working directory

Docker run:

- app runs from the container
- SQLite defaults to `/app/data/prompt-optimizer.db`
- persistence depends on the mounted Docker volume
