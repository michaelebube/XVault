<script setup lang="ts">
withDefaults(
  defineProps<{
    illustration?: 'library' | 'search' | 'category' | 'connect' | 'error';
    title: string;
    description?: string;
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'gap-3 px-6 py-12' : 'gap-4 px-6 py-20'"
  >
    <AppIllustration v-if="illustration" :name="illustration" :size="compact ? 84 : 112" />
    <div class="max-w-sm space-y-1.5">
      <p class="text-ink text-[15px] font-semibold">{{ title }}</p>
      <p v-if="description" class="text-ink-secondary text-sm leading-relaxed">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.action" class="pt-1">
      <slot name="action" />
    </div>
  </div>
</template>
