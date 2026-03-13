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

test('dropdown surfaces keep scroll containment to avoid dragging the whole page', () => {
  const css = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/styles/globals.css',
    'utf8',
  )

  assert.match(css, /\.select-field-content,\s*\.combobox-popover\s*\{[\s\S]*overscroll-behavior:\s*contain;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*touch-action:\s*pan-y;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*scrollbar-gutter:\s*stable;/)
})

test('dropdown components stop wheel propagation at the popover layer to avoid scroll chaining into the page', () => {
  const comboboxSource = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/components/ui/model-alias-combobox.tsx',
    'utf8',
  )
  const selectSource = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/components/ui/select-field.tsx',
    'utf8',
  )

  assert.match(comboboxSource, /onWheelCapture=/)
  assert.match(comboboxSource, /onTouchMoveCapture=/)
  assert.match(selectSource, /onWheelCapture=/)
  assert.match(selectSource, /onTouchMoveCapture=/)
})

test('dropdown surfaces size themselves from Radix available height so bottom-of-screen lists stay fully reachable', () => {
  const css = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/styles/globals.css',
    'utf8',
  )

  assert.match(css, /--dropdown-available-height:\s*var\(--radix-popover-content-available-height,\s*var\(--radix-select-content-available-height,/)
  assert.match(css, /\.select-field-content,\s*\.combobox-popover\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*flex:\s*1\s+1\s+auto;[\s\S]*min-height:\s*0;/)
})

test('model alias combobox freezes a stable sorted option snapshot while open', () => {
  const source = fs.readFileSync(
    '/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/components/ui/model-alias-combobox.tsx',
    'utf8',
  )

  assert.match(source, /localeCompare\(/)
  assert.match(source, /const \[frozenOptions, setFrozenOptions\] = useState<ModelOption\[]>\(\[\]\)/)
  assert.match(source, /const visibleOptions = open \? \(frozenOptions.length > 0 \? frozenOptions : normalizedOptions\) : normalizedOptions/)
})
