export type Locale = 'zh-CN' | 'en'

export const LOCALE_STORAGE_KEY = 'prompt-optimizer-locale'
export const LOCALE_COOKIE_KEY = 'prompt-optimizer-locale'
export const DEFAULT_LOCALE: Locale = 'zh-CN'

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'zh-CN' || value === 'en'
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getInitialLocaleFromCookieHeader(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) {
    return DEFAULT_LOCALE
  }

  for (const segment of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = segment.trim().split('=')
    if (rawKey !== LOCALE_COOKIE_KEY) {
      continue
    }

    const rawValue = rawValueParts.join('=').trim()
    return resolveLocale(decodeURIComponent(rawValue))
  }

  return DEFAULT_LOCALE
}
