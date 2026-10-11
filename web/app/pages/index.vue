<script setup lang="ts">
import type { Bookmark } from '~/types/api';

/**
 * The library.
 *
 * The page owns no filter state of its own — `useLibraryQuery` reads it from the
 * URL, so the topbar, the sidebar and the back button all drive this one watcher.
 * Mutations from a card come back as a re-serialized bookmark and are swapped in
 * place, so filing something never reshuffles the list under the user's cursor.
 */
const { filters, patch, clear, activeFilterCount } = useLibraryQuery();
const { categories, uncategorizedCount, loaded: categoriesLoaded, byId, ensureLoaded } = useCategories();
const { status } = useSync();

const {
  items,
  page,
  limit,
  total,
  totalPages,
  pending,
  error,
  loadedOnce,
  load,
  replace,
  remove,
} = useLibrary();

watch(filters, (value) => void load(value), { immediate: true });

onMounted(() => void ensureLoaded());

const categoryName = computed(() => {
  const id = filters.value.categoryId;
  if (!id || id === 'none') return null;
  return byId.value.get(id)?.name ?? null;
});

const activeCategoryId = computed(() => filters.value.categoryId ?? null);

/** Which empty state is the honest one for the current query. */
const emptyKind = computed(() => {
  if (filters.value.q) return 'search';
  if (activeFilterCount.value > 0) return 'filters';
  if (filters.value.categoryId === 'none') return 'uncategorized';
  if (filters.value.categoryId) return 'category';
  return 'library';
});

/**
 * A banner, not an error: the archive still works with a broken X session, it
 * just stops growing. "Never connected" is handled by the empty state instead,
 * so a new user isn't told the same thing twice.
 */
const connectionNotice = computed(() => {
  const s = status.value;
  if (!s) return null;
  if (s.sessionStatus === 'invalid') {
    return {
      title: 'Your X session needs reconnecting',
      body: 'Syncing is paused until it is reconnected. Everything already archived is safe.',
    };
  }
  if (!s.connected && total.value > 0) {
    return {
      title: 'X is not connected',
      body: 'New bookmarks will not be archived until you connect an X account again.',
    };
  }
  return null;
});

const rangeLabel = computed(() => {
  if (total.value === 0) return '';
  const first = (page.value - 1) * limit.value + 1;
  const last = Math.min(page.value * limit.value, total.value);
  return totalPages.value > 1 ? `${first}–${last} of ${total.value}` : plural(total.value, 'bookmark');
});

function goToPage(next: number): void {
  patch({ page: next <= 1 ? undefined : String(next) });
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onUpdated(bookmark: Bookmark): void {
  replace(bookmark);
}

function onRemoved(id: string): void {
  remove(id);
}
</script>

<template>
  <div>
    <div
      v-if="connectionNotice"
      class="mb-4 flex items-start gap-3 rounded-card border border-line bg-surface p-3.5"
    >
      <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0 text-warning" />
      <div class="min-w-0 flex-1">
        <p class="text-[13px] font-medium text-ink">{{ connectionNotice.title }}</p>
        <p class="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">
          {{ connectionNotice.body }}
        </p>
      </div>
      <NuxtLink to="/settings" class="btn btn-secondary shrink-0 px-2.5 py-1.5 text-[13px]">
        Fix
      </NuxtLink>
    </div>

    <nav
      v-if="categoriesLoaded"
      class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      aria-label="Category filters"
    >
      <button
        type="button"
        class="shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors"
        :class="
          activeCategoryId === null
            ? 'border-line-strong bg-accent text-accent-ink'
            : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
        "
        @click="patch({ category: undefined })"
      >
        All
      </button>
      <button
        type="button"
        class="shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors"
        :class="
          activeCategoryId === 'none'
            ? 'border-line-strong bg-accent text-accent-ink'
            : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
        "
        @click="patch({ category: 'none' })"
      >
        Uncategorized
        <span class="ml-1 font-mono text-[11px] opacity-70">{{ uncategorizedCount }}</span>
      </button>
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors"
        :class="
          activeCategoryId === category.id
            ? 'border-line-strong bg-accent text-accent-ink'
            : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
        "
        @click="patch({ category: category.id })"
      >
        {{ category.name }}
        <span class="ml-1 font-mono text-[11px] opacity-70">{{ category.bookmarkCount }}</span>
      </button>
    </nav>

    <!-- Result meta. Quiet by design: it reports, it does not decorate. -->
    <div class="mb-3 flex min-h-6 items-center gap-3">
      <p v-if="loadedOnce && !error" class="text-[12px] text-ink-muted">
        <template v-if="filters.q">
          {{ plural(total, 'result') }} for “{{ filters.q }}”
        </template>
        <template v-else-if="categoryName">{{ rangeLabel }} in {{ categoryName }}</template>
        <template v-else>{{ rangeLabel }}</template>
      </p>
      <button
        v-if="activeFilterCount || filters.q"
        type="button"
        class="ml-auto text-[12px] text-ink-secondary transition-colors hover:text-ink"
        @click="clear()"
      >
        Clear filters
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="card">
      <EmptyState illustration="error" compact title="Couldn't load your archive" :description="error">
        <template #action>
          <button type="button" class="btn btn-secondary" @click="load(filters)">
            <AppIcon name="refresh" :size="15" />
            Try again
          </button>
        </template>
      </EmptyState>
    </div>

    <!-- First load: skeletons shaped like the cards that are coming (DESIGN.md §24) -->
    <div v-else-if="pending && !loadedOnce" class="space-y-3">
      <SkeletonCard :lines="3" media />
      <SkeletonCard :lines="2" />
      <SkeletonCard :lines="4" media />
      <SkeletonCard :lines="2" />
    </div>

    <!-- Empty -->
    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        v-if="emptyKind === 'search'"
        illustration="search"
        compact
        title="Nothing matched your search"
        description="Try a different keyword, or clear your filters."
      >
        <template #action>
          <button type="button" class="btn btn-secondary" @click="clear()">Clear search</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="emptyKind === 'filters'"
        illustration="search"
        compact
        title="No bookmarks match these filters"
        description="Loosen a filter to see more of your archive."
      >
        <template #action>
          <button type="button" class="btn btn-secondary" @click="clear()">Clear filters</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="emptyKind === 'uncategorized'"
        illustration="category"
        compact
        title="Everything is filed"
        description="Nothing is waiting to be organised right now."
      />

      <EmptyState
        v-else-if="emptyKind === 'category'"
        illustration="category"
        compact
        title="Nothing here yet"
        description="Bookmarks you assign to this category will appear here."
      />

      <EmptyState
        v-else
        illustration="library"
        title="Your library is empty"
        :description="
          status?.connected
            ? 'Your next sync will bring your X bookmarks in. This can take a few minutes.'
            : 'Connect your X account and your bookmarks will be archived here.'
        "
      >
        <template #action>
          <NuxtLink to="/settings" class="btn btn-primary">
            {{ status?.connected ? 'View sync status' : 'Connect X' }}
          </NuxtLink>
        </template>
      </EmptyState>
    </div>

    <!-- Content -->
    <div v-else>
      <div
        class="space-y-3 transition-opacity duration-150"
        :class="pending ? 'opacity-60' : ''"
        aria-live="polite"
        :aria-busy="pending"
      >
        <BookmarkCard
          v-for="bookmark in items"
          :key="bookmark.id"
          :bookmark="bookmark"
          @updated="onUpdated"
          @removed="onRemoved"
        />
      </div>

      <nav
        v-if="totalPages > 1"
        class="mt-6 flex items-center justify-between gap-3"
        aria-label="Pagination"
      >
        <button
          type="button"
          class="btn btn-secondary px-2.5 py-1.5 text-[13px]"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        >
          <AppIcon name="chevronLeft" :size="15" />
          Previous
        </button>

        <p class="font-mono text-[12px] text-ink-muted">{{ page }} / {{ totalPages }}</p>

        <button
          type="button"
          class="btn btn-secondary px-2.5 py-1.5 text-[13px]"
          :disabled="page >= totalPages"
          @click="goToPage(page + 1)"
        >
          Next
          <AppIcon name="chevronRight" :size="15" />
        </button>
      </nav>
    </div>
  </div>
</template>
