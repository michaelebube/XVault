<script setup lang="ts">
import type { BookmarkMedia } from '~/types/api';

const props = defineProps<{ media: BookmarkMedia[]; alt?: string }>();

const emit = defineEmits<{ open: [index: number] }>();

/** R2 is the archive; X's CDN URL is metadata only (AGENT.md §14). */
const items = computed(() =>
  props.media.map((m) => ({
    ...m,
    src: safeMediaUrl(m.url),
    poster: safeMediaUrl(m.posterUrl),
  })),
);

const failed = computed(() => items.value.filter((m) => m.status === 'failed').length);
const pending = computed(() => items.value.filter((m) => m.status === 'pending').length);

const layout = computed(() => {
  const n = items.value.length;
  if (n === 1) return 'grid-cols-1';
  if (n === 3) return 'grid-cols-2';
  return n >= 2 ? 'grid-cols-2' : 'grid-cols-1';
});
</script>

<template>
  <div v-if="items.length" class="space-y-2">
    <div class="grid gap-1.5 overflow-hidden rounded-card" :class="layout">
      <component
        :is="item.src ? 'button' : 'div'"
        v-for="(item, index) in items"
        :key="index"
        :type="item.src ? 'button' : undefined"
        class="group/media relative block overflow-hidden bg-surface-subtle"
        :class="[
          items.length === 1 ? 'max-h-[26rem]' : 'aspect-[4/3]',
          items.length === 3 && index === 0 ? 'row-span-2 aspect-auto' : '',
          item.src ? 'cursor-zoom-in' : '',
        ]"
        @click="item.src && emit('open', index)"
      >
        <img
          v-if="item.src && item.kind === 'image'"
          :src="item.src"
          :alt="item.altText || alt || ''"
          loading="lazy"
          decoding="async"
          class="size-full object-cover transition-transform duration-300 group-hover/media:scale-[1.015]"
        />

        <template v-else-if="item.src">
          <img
            v-if="item.poster"
            :src="item.poster"
            :alt="item.altText || alt || ''"
            loading="lazy"
            decoding="async"
            class="size-full object-cover"
          />
          <div v-else class="size-full bg-surface-subtle" />
          <span
            class="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover/media:bg-black/35"
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-black/60 text-white">
              <AppIcon name="play" :size="20" class="ml-0.5" />
            </span>
          </span>
          <span
            v-if="item.kind === 'gif'"
            class="absolute bottom-2 left-2 rounded-control bg-black/65 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white"
          >
            GIF
          </span>
        </template>

        <!-- Archived media not yet uploaded, or upload failed. -->
        <div
          v-else
          class="flex size-full min-h-24 flex-col items-center justify-center gap-1.5 text-ink-muted"
          :class="item.status === 'pending' ? 'skeleton' : ''"
        >
          <AppIcon :name="item.status === 'failed' ? 'alert' : 'image'" :size="18" />
          <span class="text-[11px] font-medium">
            {{ item.status === 'failed' ? 'Media unavailable' : 'Archiving…' }}
          </span>
        </div>
      </component>
    </div>

    <p v-if="pending" class="text-ink-muted text-[11px]">
      {{ plural(pending, 'file') }} still being archived.
    </p>
    <p v-else-if="failed" class="text-[11px] text-warning">
      {{ plural(failed, 'file') }} couldn't be archived. The tweet itself is safe.
    </p>
  </div>
</template>
