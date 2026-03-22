import { useState } from 'react'

export function SummaryBadge({
  label,
  value,
  meta,
  tone,
}: {
  label: string
  value: string
  meta?: string | null
  tone?: string
}) {
  return (
    <div className={`summary-badge${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </div>
  )
}

export function ReadonlyGoalField({
  label,
  value,
  expandLabel,
  collapseLabel,
  collapsedPreview,
}: {
  label: string
  value: string
  expandLabel: string
  collapseLabel: string
  collapsedPreview: string
}) {
  const [expanded, setExpanded] = useState(false)
  const shouldCollapse = shouldCollapseGoalValue(value)
  const displayValue = !shouldCollapse || expanded ? value : getGoalValuePreview(value)

  return (
    <div className="active-goal-card compact-goal-card">
      <div className="section-head compact-head">
        <div>
          <strong>{label}</strong>
          {shouldCollapse && !expanded ? <p className="small">{collapsedPreview}</p> : null}
        </div>
        {shouldCollapse ? (
          <button className="button ghost compact" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? collapseLabel : expandLabel}
          </button>
        ) : null}
      </div>
      <pre className="pre goal-field-pre" data-ui={shouldCollapse ? 'goal-value-fold' : undefined}>{displayValue}</pre>
    </div>
  )
}

export function FoldCardSummary({
  title,
  closedLabel,
  openLabel,
}: {
  title: string
  closedLabel: string
  openLabel: string
}) {
  return (
    <span className="fold-card-summary-inner">
      <span>{title}</span>
      <span className="fold-card-summary-toggle" data-closed-label={closedLabel} data-open-label={openLabel}>
        {closedLabel}
      </span>
    </span>
  )
}

function shouldCollapseGoalValue(value: string) {
  return value.length > 160 || value.includes('\n')
}

function getGoalValuePreview(value: string) {
  return `${value.replace(/\s+/g, ' ').trim().slice(0, 160)}...`
}
