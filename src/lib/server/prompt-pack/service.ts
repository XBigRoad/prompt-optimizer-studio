import { createHash } from 'node:crypto'

import { getDb } from '@/lib/server/db/index'
import type { PromptPackVersion } from '@/lib/contracts'
import { readPromptPackArtifacts } from '@/lib/server/prompt-pack/loader'

export function ensurePromptPackVersion(): PromptPackVersion {
  const pack = readPromptPackArtifacts()
  const hash = createHash('sha256')
    .update(pack.skillMd)
    .update(pack.rubricMd)
    .update(pack.templateMd)
    .digest('hex')

  const db = getDb()
  const existing = db.prepare(`
    SELECT id, hash, skill_md, rubric_md, template_md, created_at
    FROM prompt_pack_versions
    WHERE hash = ?
  `).get(hash) as Record<string, unknown> | undefined

  if (existing) {
    return mapPromptPackRow(existing)
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  db.prepare(`
    INSERT INTO prompt_pack_versions (id, hash, skill_md, rubric_md, template_md, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, hash, pack.skillMd, pack.rubricMd, pack.templateMd, createdAt)

  return {
    id,
    hash,
    createdAt,
    ...pack,
  }
}

export function getPromptPackVersion(id: string) {
  const db = getDb()
  const row = db.prepare(`
    SELECT id, hash, skill_md, rubric_md, template_md, created_at
    FROM prompt_pack_versions
    WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!row) {
    throw new Error(`Prompt pack version not found: ${id}`)
  }

  return mapPromptPackRow(row)
}

function mapPromptPackRow(row: Record<string, unknown>): PromptPackVersion {
  return {
    id: String(row.id),
    hash: String(row.hash),
    skillMd: String(row.skill_md),
    rubricMd: String(row.rubric_md),
    templateMd: String(row.template_md),
    createdAt: String(row.created_at),
  }
}
