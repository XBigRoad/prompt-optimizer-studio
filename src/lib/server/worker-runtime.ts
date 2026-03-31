export interface WorkerRuntimeState {
  ownerId: string
  runtimeVersion: string
  started: boolean
  intervalId: ReturnType<typeof setInterval> | null
  heartbeatIntervalId: ReturnType<typeof setInterval> | null
  activeCount: number
  activeJobIds: Set<string>
  isPumping: boolean
  repumpRequested: boolean
}

export function createWorkerRuntimeState(ownerId: string, runtimeVersion: string): WorkerRuntimeState {
  return {
    ownerId,
    runtimeVersion,
    started: false,
    intervalId: null,
    heartbeatIntervalId: null,
    activeCount: 0,
    activeJobIds: new Set(),
    isPumping: false,
    repumpRequested: false,
  }
}

export function shouldReplaceWorkerRuntime(
  state: WorkerRuntimeState | undefined,
  ownerId: string,
  runtimeVersion: string,
) {
  if (!state) {
    return true
  }

  if (state.ownerId !== ownerId) {
    return true
  }

  if (!state.started && state.runtimeVersion !== runtimeVersion) {
    return true
  }

  return false
}

export function resolveStableWorkerOwnerId(
  holder: { __promptOptimizerWorkerOwnerId?: string },
  createId: () => string,
) {
  if (!holder.__promptOptimizerWorkerOwnerId) {
    holder.__promptOptimizerWorkerOwnerId = createId()
  }
  return holder.__promptOptimizerWorkerOwnerId
}
