import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('model alias combobox keeps cmdk highlight state separate from current value state', () => {
  const source = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/components/ui/model-alias-combobox.tsx',
    'utf8',
  )

  assert.doesNotMatch(source, /data-selected=/)
  assert.match(source, /data-current=/)
})
