<script setup lang="ts">
import type { AiSuggestion } from '~/types/api';

/**
 * An AI suggestion is a proposal, never an action (AGENT.md §16).
 *
 * The visual treatment is deliberately quiet — a bordered strip with the accent
 * used once, no sparkle iconography (DESIGN.md §20/§36). The user must be able
 * to see what is being proposed, why, and what happens if they accept, without
 * the assistant becoming the loudest thing on the card.
 */
const props = defineProps<{ suggestion: AiSuggestion; busy?: boolean }>();
const emit = defineEmits<{ accept: []; reject: [] }>();

const { byId } = useCategories();

const name = computed(() => {
  if (props.suggestion.categoryId) {
    return byId.value.get(props.suggestion.categoryId)?.name ?? 'an existing category';
  }
  return props.suggestion.proposedCategoryName ?? 'a new category';
});

const isNew = computed(() => !props.suggestion.categoryId);

const confidence = computed(() =>
  props.suggestion.confidence === null
    ? null
    : `${Math.round(props.suggestion.confidence * 100)}%`,
);
</script>

<template>
  <div class="rounded-card border border-line bg-surface-subtle px-3 py-2.5">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
          Suggested category
        </p>
        <p class="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
          <span class="truncate">{{ name }}</span>
          <span
            v-if="isNew"
            class="rounded-full bg-accent-subtle px-1.5 py-0.5 text-[10px] font-medium text-accent"
          >
            new
          </span>
        </p>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="btn btn-primary px-2.5 py-1 text-[13px]"
          :disabled="busy"
          @click="emit('accept')"
        >
          <AppIcon name="check" :size="14" />
          Accept
        </button>
        <button
          type="button"
          class="btn btn-ghost px-2.5 py-1 text-[13px]"
          :disabled="busy"
          @click="emit('reject')"
        >
          Dismiss
        </button>
      </div>
    </div>

    <p v-if="suggestion.reason" class="mt-2 text-[12px] leading-relaxed text-ink-secondary">
      {{ suggestion.reason }}
      <span v-if="confidence" class="font-mono text-ink-muted">· {{ confidence }}</span>
    </p>
  </div>
</template>
