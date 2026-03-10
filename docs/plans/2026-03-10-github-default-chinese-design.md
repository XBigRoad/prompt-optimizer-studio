# GitHub Default Chinese README Design

## Summary

GitHub repository pages can only render one `README.md` as the default landing document. That means a real in-place language toggle is not available on native GitHub repo pages. The closest experience is to make the repository default language Chinese, keep a full English mirror, and let English readers opt into the mirror explicitly.

## Decisions

- `README.md` becomes the full Chinese landing page.
- `README_EN.md` becomes the full English mirror page.
- The Chinese toggle is removed from the default homepage because the homepage is already Chinese.
- `README_EN.md` links back to the repository root via `./` so clicking Chinese returns to the default repo landing page instead of a legacy file preview.
- Root governance docs also become Chinese by default: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- English mirrors are added as `*_EN.md` files.
- Existing `*_ZH.md` files are kept as compatibility stubs so older links do not break.

## Why This Fits The Goal

This keeps GitHub-native behavior honest instead of pretending a real client-side language switch exists. It also matches the product owner preference: Chinese users open the repository and immediately land on Chinese content, while English readers still have a clean full mirror path.
