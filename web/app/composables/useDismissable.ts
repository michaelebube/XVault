/**
 * Popover plumbing shared by every menu in the app (category picker, filters,
 * sort, account menu).
 *
 * Written once because the accessibility details are easy to get subtly wrong
 * per-component: Escape must close, an outside pointerdown must close, and the
 * listeners must be removed when the component goes away. `pointerdown` rather
 * than `click` so the menu closes on press instead of waiting for the release,
 * which is what makes a menu feel responsive.
 */
export function useDismissable(options: { onClose?: () => void } = {}) {
  const open = ref(false);
  const root = ref<HTMLElement | null>(null);

  function close(): void {
    if (!open.value) return;
    open.value = false;
    options.onClose?.();
  }

  function toggle(): void {
    open.value ? close() : (open.value = true);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!open.value || !root.value) return;
    if (!root.value.contains(event.target as Node)) close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open.value) {
      close();
      // Returning focus to the trigger keeps keyboard users where they were.
      root.value?.querySelector<HTMLElement>('[data-popover-trigger]')?.focus();
    }
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
  });

  return { open, root, close, toggle };
}
