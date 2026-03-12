import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { StudioFrame } from '../src/components/studio-frame'

test('studio frame renders a left navigation rail', () => {
  const html = renderToStaticMarkup(createElement(StudioFrame, {
    title: '任务控制室',
    currentPath: '/',
    children: createElement('div', null, 'content'),
  }))

  assert.match(html, /Prompt Optimizer Studio/)
  assert.match(html, /任务控制室/)
  assert.match(html, /配置台/)
  assert.match(html, /语言/)
  assert.match(html, /data-ui="sidebar-toolbox"/)
  assert.doesNotMatch(html, /控制室导航/)
})

const globalsCss = readFileSync(new URL('../src/styles/globals.css', import.meta.url), 'utf8')

test('studio shell keeps a wider desktop workspace with a narrower rail and sticky toolbox', () => {
  assert.match(
    globalsCss,
    /main\s*\{[^}]*width:\s*min\(1560px,\s*calc\(100% - 32px\)\)/s,
  )
  assert.match(
    globalsCss,
    /\.studio-shell\s*\{[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)/s,
  )
  assert.match(
    globalsCss,
    /\.sidebar-toolbox\s*\{[^}]*position:\s*sticky;[^}]*top:\s*24px;/s,
  )
  assert.match(
    globalsCss,
    /\.sidebar-toolbox\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*(clip|hidden);/s,
  )
})
