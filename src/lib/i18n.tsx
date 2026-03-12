'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  type Locale,
} from '@/lib/locale'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  text: (zh: string, en: string) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  text: (zh) => zh,
})

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
      document.documentElement.dataset.locale = locale
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
      document.cookie = `${LOCALE_COOKIE_KEY}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    text: (zh, en) => (locale === 'zh-CN' ? zh : en),
  }), [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export function useLocaleText() {
  return useI18n().text
}
