import assert from 'node:assert/strict'
import test from 'node:test'

import { createRandomId } from '../src/lib/random-id'

test('createRandomId uses crypto.randomUUID when available', () => {
  const originalCrypto = globalThis.crypto
  const fakeCrypto = {
    randomUUID: () => 'uuid-from-crypto',
  } as Crypto

  Object.defineProperty(globalThis, 'crypto', {
    value: fakeCrypto,
    configurable: true,
  })

  try {
    assert.equal(createRandomId('draft'), 'uuid-from-crypto')
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    })
  }
})

test('createRandomId falls back when crypto.randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto

  Object.defineProperty(globalThis, 'crypto', {
    value: {},
    configurable: true,
  })

  try {
    const id = createRandomId('draft')
    assert.match(id, /^draft-[a-z0-9]+-[a-z0-9]+$/)
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    })
  }
})
