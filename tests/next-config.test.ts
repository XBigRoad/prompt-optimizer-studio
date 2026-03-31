import assert from 'node:assert/strict'
import test from 'node:test'

test('worktree runs do not hard-code turbopack root to the current cwd', async () => {
  const configUrl = new URL('../next.config.mjs', import.meta.url)
  const { default: nextConfig } = await import(configUrl.href) as {
    default: { turbopack?: { root?: string } }
  }

  assert.notEqual(nextConfig.turbopack?.root, process.cwd())
})
