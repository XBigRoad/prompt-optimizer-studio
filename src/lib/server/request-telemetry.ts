import type {
  ProviderEndpointKind,
  ProviderRequestLabel,
  ProviderRequestTelemetryEvent,
  ProviderRequestTelemetryKind,
} from '@/lib/contracts/provider'

export type {
  ProviderEndpointKind,
  ProviderRequestLabel,
  ProviderRequestTelemetryEvent,
  ProviderRequestTelemetryKind,
}

export function normalizeProviderRequestTelemetryEvents(value: unknown): ProviderRequestTelemetryEvent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeProviderRequestTelemetryEvent(item))
    .filter((item): item is ProviderRequestTelemetryEvent => Boolean(item))
}

function normalizeProviderRequestTelemetryEvent(value: unknown): ProviderRequestTelemetryEvent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const kind = normalizeString(record.kind)
  const requestLabel = normalizeString(record.requestLabel)
  const protocol = normalizeString(record.protocol)
  const endpointKind = normalizeString(record.endpointKind)
  const endpoint = normalizeString(record.endpoint)
  const message = normalizeString(record.message)
  const at = normalizeString(record.at)

  if (!kind || !requestLabel || !protocol || !endpointKind || !endpoint || !message || !at) {
    return null
  }

  return {
    kind: kind as ProviderRequestTelemetryKind,
    requestLabel: requestLabel as ProviderRequestLabel,
    protocol,
    endpointKind: endpointKind as ProviderEndpointKind,
    endpoint,
    attempt: normalizeNullableNumber(record.attempt),
    maxAttempts: normalizeNullableNumber(record.maxAttempts),
    timeoutMs: normalizeNullableNumber(record.timeoutMs),
    elapsedMs: normalizeNullableNumber(record.elapsedMs),
    status: normalizeNullableNumber(record.status),
    retriable: normalizeNullableBoolean(record.retriable),
    message,
    at,
    fallbackEndpointKind: normalizeString(record.fallbackEndpointKind) as ProviderEndpointKind | null,
  }
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeNullableBoolean(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }
  return Boolean(value)
}
