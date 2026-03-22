import { AnimatePresence, motion } from 'framer-motion'
import { FileText } from 'lucide-react'

import type { JobDetailHandlers, JobDetailUiState, JobDetailViewModel } from '@/components/widgets/job-detail/job-detail-types'
import { useLocaleText } from '@/lib/i18n'

export function ResultStage({
  model,
  ui,
  handlers,
}: {
  model: JobDetailViewModel
  ui: Pick<JobDetailUiState, 'compareMode' | 'copyingPrompt'>
  handlers: Pick<JobDetailHandlers, 'onToggleCompareMode' | 'onCopyLatestPrompt'>
}) {
  const text = useLocaleText()

  return (
    <section className="result-stage">
      <div className="section-head">
        <div>
          <h2 className="section-title has-icon">
            <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
              <FileText size={18} />
            </span>
            {text('当前最新完整提示词', 'Current latest full prompt')}
          </h2>
          <p className="small">{text('这是你现在最应该复制和判断的版本。后续所有诊断都只是为这个结果服务。', 'This is the version you should copy and judge first. Every diagnostic exists only to support this result.')}</p>
        </div>
        <div className="result-stage-actions">
          <button className="button ghost" type="button" onClick={handlers.onToggleCompareMode}>
            {ui.compareMode ? text('退出对比', 'Exit compare') : text('进入对比', 'Enter compare')}
          </button>
          <button className="button primary-action" type="button" onClick={handlers.onCopyLatestPrompt} disabled={ui.copyingPrompt}>
            {ui.copyingPrompt ? text('复制中...', 'Copying...') : text('复制完整提示词', 'Copy full prompt')}
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {ui.compareMode ? (
          <motion.div
            key="compare-mode"
            className="result-compare-grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel result-panel result-panel-initial">
              <div className="result-panel-head">
                <span className="eyebrow subdued">{text('初始输入', 'Initial input')}</span>
                <strong>{text('初始版提示词', 'Initial prompt')}</strong>
              </div>
              <p className="small">{text('这是任务刚创建时的原始输入，用来和当前版直接对照。', 'This is the raw input from job creation so you can compare it directly with the current version.')}</p>
              <pre className="pre result-pre result-pre-initial">{model.initialPrompt}</pre>
            </div>
            <div className="panel result-panel result-panel-latest">
              <div className="result-panel-head">
                <span className="eyebrow">{text('当前结果', 'Current result')}</span>
                <strong>{text('当前最新完整提示词', 'Current latest full prompt')}</strong>
              </div>
              <p className="small">{text('复制按钮始终复制右侧这一版，方便你直接带走当前可用结果。', 'The copy button always targets this current result so you can take the usable version right away.')}</p>
              <pre className="pre result-pre result-pre-latest">{model.latestFullPrompt}</pre>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="latest-only"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <pre className="pre result-pre">{model.latestFullPrompt}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
