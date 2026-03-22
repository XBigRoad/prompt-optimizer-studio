import fs from 'node:fs'
import path from 'node:path'

import { resolvePromptPackDir } from '@/lib/server/constants'

export function readPromptPackArtifacts(packDir = resolvePromptPackDir()) {
  const skillMd = fs.readFileSync(path.join(packDir, 'SKILL.md'), 'utf8')
  const rubricMd = fs.readFileSync(path.join(packDir, 'references', 'rubric.md'), 'utf8')
  const templateMd = fs.readFileSync(path.join(packDir, 'references', 'universal-template.md'), 'utf8')
  return { skillMd, rubricMd, templateMd }
}
