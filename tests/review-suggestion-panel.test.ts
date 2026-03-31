import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ReviewSuggestionPanel } from '../src/components/review-suggestion-panel'

const globalsCssPath = path.join(process.cwd(), 'src/styles/globals.css')

test('review suggestion panel renders manual-adoption copy, checkboxes, editable drafts, and restore buttons', () => {
  const html = renderToStaticMarkup(createElement(ReviewSuggestionPanel, {
    items: [
      '对海鲜、牛羊肉等高波动项增加“估价风险/可替换项”标注。',
      '补一条：若场景像首次开灶或未明示常备品，自动切换为更保守的低库存假设。',
    ],
    onAddSelected: () => {},
    adding: false,
  }))

  assert.match(html, /评审建议/)
  assert.match(html, /这些建议来自评分器，不会自动进入下一轮。勾选、改写并确认后，才会写入待生效引导。/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /textarea/)
  assert.match(html, /恢复评审建议 1 原文/)
  assert.match(html, /加入下一轮引导/)
  assert.match(html, /class="review-suggestion-list review-suggestion-grid"/)
  assert.match(html, /已加入或已存在的建议，需改写后才能再次提交/)
})

test('review suggestion panel keeps static review-only copy when manual adoption is unavailable', () => {
  const html = renderToStaticMarkup(createElement(ReviewSuggestionPanel, {
    items: ['补一条缺货替代规则。'],
  }))

  assert.match(html, /这些建议只供人工参考；系统不会自动把它们写进下一轮。/)
  assert.doesNotMatch(html, /type="checkbox"/)
  assert.doesNotMatch(html, /textarea/)
})

test('review suggestion panel renders latest-panel auto-adopt controls', () => {
  const html = renderToStaticMarkup(createElement(ReviewSuggestionPanel, {
    items: ['补一条预算冲突 fallback。'],
    onAddSelected: () => {},
    addTarget: 'stable',
    showAutoApplyControls: true,
    autoApplyEnabled: true,
    onAddTargetChange: () => {},
    onToggleAutoApply: () => {},
  }))

  assert.match(html, /加入长期规则/)
  assert.match(html, /关闭后续每轮自动采纳/)
  assert.match(html, /已加入或已存在于长期规则的建议/)
})

test('review suggestion panel css keeps desktop two-column cards and mobile single-column fallback', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')

  assert.match(source, /\.review-suggestion-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s)
  assert.match(source, /@media \(max-width:\s*1100px\)\s*\{[\s\S]*\.review-suggestion-grid[\s\S]*grid-template-columns:\s*1fr;/s)
})
