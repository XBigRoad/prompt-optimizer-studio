import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const sourceRoots = ['src', 'tests']
const bridgeImports = new Set([
  '@/lib/server/types',
  '@/lib/server/jobs',
  '@/lib/server/provider-adapter',
  '@/lib/server/worker',
  '@/lib/server/worker-runtime',
  '@/lib/server/settings',
  '@/lib/server/prompt-pack',
  '@/lib/server/db',
  '@/components/dashboard-control-room',
  '@/components/dashboard-shell',
  '@/components/job-detail-control-room',
  '@/components/job-detail-shell',
  '@/components/job-round-card',
  '@/components/settings-control-room',
  '@/components/settings-shell',
  '@/components/studio-frame',
  '@/components/ui/confirm-dialog',
  '@/components/ui/model-alias-combobox',
  '@/components/ui/select-field',
  '@/components/ui/use-hydrated',
])
const bridgeFiles = new Set([
  'src/lib/server/types.ts',
  'src/lib/server/jobs.ts',
  'src/lib/server/provider-adapter.ts',
  'src/lib/server/worker.ts',
  'src/lib/server/worker-runtime.ts',
  'src/lib/server/settings.ts',
  'src/lib/server/prompt-pack.ts',
  'src/lib/server/db.ts',
  'src/components/dashboard-control-room.tsx',
  'src/components/dashboard-shell.tsx',
  'src/components/job-detail-control-room.tsx',
  'src/components/job-detail-shell.tsx',
  'src/components/job-round-card.tsx',
  'src/components/settings-control-room.tsx',
  'src/components/settings-shell.tsx',
  'src/components/studio-frame.tsx',
  'src/components/ui/confirm-dialog.tsx',
  'src/components/ui/model-alias-combobox.tsx',
  'src/components/ui/select-field.tsx',
  'src/components/ui/use-hydrated.ts',
])
const oversizedAllowlist = new Set([
  'src/lib/server/jobs/internal.ts',
])
const modularServerModules = new Set([
  'jobs',
  'runtime',
  'providers',
  'settings',
  'prompt-pack',
  'db',
])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const machineAbsolutePathPattern = /(?:^|['"`\s(])(?:\/Volumes\/|\/Users\/|\/home\/|[A-Za-z]:[\\/])/

const issues = []

for (const root of sourceRoots) {
  walk(path.join(repoRoot, root))
}

if (issues.length > 0) {
  console.error('Architecture check failed:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log('Architecture check passed.')

function walk(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return
  }

  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      if (entry === 'node_modules' || entry === '.next') {
        continue
      }
      walk(path.join(targetPath, entry))
    }
    return
  }

  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(targetPath)) {
    return
  }

  checkFile(targetPath)
}

function checkFile(absPath) {
  const relPath = toRepoRelative(absPath)
  const source = fs.readFileSync(absPath, 'utf8')
  const lines = source.split(/\r?\n/)
  const isBridgeFile = bridgeFiles.has(relPath)

  if (relPath.startsWith('tests/') && machineAbsolutePathPattern.test(source)) {
    issues.push(`${relPath}: contains hardcoded machine absolute path`)
  }

  if (relPath.startsWith('src/') && lines.length > 1000 && !oversizedAllowlist.has(relPath)) {
    issues.push(`${relPath}: exceeds 1000 lines without architecture allowlist entry`)
  }

  for (const specifier of collectImports(source)) {
    if (bridgeImports.has(specifier) && !isBridgeFile) {
      issues.push(`${relPath}: imports transitional bridge "${specifier}"`)
    }

    if (relPath.startsWith('src/components/') && specifier.startsWith('@/lib/server/')) {
      issues.push(`${relPath}: components layer must not import server internals (${specifier})`)
    }

    if (relPath.startsWith('src/lib/contracts/') && specifier.startsWith('@/lib/server/')) {
      issues.push(`${relPath}: contracts layer must not depend on server (${specifier})`)
    }

    if (relPath.startsWith('src/app/api/') && specifier.startsWith('@/lib/server/')) {
      if (!/^@\/lib\/server\/[^/]+(?:\/index)?$/.test(specifier) || bridgeImports.has(specifier)) {
        issues.push(`${relPath}: app/api must import server only through module index.ts (${specifier})`)
      }
    }

    if (relPath.startsWith('src/lib/server/')) {
      const fromModule = getServerModuleName(relPath)
      const toModule = getServerModuleNameFromImport(specifier)
      if (
        fromModule
        && toModule
        && fromModule !== toModule
        && modularServerModules.has(fromModule)
        && modularServerModules.has(toModule)
      ) {
        if (!new RegExp(`^@/lib/server/${toModule}/index$`).test(specifier)) {
          issues.push(`${relPath}: server modules must cross-import only through "${toModule}/index.ts" (${specifier})`)
        }
      }
    }
  }
}

function collectImports(source) {
  const imports = []
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2]
    if (specifier) {
      imports.push(specifier)
    }
  }
  return imports
}

function getServerModuleName(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  const match = normalized.match(/^src\/lib\/server\/([^/.]+)(?:\/|\.|$)/)
  if (!match) {
    return null
  }
  return match[1]
}

function getServerModuleNameFromImport(specifier) {
  const match = specifier.match(/^@\/lib\/server\/([^/]+)(?:\/|$)/)
  if (!match) {
    return null
  }
  return match[1]
}

function toRepoRelative(absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, '/')
}
