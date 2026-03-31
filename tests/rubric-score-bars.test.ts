import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RubricScoreBars } from '../src/components/rubric-score-bars'

const globalsCssPath = path.join(process.cwd(), 'src/styles/globals.css')

test('rubric score bars prefer the review snapshot and render pass near miss states', () => {
  const html = renderToStaticMarkup(createElement(RubricScoreBars, {
    dimensionScores: {
      d1: 14,
      d2: 13,
      d3: 4,
    },
    rubricDimensionsSnapshot: [
      { id: 'd1', label: '旧目标清晰度', max: 15 },
      { id: 'd2', label: '旧输出契约明确度', max: 15 },
      { id: 'd3', label: '旧鲁棒性', max: 15 },
    ],
    rubricDimensions: [
      { id: 'd1', label: '新目标清晰度', max: 15 },
      { id: 'd2', label: '新输出契约明确度', max: 15 },
      { id: 'd3', label: '新鲁棒性', max: 15 },
    ],
  }))

  assert.match(html, /旧目标清晰度/)
  assert.doesNotMatch(html, /新目标清晰度/)
  assert.match(html, /rubric-score-row is-pass/)
  assert.match(html, /rubric-score-row is-near/)
  assert.match(html, /rubric-score-row is-miss/)
  assert.match(html, /14\s*\/\s*15/)
  assert.match(html, /13\s*\/\s*15/)
  assert.match(html, /4\s*\/\s*15/)
  assert.match(html, /aria-label="已达标"/)
  assert.match(html, /aria-label="未达标"/)
})

test('rubric score bars show an unstructured rubric note instead of guessing dimensions', () => {
  const html = renderToStaticMarkup(createElement(RubricScoreBars, {
    dimensionScores: {
      d1: 9,
    },
    rubricDimensions: [],
  }))

  assert.match(html, /当前评分标准不是结构化分项格式，暂不显示分项分数条。/)
  assert.doesNotMatch(html, /rubric-score-row/)
})

test('rubric score bars hide the bars when the fallback rubric cannot be safely aligned', () => {
  const html = renderToStaticMarkup(createElement(RubricScoreBars, {
    dimensionScores: {
      d1: 12,
    },
    rubricDimensions: [
      { id: 'd1', label: '目标清晰度', max: 10 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
    ],
  }))

  assert.match(html, /该轮评分标准快照不可用，暂不显示分项分数条。/)
  assert.doesNotMatch(html, /rubric-score-row/)
})

test('rubric score bar css keeps a pale solid track and watermelon fill with status emphasis classes', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8')
  const trackBlock = css.match(/\.rubric-score-track\s*\{[\s\S]*?\}/)?.[0] ?? ''
  const fillBlock = css.match(/\.rubric-score-fill\s*\{[\s\S]*?\}/)?.[0] ?? ''

  assert.match(trackBlock, /background:\s*rgba\(238,\s*241,\s*233,\s*0\.92\)/)
  assert.match(trackBlock, /border:\s*1px solid rgba\(224,\s*231,\s*221,\s*0\.94\)/)
  assert.doesNotMatch(trackBlock, /linear-gradient\(/)
  assert.match(fillBlock, /linear-gradient\(/)
  assert.match(fillBlock, /var\(--danger\)/)
  assert.match(fillBlock, /var\(--accent\)/)
  assert.match(fillBlock, /var\(--info\)/)
  assert.match(fillBlock, /var\(--ok\)/)
  assert.doesNotMatch(fillBlock, /filter:\s*saturate\(/)
  assert.match(css, /\.rubric-score-row\.is-pass[\s\S]*\.rubric-score-value/s)
  assert.match(css, /\.rubric-score-row\.is-near[\s\S]*\.rubric-score-value/s)
  assert.match(css, /\.rubric-score-row\.is-miss[\s\S]*\.rubric-score-value/s)
})
