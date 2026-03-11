import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ConversationPolicy } from '@/lib/engine/conversation-policy'
import { resolveRuntimeEnv } from '@/lib/server/runtime-env'
import type { AppSettings } from '@/lib/server/types'

const PROMPT_PACK_DIR_ENV = 'PROMPT_OPTIMIZER_PROMPT_PACK_DIR'

function findRepoRoot(startDir: string) {
  let currentDir = path.resolve(startDir)

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }

    currentDir = parentDir
  }
}

export function resolvePromptPackDir() {
  const overrideDir = process.env[PROMPT_PACK_DIR_ENV]?.trim()
  if (overrideDir) {
    return overrideDir
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = findRepoRoot(process.cwd()) ?? findRepoRoot(moduleDir)
  if (!repoRoot) {
    throw new Error('Unable to resolve the repository root for the default prompt pack.')
  }

  return path.join(repoRoot, 'prompt-pack', 'default')
}

export function resolveDatabasePath() {
  return resolveRuntimeEnv().databasePath
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'updatedAt'> = {
  cpamcBaseUrl: '',
  cpamcApiKey: '',
  apiProtocol: 'auto',
  defaultOptimizerModel: '',
  defaultJudgeModel: '',
  scoreThreshold: 95,
  judgePassCount: 3,
  maxRounds: 8,
  noImprovementLimit: 2,
  workerConcurrency: 1,
  conversationPolicy: 'stateless' as ConversationPolicy,
}

export const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'manual_review', 'cancelled'])
