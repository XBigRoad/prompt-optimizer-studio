import assert from 'node:assert/strict'
import test from 'node:test'

import { getInitialLocaleFromCookieHeader } from '../src/lib/locale'

test('reads the english locale from the request cookie for first paint', () => {
  assert.equal(
    getInitialLocaleFromCookieHeader('theme=dark; prompt-optimizer-locale=en; other=value'),
    'en',
  )
})

test('falls back to Chinese when the locale cookie is missing or invalid', () => {
  assert.equal(getInitialLocaleFromCookieHeader('theme=dark'), 'zh-CN')
  assert.equal(getInitialLocaleFromCookieHeader('prompt-optimizer-locale=ja'), 'zh-CN')
})
