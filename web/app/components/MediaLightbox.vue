<script setup lang="ts">
import type { BookmarkMedia } from '~/types/api';

const props = defineProps<{ media: BookmarkMedia[]; index: number }>();
const emit = defineEmits<{ close: []; navigate: [index: number] }>();

const current = computed(() => props.media[props.index] ?? null);
const src = computed(() => safeMediaUrl(current.value?.url));
const poster = computed(() => safeMediaUrl(current.value?.posterUrl));
const isVideo = computed(() => current.value?.kind === 'video' || current.value?.kind === 'gif');

function step(delta: number): void {
  const next = props.index + delta;
  if (next >= 0 && next < props.media.length) emit('navigate', next);
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'ArrowLeft') step(-1);
}

// Bound on window rather than the dialog so the shortcuts work regardless of
// where focus landed, and torn down with the component.
onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Archived media"
      @click.self="emit('close')"
    >
      <button
        type="button"
        class="absolute right-4 top-4 rounded-button p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Close"
        @click="emit('close')"
      >
        <AppIcon name="close" :size="20" />
      </button>

      <button
        v-if="index > 0"
        type="button"
        class="absolute left-2 rounded-full p-2.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:left-6"
        aria-label="Previous"
        @click="step(-1)"
      >
        <AppIcon name="chevronLeft" :size="22" />
      </button>
      <button
        v-if="index < media.length - 1"
        type="button"
        class="absolute right-2 rounded-full p-2.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:right-6"
        aria-label="Next"
        @click="step(1)"
      >
        <AppIcon name="chevronRight" :size="22" />
      </button>

      <figure class="flex max-h-full max-w-5xl flex-col items-center gap-3">
        <video
          v-if="isVideo && src"
          :src="src"
          :poster="poster ?? undefined"
          controls
          autoplay
          :loop="current?.kind === 'gif'"
          class="max-h-[80vh] rounded-card"
        />
        <img
          v-else-if="src"
          :src="src"
          :alt="current?.altText || ''"
          class="max-h-[80vh] rounded-card object-contain"
        />
        <figcaption v-if="current?.altText" class="max-w-2xl text-center text-sm text-white/70">
          {{ current.altText }}
        </figcaption>
        <p v-if="media.length > 1" class="font-mono text-[11px] text-white/50">
          {{ index + 1 }} / {{ media.length }}
        </p>
      </figure>
    </div>
  </Teleport>
</template>
