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

  assert.match(html, /控制室导航/)
  assert.match(html, /任务控制室/)
  assert.match(html, /配置台/)
})

const globalsCss = readFileSync(new URL('../src/styles/globals.css', import.meta.url), 'utf8')

test('studio shell keeps a wider desktop workspace with a narrower rail', () => {
  assert.match(
    globalsCss,
    /main\s*\{[^}]*width:\s*min\(1600px,\s*calc\(100% - 40px\)\)/s,
  )
  assert.match(
    globalsCss,
    /\.studio-shell\s*\{[^}]*grid-template-columns:\s*236px minmax\(0, 1fr\)/s,
  )
})
