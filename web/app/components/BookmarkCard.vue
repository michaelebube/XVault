<script setup lang="ts">
import type { Bookmark } from '~/types/api';

const props = defineProps<{ bookmark: Bookmark }>();
const emit = defineEmits<{ updated: [bookmark: Bookmark]; removed: [id: string] }>();

const actions = useBookmarkActions();
const { applyCountDelta, applyRemoval } = useCategories();
const toast = useToast();

const busy = ref(false);
const confirmingDelete = ref(false);
const lightboxIndex = ref<number | null>(null);

const {
  open: menuOpen,
  root: menuRoot,
  close: closeMenu,
  toggle: toggleMenu,
} = useDismissable({ onClose: () => (confirmingDelete.value = false) });

const avatar = computed(() => safeMediaUrl(props.bookmark.author.avatarUrl));
const profileUrl = computed(() => xProfileUrl(props.bookmark.author.handle));
const permalink = computed(() => safeExternalUrl(props.bookmark.originalUrl));
const postedAt = computed(() => props.bookmark.tweetCreatedAt ?? props.bookmark.archivedAt);

/**
 * Tweet text is rendered as text, never as HTML — Vue escapes `{{ }}`, which is
 * the whole defence against a scraped tweet carrying markup (AGENT.md §20).
 * Links are surfaced from the `links` array rather than linkified out of the
 * body, so every anchor on this card has been through `safeExternalUrl`.
 */
const links = computed(() =>
  props.bookmark.links
    .flatMap((link) => {
      const href = safeExternalUrl(link.url);
      return href ? [{ href, label: link.displayUrl || link.url }] : [];
    })
    .slice(0, 3),
);

async function run<T>(fn: () => Promise<T>, failure: string): Promise<T | null> {
  if (busy.value) return null;
  busy.value = true;
  try {
    return await fn();
  } catch (err) {
    toast.error(errorMessage(err, failure));
    return null;
  } finally {
    busy.value = false;
  }
}

async function assign(categoryId: string | null): Promise<void> {
  const previous = props.bookmark.category?.id ?? null;
  const updated = await run(
    () => actions.setCategory(props.bookmark.id, categoryId),
    'Could not change the category.',
  );
  if (!updated) return;
  applyCountDelta(previous, categoryId);
  emit('updated', updated);
}

async function accept(): Promise<void> {
  const previous = props.bookmark.category?.id ?? null;
  const updated = await run(
    () => actions.acceptSuggestion(props.bookmark.id),
    'Could not accept that suggestion.',
  );
  if (!updated) return;
  applyCountDelta(previous, updated.category?.id ?? null);
  emit('updated', updated);
  toast.success(`Filed under ${updated.category?.name ?? 'Uncategorized'}.`);
}

async function reject(): Promise<void> {
  const updated = await run(
    () => actions.rejectSuggestion(props.bookmark.id),
    'Could not dismiss that suggestion.',
  );
  if (updated) emit('updated', updated);
}

async function destroy(): Promise<void> {
  const done = await run(
    () => actions.remove(props.bookmark.id),
    'Could not remove that bookmark.',
  );
  if (!done) return;
  applyRemoval(props.bookmark.category?.id ?? null);
  closeMenu();
  emit('removed', props.bookmark.id);
  toast.success('Removed from your archive.');
}

async function copyLink(): Promise<void> {
  const url = permalink.value;
  if (!url) return;
  closeMenu();
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied.');
  } catch {
    toast.error('Your browser blocked clipboard access.');
  }
}
</script>

<template>
  <article
    class="card group relative p-4 transition-colors duration-150 hover:border-line-strong sm:p-5"
    :aria-busy="busy"
  >
    <header class="flex items-start gap-3">
      <component
        :is="profileUrl ? 'a' : 'div'"
        :href="profileUrl ?? undefined"
        :target="profileUrl ? '_blank' : undefined"
        :rel="profileUrl ? 'noopener noreferrer nofollow' : undefined"
        class="shrink-0"
        :aria-label="profileUrl ? `${bookmark.author.name} on X` : undefined"
      >
        <img
          v-if="avatar"
          :src="avatar"
          alt=""
          loading="lazy"
          decoding="async"
          class="size-9 rounded-full border border-line object-cover"
        />
        <span
          v-else
          class="flex size-9 items-center justify-center rounded-full bg-surface-subtle text-[12px] font-semibold text-ink-secondary"
        >
          {{ initials(bookmark.author.name) }}
        </span>
      </component>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-1.5">
          <span class="truncate text-[14px] font-semibold text-ink">
            {{ bookmark.author.name }}
          </span>
          <span class="truncate text-[13px] text-ink-muted">
            {{ atHandle(bookmark.author.handle) }}
          </span>
        </div>
        <p class="text-[12px] text-ink-muted">
          <time :datetime="postedAt" :title="absoluteDate(postedAt)">{{ timeAgo(postedAt) }}</time>
          <span v-if="bookmark.missingFromX" class="ml-1.5 text-warning">· no longer on X</span>
        </p>
      </div>

      <div ref="menuRoot" class="relative">
        <button
          type="button"
          data-popover-trigger
          class="rounded-control p-1.5 text-ink-muted transition-all hover:bg-surface-subtle hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          :class="menuOpen ? 'sm:opacity-100' : ''"
          aria-label="Bookmark actions"
          :aria-expanded="menuOpen"
          @click="toggleMenu()"
        >
          <AppIcon name="more" :size="16" />
        </button>

        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0"
        >
          <div
            v-if="menuOpen"
            class="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-card border border-line bg-surface-elevated py-1 shadow-[var(--shadow-pop)]"
          >
            <a
              v-if="permalink"
              :href="permalink"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="flex items-center gap-2.5 px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-subtle"
              @click="closeMenu()"
            >
              <AppIcon name="external" :size="15" class="text-ink-muted" />
              Open on X
            </a>
            <button
              v-if="permalink"
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
              @click="copyLink"
            >
              <AppIcon name="copy" :size="15" class="text-ink-muted" />
              Copy link
            </button>

            <div class="my-1 border-t border-line" />

            <button
              v-if="!confirmingDelete"
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
              @click="confirmingDelete = true"
            >
              <AppIcon name="trash" :size="15" class="text-ink-muted" />
              Remove from archive
            </button>
            <div v-else class="px-3 py-2">
              <p class="text-[12px] leading-relaxed text-ink-secondary">
                Delete this archived copy? It stays bookmarked on X, but the text and media saved
                here are gone.
              </p>
              <div class="mt-2 flex gap-1.5">
                <button
                  type="button"
                  class="btn btn-danger flex-1 px-2 py-1 text-[13px]"
                  :disabled="busy"
                  @click="destroy"
                >
                  Delete
                </button>
                <button
                  type="button"
                  class="btn btn-secondary px-2 py-1 text-[13px]"
                  @click="confirmingDelete = false"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </header>

    <p
      v-if="bookmark.text"
      class="mt-3 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-ink"
    >{{ bookmark.text }}</p>

    <div v-if="bookmark.media.length" class="mt-3">
      <BookmarkMedia
        :media="bookmark.media"
        :alt="`Media from ${bookmark.author.name}`"
        @open="lightboxIndex = $event"
      />
    </div>

    <div v-if="links.length" class="mt-3 flex flex-wrap gap-1.5">
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer nofollow"
        class="inline-flex max-w-full items-center gap-1.5 rounded-control border border-line px-2 py-1 text-[12px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
      >
        <AppIcon name="link" :size="12" class="text-ink-muted" />
        <span class="truncate">{{ link.label }}</span>
      </a>
    </div>

    <div v-if="bookmark.aiSuggestion" class="mt-3">
      <SuggestionBar
        :suggestion="bookmark.aiSuggestion"
        :busy="busy"
        @accept="accept"
        @reject="reject"
      />
    </div>

    <footer class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
      <CategoryPicker
        :model-value="bookmark.category"
        :source="bookmark.categorizationSource"
        :busy="busy"
        @select="assign"
      />
      <span class="ml-auto text-[11px] text-ink-muted">
        Archived {{ timeAgo(bookmark.archivedAt) }}
      </span>
    </footer>

    <MediaLightbox
      v-if="lightboxIndex !== null"
      :media="bookmark.media"
      :index="lightboxIndex ?? 0"
      @close="lightboxIndex = null"
      @navigate="lightboxIndex = $event"
    />
  </article>
</template>
