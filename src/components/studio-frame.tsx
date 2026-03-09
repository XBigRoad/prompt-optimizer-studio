import type { Route } from 'next'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Gauge,
  PanelsTopLeft,
  RouteIcon,
  Settings2,
  Sparkles,
} from 'lucide-react'

export function StudioFrame({
  title,
  currentPath,
  children,
}: {
  title: string
  currentPath: string
  children: React.ReactNode
}) {
  const nav = [
    { href: '/' as Route, label: '任务控制室', icon: <Gauge size={18} /> },
    { href: '/settings' as Route, label: '配置台', icon: <Settings2 size={18} /> },
  ]

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <div>
            <div className="small">Prompt Optimizer</div>
            <strong>{title}</strong>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-title"><PanelsTopLeft size={16} /> 控制室导航</div>
          <nav className="sidebar-nav">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${currentPath === item.href ? ' active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-section sidebar-note">
          <div className="sidebar-title"><RouteIcon size={16} /> 使用方式</div>
          <p className="small">左侧先切换工作模式，右侧再专注当前结果、控制或配置。</p>
        </div>
      </aside>

      <motion.div
        className="studio-main"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  )
}
