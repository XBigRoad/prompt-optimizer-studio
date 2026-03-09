export interface WorkerRuntimeState {
  ownerId: string
  started: boolean
  intervalId: ReturnType<typeof setInterval> | null
  heartbeatIntervalId: ReturnType<typeof setInterval> | null
  activeCount: number
  activeJobIds: Set<string>
}

export function createWorkerRuntimeState(ownerId: string): WorkerRuntimeState {
  return {
    ownerId,
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
) {
  return !state || state.ownerId !== ownerId
}
