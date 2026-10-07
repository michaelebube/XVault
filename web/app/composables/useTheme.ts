export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'xv:theme';

/**
 * Theme preference.
 *
 * localStorage is the right home for this and nothing else: it is a per-viewer
 * convenience, it never leaves the browser, and losing it costs the user one
 * click. Session material stays out of it entirely (AGENT.md §19).
 */
export function useTheme() {
  const preference = useState<ThemePreference>('xv:theme', () => 'system');
  /**
   * Tracked as state rather than read inline, so that `isDark` actually
   * recomputes when the OS switches theme. A `matchMedia(...)` call inside the
   * computed would be read once and cached, and the interface would stay light
   * until something unrelated invalidated it.
   */
  const systemDark = useState<boolean>('xv:system-dark', () => false);

  const isDark = computed(() =>
    preference.value === 'system' ? systemDark.value : preference.value === 'dark',
  );

  function apply(): void {
    if (!import.meta.client) return;
    document.documentElement.classList.toggle('dark', isDark.value);
  }

  function set(next: ThemePreference): void {
    preference.value = next;
    if (import.meta.client) {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode or blocked storage: the theme still applies for this visit.
      }
    }
    apply();
  }

  function toggle(): void {
    set(isDark.value ? 'light' : 'dark');
  }

  function init(): void {
    if (!import.meta.client) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark.value = media.matches;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        preference.value = stored;
      }
    } catch {
      // Ignore: 'system' is a sane default.
    }

    media.addEventListener('change', (event) => {
      systemDark.value = event.matches;
      apply();
    });

    apply();
  }

  return { preference, isDark, set, toggle, init };
}
