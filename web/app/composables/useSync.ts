import type { SyncStatus } from '~/types/api';

/**
 * Sync health, shared by the topbar pill and the settings page.
 *
 * Polling cadence follows the state rather than a fixed timer: a run in
 * progress is worth checking often, an idle 72-hour schedule is not. This keeps
 * an idle tab down to one request a minute instead of hammering an endpoint
 * whose answer changes twice a week.
 */
export function useSync() {
  const api = useApi();

  const status = useState<SyncStatus | null>('xv:sync-status', () => null);
  const pending = useState<boolean>('xv:sync-pending', () => false);
  const error = useState<string | null>('xv:sync-error', () => null);
  const triggering = useState<boolean>('xv:sync-triggering', () => false);

  async function refresh(): Promise<SyncStatus | null> {
    pending.value = true;
    try {
      status.value = await api.get<SyncStatus>('api/sync/status');
      error.value = null;
      return status.value;
    } catch (err) {
      error.value = errorMessage(err, 'Could not read sync status.');
      return null;
    } finally {
      pending.value = false;
    }
  }

  /**
   * Ask for a sync. The API answers 202 — accepted, not done — so the UI
   * switches to the "syncing" state and waits for `/status` to confirm.
   */
  async function trigger(fullScan = false): Promise<boolean> {
    triggering.value = true;
    try {
      await api.post<{ queued: boolean; jobId: string | null }>('/sync/run', { fullScan });
      await refresh();
      return true;
    } catch (err) {
      error.value = errorMessage(err, 'Could not start a sync.');
      return false;
    } finally {
      triggering.value = false;
    }
  }

  function poll(): void {
    if (!import.meta.client) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const fresh = await refresh();
      if (stopped) return;
      timer = setTimeout(tick, fresh?.isRunning ? 5_000 : 60_000);
    };

    void tick();

    onScopeDispose(() => {
      stopped = true;
      if (timer) clearTimeout(timer);
    });
  }

  const health = computed(() => status.value?.health ?? 'never_run');
  const isRunning = computed(() => Boolean(status.value?.isRunning));
  const needsReconnect = computed(
    () => status.value?.sessionStatus === 'invalid' || status.value?.connected === false,
  );

  return {
    status,
    pending,
    error,
    triggering,
    health,
    isRunning,
    needsReconnect,
    refresh,
    trigger,
    poll,
  };
}
