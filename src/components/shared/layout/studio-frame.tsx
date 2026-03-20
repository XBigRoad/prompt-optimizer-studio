"use client"

import type { Route } from "next"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Gauge,
  Globe,
  Settings2,
} from "lucide-react"

import { useI18n, useLocaleText } from "@/lib/i18n"

export function StudioFrame({
  title: _title,
  currentPath,
  children,
}: {
  title: string
  currentPath: string
  children: React.ReactNode
}) {
  const { locale, setLocale } = useI18n()
  const text = useLocaleText()

  const nav = [
    { href: "/" as Route, label: text("任务控制室", "Job Control Room"), icon: <Gauge size={18} /> },
    { href: "/settings" as Route, label: text("配置台", "Settings Desk"), icon: <Settings2 size={18} /> },
  ]

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="sidebar-toolbox" data-ui="sidebar-toolbox">
          <div className="sidebar-brand">
            <strong className="sidebar-brand-text">Prompt Optimizer Studio</strong>
          </div>

          <nav className="sidebar-nav">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${currentPath === item.href ? " active" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="sidebar-language">
            <div className="sidebar-title"><Globe size={16} /> {text("语言", "Language")}</div>
            <div className="language-toggle" role="group" aria-label={text("切换界面语言", "Switch interface language")}>
              <button
                type="button"
                className={`language-button${locale === "zh-CN" ? " active" : ""}`}
                onClick={() => setLocale("zh-CN")}
                aria-pressed={locale === "zh-CN"}
              >
                中文
              </button>
              <button
                type="button"
                className={`language-button${locale === "en" ? " active" : ""}`}
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </aside>

      <motion.div
        className="studio-main"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  )
}
