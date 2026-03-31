import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('model alias combobox keeps cmdk highlight state separate from current value state', () => {
  const source = readRepoFile('src/components/ui/model-alias-combobox.tsx')

  assert.doesNotMatch(source, /data-selected=/)
  assert.match(source, /data-current=/)
})

test('dropdown surfaces keep scroll containment to avoid dragging the whole page', () => {
  const css = readRepoFile('src/styles/globals.css')

  assert.match(css, /\.select-field-content,\s*\.combobox-popover\s*\{[\s\S]*overscroll-behavior:\s*contain;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*touch-action:\s*pan-y;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*scrollbar-gutter:\s*stable;/)
})

test('dropdown components stop wheel propagation at the popover layer to avoid scroll chaining into the page', () => {
  const comboboxSource = readRepoFile('src/components/ui/model-alias-combobox.tsx')
  const selectSource = readRepoFile('src/components/ui/select-field.tsx')

  assert.match(comboboxSource, /onWheelCapture=/)
  assert.match(comboboxSource, /onTouchMoveCapture=/)
  assert.match(selectSource, /onWheelCapture=/)
  assert.match(selectSource, /onTouchMoveCapture=/)
})

test('dropdown surfaces size themselves from Radix available height so bottom-of-screen lists stay fully reachable', () => {
  const css = readRepoFile('src/styles/globals.css')

  assert.match(css, /--dropdown-available-height:\s*var\(--radix-popover-content-available-height,\s*var\(--radix-select-content-available-height,/)
  assert.match(css, /\.select-field-content,\s*\.combobox-popover\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/)
  assert.match(css, /\.select-field-viewport,\s*\.combobox-list\s*\{[\s\S]*flex:\s*1\s+1\s+auto;[\s\S]*min-height:\s*0;/)
})

test('model alias combobox freezes a stable sorted option snapshot while open', () => {
  const source = readRepoFile('src/components/ui/model-alias-combobox.tsx')

  assert.match(source, /localeCompare\(/)
  assert.match(source, /const \[frozenOptions, setFrozenOptions\] = useState<ModelOption\[]>\(\[\]\)/)
  assert.match(source, /const visibleOptions = open \? \(frozenOptions.length > 0 \? frozenOptions : normalizedOptions\) : normalizedOptions/)
})
