import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const globalsCssPath = path.resolve(process.cwd(), 'src/styles/globals.css')
const stableRulesPanelPath = path.resolve(process.cwd(), 'src/components/widgets/job-detail/stable-rules-panel.tsx')

test('section rhythm styles avoid fixed header min-height hacks for settings and latest-results lanes', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.doesNotMatch(
    source,
    /\.settings-panel-compact\s+\.section-head\s*\{[^}]*min-height:/s,
  )

  assert.doesNotMatch(
    source,
    /\.latest-results-grid\s+\[data-ui="recent-results-column"\]\s+\.lane-header,\s*\.latest-results-grid\s+\[data-ui="history-results-column"\]\s+\.lane-header\s*\{[^}]*min-height:/s,
  )

  assert.match(source, /\.section-body-stack\s*\{/)
  assert.match(source, /\.settings-control-room\s*\{[^}]*display:\s*grid;[^}]*gap:\s*24px/s)
  assert.match(source, /\.settings-secondary-layout\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)
  assert.match(source, /\.settings-form\s*\{[^}]*display:\s*grid;[^}]*gap:\s*24px/s)
})


test('dashboard status chrome stays on the local surface and avoids browser-default blue focus', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.doesNotMatch(
    source,
    /\.summary-icon\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255/s,
  )

  assert.match(
    source,
    /\.summary-icon\s*\{[^}]*background:\s*color-mix\(/s,
  )

  assert.match(
    source,
    /\.section-title-icon\s*\{[^}]*background:\s*color-mix\(/s,
  )

  assert.match(
    source,
    /\.control-tabs-trigger:focus-visible\s*\{[^}]*box-shadow:/s,
  )

  assert.match(
    source,
    /\.control-tabs-trigger\[data-state="active"\]\s*\{[^}]*color:\s*var\(--lane-accent\)/s,
  )

  assert.match(
    source,
    /\.control-tabs-trigger\[data-lane="queued"\]\s*\{[^}]*--lane-accent:\s*var\(--seed\)/s,
  )
})


test('stable-rule cards use a single-column stack instead of a 2+1 mosaic', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.match(
    source,
    /\.compact-goal-grid\s*\{[^}]*grid-template-columns:\s*1fr/s,
  )
})

test('decision lanes cap the desktop queue width and demote prompt previews to supporting copy', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.match(
    source,
    /\.lane-grid\.decision-lane-grid\s*\{[^}]*grid-template-columns:\s*1fr/s,
  )

  assert.match(
    source,
    /@media\s*\(min-width:\s*980px\)\s*\{[\s\S]*?\.lane-grid\.decision-lane-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  )

  assert.match(
    source,
    /@media\s*\(min-width:\s*1500px\)\s*\{[\s\S]*?\.lane-grid\.decision-lane-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  )

  assert.match(
    source,
    /\.supporting-preview\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s,
  )
})

test('task scoring editor keeps button actions visibly separated from the textarea', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.match(
    source,
    /\.rubric-editor-fold\s*>\s*\.label\s*\{[^}]*padding:\s*0 14px 16px;/s,
  )

  assert.match(
    source,
    /\.rubric-editor-fold\s*>\s*\.inline-actions\s*\{[^}]*padding:\s*12px 14px 14px;/s,
  )
})

test('stable-rules note belongs to the left long-term-rules stack instead of floating below the whole two-column area', () => {
  const source = fs.readFileSync(stableRulesPanelPath, 'utf8')

  assert.match(
    source,
    /<div className="active-goal-grid compact-goal-grid" data-ui="stable-rules-goal-stack">[\s\S]*?<p className="small goal-summary-note">/s,
  )

  assert.doesNotMatch(
    source,
    /<\/div>\s*<\/div>\s*<p className="small goal-summary-note">/s,
  )
})
