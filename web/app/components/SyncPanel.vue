<script setup lang="ts">
const emit = defineEmits<{ navigate: [] }>();

const { status, health, isRunning, triggering, trigger } = useSync();
const toast = useToast();

/**
 * DESIGN.md §23: the sidebar answers "is my archive healthy?" in one line.
 * Anything technical — the actual error string, failure counts — lives on the
 * settings page behind a disclosure, not here.
 */
const view = computed(() => {
  switch (health.value) {
    case "not_connected":
      return {
        tone: "text-warning",
        dot: "bg-warning",
        label: "X not connected",
      };
    case "never_run":
      return {
        tone: "text-ink-secondary",
        dot: "bg-ink-muted",
        label: "No sync yet",
      };
    case "syncing":
      return { tone: "text-accent", dot: "bg-accent", label: "Syncing…" };
    case "needs_attention":
      return {
        tone: "text-warning",
        dot: "bg-warning",
        label: "Needs attention",
      };
    default:
      return {
        tone: "text-ink-secondary",
        dot: "bg-success",
        label: `Synced ${timeAgo(status.value?.lastSuccessfulSyncAt)}`,
      };
  }
});

async function syncNow(): Promise<void> {
  if (await trigger()) toast.info("Sync queued. This can take a few minutes.");
}
</script>

<template>
  <div class="flex items-center gap-1">
    <NuxtLink
      to="/settings"
      class="flex min-w-0 flex-1 items-center gap-2 rounded-button px-2.5 py-1.5 transition-colors hover:bg-surface-subtle"
      @click="emit('navigate')"
    >
      <span class="relative flex size-1.5 shrink-0">
        <span
          v-if="isRunning"
          class="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75"
        />
        <span
          class="relative inline-flex size-1.5 rounded-full"
          :class="view.dot"
        />
      </span>
      <span class="truncate text-[12px]" :class="view.tone">{{
        view.label
      }}</span>
    </NuxtLink>

    <button
      type="button"
      class="shrink-0 rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-40"
      :disabled="triggering || isRunning || !status?.connected"
      :title="status?.connected ? 'Sync now' : 'Connect X first'"
      aria-label="Sync now"
      @click="syncNow"
    >
      <AppIcon
        name="refresh"
        :size="14"
        :class="isRunning || triggering ? 'animate-spin' : ''"
      />
    </button>
  </div>
</template>
