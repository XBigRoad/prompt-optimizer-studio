export interface WorkerRuntimeState {
  ownerId: string
  runtimeVersion: string
  started: boolean
  intervalId: ReturnType<typeof setInterval> | null
  heartbeatIntervalId: ReturnType<typeof setInterval> | null
  activeCount: number
  activeJobIds: Set<string>
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
  }
}

export function shouldReplaceWorkerRuntime(
  state: WorkerRuntimeState | undefined,
  ownerId: string,
  runtimeVersion: string,
) {
  return !state || state.ownerId !== ownerId || state.runtimeVersion !== runtimeVersion
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
