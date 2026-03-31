type JobDetailRuntimeSnapshotRecord = {
  detail: unknown
  models: unknown[]
  settings: unknown
  effectiveRubricMd: string
  effectiveRubricSource: string
}

const STORE_KEY = '__promptOptimizerJobDetailRuntimeSnapshots__'

type CacheHost = typeof globalThis & {
  [STORE_KEY]?: Map<string, JobDetailRuntimeSnapshotRecord>
}

function getRuntimeStore() {
  const host = globalThis as CacheHost
  if (!host[STORE_KEY]) {
    host[STORE_KEY] = new Map<string, JobDetailRuntimeSnapshotRecord>()
  }
  return host[STORE_KEY]!
}

export function readJobDetailRuntimeSnapshot<
  TDetail = unknown,
  TModel = unknown,
  TSettings = unknown,
  TSource extends string = string,
>(jobId: string): {
  detail: TDetail
  models: TModel[]
  settings: TSettings
  effectiveRubricMd: string
  effectiveRubricSource: TSource
} | null {
  const snapshot = getRuntimeStore().get(jobId)
  if (!snapshot) {
    return null
  }

  return snapshot as {
    detail: TDetail
    models: TModel[]
    settings: TSettings
    effectiveRubricMd: string
    effectiveRubricSource: TSource
  }
}

export function writeJobDetailRuntimeSnapshot(jobId: string, snapshot: JobDetailRuntimeSnapshotRecord) {
  getRuntimeStore().set(jobId, snapshot)
}

export function clearJobDetailRuntimeSnapshot(jobId: string) {
  getRuntimeStore().delete(jobId)
}
