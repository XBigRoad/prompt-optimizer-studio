export function createRandomId(prefix = 'id'): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }

  const timestamp = Date.now().toString(36)
  const entropy = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${timestamp}-${entropy}`
}
