# Contributing

[Chinese](CONTRIBUTING.md) | **English**

Thanks for contributing to Prompt Optimizer Studio. By contributing, you agree that your contributions are provided under `AGPL-3.0-only`.

## Ground Rules

- Keep the product semantics intact.
- Do not weaken the final-prompt-first delivery model.
- Do not expose provider-internal paths in the UI.
- Keep reviewer isolation intact: reviewer must not see historical aggregated issue lists or one-shot steering text.
- Prefer narrow, verifiable changes over broad refactors.

## Local Setup

```bash
npm install
npm run dev
```

If you want the Docker path:

```bash
docker compose up -d --build
```

## Before Opening A PR

Run:

```bash
npm run check
```

If your change affects runtime packaging or deployment behavior, also run:

```bash
docker build -t prompt-optimizer-studio:self-hosted .
```

## Pull Request Notes

- Describe the user-visible change clearly.
- Link the relevant issue or design/plan doc when available.
- Add or update tests for behavior changes.
- Include screenshots for meaningful UI changes.
- If you need consistent README demo data before taking screenshots, run `npm run demo:seed`.
- Keep commits focused and easy to review.
