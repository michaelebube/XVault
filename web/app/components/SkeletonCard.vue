<script setup lang="ts">
/**
 * Shaped like a real bookmark card (DESIGN.md §24) so the page does not reflow
 * when data lands. `lines` varies per instance to avoid a mechanical grid of
 * identical grey bars.
 */
withDefaults(defineProps<{ lines?: number; media?: boolean }>(), { lines: 3, media: false });
</script>

<template>
  <article class="card p-5">
    <div class="flex items-center gap-3">
      <div class="skeleton size-9 rounded-full" />
      <div class="space-y-1.5">
        <div class="skeleton h-3 w-28 rounded" />
        <div class="skeleton h-2.5 w-20 rounded" />
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <div
        v-for="line in lines"
        :key="line"
        class="skeleton h-3 rounded"
        :style="{ width: line === lines ? '62%' : '100%' }"
      />
    </div>

    <div v-if="media" class="skeleton mt-4 h-48 w-full rounded-card" />

    <div class="mt-4 flex items-center gap-2">
      <div class="skeleton h-6 w-24 rounded-full" />
      <div class="skeleton h-6 w-16 rounded-full" />
    </div>
  </article>
</template>
