export function getLocalizedDriftLabel(
  label: string,
  locale: 'zh-CN' | 'en' = 'zh-CN',
) {
  switch (label) {
    case 'goal_changed':
      return locale === 'en' ? 'Goal changed' : '目标改变'
    case 'deliverable_missing':
      return locale === 'en' ? 'Deliverable missing' : '交付物缺失'
    case 'over_safety_generalization':
      return locale === 'en' ? 'Over-generalized safety wording' : '过度泛化为安全话术'
    case 'constraint_loss':
      return locale === 'en' ? 'Key constraints lost' : '关键约束丢失'
    case 'focus_shift':
      return locale === 'en' ? 'Focus shifted' : '重点转移'
    default:
      return label
  }
}
