import type { Metadata } from "next"
import { Bodoni_Moda, Space_Grotesk } from "next/font/google"
import { cookies } from 'next/headers'

import "@/styles/globals.css"
import { I18nProvider } from "@/lib/i18n"
import { DEFAULT_LOCALE, LOCALE_COOKIE_KEY, resolveLocale } from '@/lib/locale'

const display = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
})

const body = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
})

export const metadata: Metadata = {
  title: "Prompt Optimizer Studio",
  description: "Batch-run isolated prompt optimization rounds with independent judges.",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const initialLocale = resolveLocale(cookieStore.get(LOCALE_COOKIE_KEY)?.value ?? DEFAULT_LOCALE)

  return (
    <html lang={initialLocale} data-locale={initialLocale}>
      <body className={`${display.variable} ${body.variable}`}>
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
