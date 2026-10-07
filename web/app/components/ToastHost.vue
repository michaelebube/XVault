<script setup lang="ts">
const { toasts, dismiss } = useToast();

const ICON = {
  success: 'success',
  error: 'alert',
  info: 'info',
} as const;

const TONE = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-info',
} as const;
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in absolute"
      leave-to-class="translate-y-1 opacity-0"
      move-class="transition duration-200"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-surface-elevated px-4 py-3 shadow-lg shadow-black/5 dark:shadow-black/40"
      >
        <AppIcon :name="ICON[toast.tone]" :class="TONE[toast.tone]" class="mt-0.5" />
        <p class="text-ink flex-1 text-sm leading-relaxed">{{ toast.message }}</p>
        <button
          type="button"
          class="text-ink-muted hover:text-ink -m-1 rounded-control p-1 transition-colors"
          aria-label="Dismiss notification"
          @click="dismiss(toast.id)"
        >
          <AppIcon name="close" :size="15" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
