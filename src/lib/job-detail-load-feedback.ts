export type JobDetailLoadSource = 'models' | 'settings' | 'rubric'

function isEnglish(locale?: 'zh-CN' | 'en') {
  return locale === 'en'
}

function getSourceLabel(source: JobDetailLoadSource, locale?: 'zh-CN' | 'en') {
  switch (source) {
    case 'models':
      return isEnglish(locale) ? 'model list' : '模型列表'
    case 'settings':
      return isEnglish(locale) ? 'settings' : '设置'
    case 'rubric':
      return isEnglish(locale) ? 'current scoring standard' : '当前评分标准'
  }
}

function formatSourceList(sources: JobDetailLoadSource[], locale?: 'zh-CN' | 'en') {
  const labels = sources.map((source) => getSourceLabel(source, locale))
  if (labels.length <= 1) {
    return labels[0] ?? ''
  }

  if (isEnglish(locale)) {
    return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
  }

  return labels.join('、')
}

export function shouldSurfaceJobDetailHardFailure(input: {
  hasRetainedDetail: boolean
  consecutiveFailures: number
}) {
  return !input.hasRetainedDetail || input.consecutiveFailures >= 2
}

export function buildJobDetailLoadWarning(input: {
  locale?: 'zh-CN' | 'en'
  retainedDetail: boolean
  detailRefreshFailed?: boolean
  failedSources?: JobDetailLoadSource[]
}) {
  const failedSources = [...new Set(input.failedSources ?? [])]
  const sourceList = formatSourceList(failedSources, input.locale)

  if (input.detailRefreshFailed && failedSources.length > 0) {
    return isEnglish(input.locale)
      ? `The job detail refresh just failed, so the page is temporarily keeping the last good snapshot. ${sourceList} also failed to refresh.`
      : `任务详情刚刚刷新失败，页面先保留上一版内容；${sourceList}也没有刷新成功。`
  }

  if (input.detailRefreshFailed) {
    return isEnglish(input.locale)
      ? 'The job detail refresh just failed, so the page is temporarily keeping the last good snapshot.'
      : '任务详情刚刚刷新失败，页面先保留上一版内容。'
  }

  if (!input.retainedDetail || failedSources.length === 0) {
    return null
  }

  return isEnglish(input.locale)
    ? `${sourceList} failed to refresh, so the page is temporarily keeping the last good snapshot for those sections.`
    : `${sourceList}刷新失败，页面先继续沿用这些区域上一版可用数据。`
}
