<script setup lang="ts">
/**
 * Modal shell: backdrop, escape-to-close, scroll lock, and focus moved into the
 * panel so keyboard users are not left behind on the page underneath.
 */
const props = withDefaults(
  defineProps<{ title: string; description?: string; width?: 'sm' | 'md' }>(),
  { width: 'sm' },
);

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  await nextTick();
  const focusable = panel.value?.querySelector<HTMLElement>(
    'input, textarea, select, button:not([data-autofocus-skip])',
  );
  focusable?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title"
      @click.self="emit('close')"
    >
      <div
        ref="panel"
        class="animate-fade-up w-full rounded-t-panel border border-line bg-surface-elevated p-5 shadow-[var(--shadow-pop)] sm:rounded-panel"
        :class="width === 'md' ? 'sm:max-w-lg' : 'sm:max-w-md'"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-[17px] font-semibold text-ink">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-[13px] leading-relaxed text-ink-secondary">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            data-autofocus-skip
            class="-m-1 rounded-control p-1 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            aria-label="Close"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="mt-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
