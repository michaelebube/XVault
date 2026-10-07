<script setup lang="ts">
import type { CategorizationSource } from '~/types/api';

const emit = defineEmits<{ openNav: [] }>();

const route = useRoute();
const { filters, patch, clear, activeFilterCount } = useLibraryQuery();
const { byId } = useCategories();

const searchEl = ref<HTMLInputElement | null>(null);
const term = ref(filters.value.q ?? '');

const {
  open: filtersOpen,
  root: filtersRoot,
  close: closeFilters,
  toggle: toggleFilters,
} = useDismissable();
const { open: sortOpen, root: sortRoot, close: closeSort, toggle: toggleSort } = useDismissable();

const onLibrary = computed(() => route.path === '/');

const contextTitle = computed(() => {
  if (!onLibrary.value) return 'Settings';
  const id = filters.value.categoryId;
  if (id === 'none') return 'Uncategorized';
  if (id) return byId.value.get(id)?.name ?? 'Category';
  return 'Library';
});

/**
 * Typing shouldn't fire a request per keystroke, and it shouldn't push a
 * history entry per keystroke either — 220ms is long enough to coalesce a word
 * and short enough to still feel instant.
 */
let debounce: ReturnType<typeof setTimeout> | null = null;
watch(term, (value) => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => patch({ q: value.trim() || undefined }), 220);
});

// Keep the box in step when the query changes from elsewhere (back button,
// sidebar navigation, "clear filters").
watch(
  () => filters.value.q,
  (value) => {
    if ((value ?? '') !== term.value) term.value = value ?? '';
  },
);

const SORTS = [
  { value: 'newest', label: 'Recently archived' },
  { value: 'oldest', label: 'First archived' },
  { value: 'tweet_newest', label: 'Newest tweet' },
  { value: 'tweet_oldest', label: 'Oldest tweet' },
] as const;

const SOURCES: Array<{ value: CategorizationSource; label: string }> = [
  { value: 'manual', label: 'Filed by me' },
  { value: 'ai', label: 'Filed from a suggestion' },
  { value: 'uncategorized', label: 'Not filed yet' },
];

const currentSort = computed(
  () => SORTS.find((s) => s.value === filters.value.sort)?.label ?? SORTS[0].label,
);

function toggleFlag(key: 'media' | 'links' | 'pending', active: boolean): void {
  patch({ [key]: active ? undefined : '1' });
}

function setSource(value: CategorizationSource): void {
  patch({ source: filters.value.source === value ? undefined : value });
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;

  if (!typing && event.key === '/') {
    event.preventDefault();
    searchEl.value?.focus();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchEl.value?.focus();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (debounce) clearTimeout(debounce);
});
</script>

<template>
  <header
    class="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70"
  >
    <div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
      <button
        type="button"
        class="rounded-control p-1.5 text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink lg:hidden"
        aria-label="Open navigation"
        @click="emit('openNav')"
      >
        <AppIcon name="menu" :size="18" />
      </button>

      <h1 class="shrink-0 text-[15px] font-semibold text-ink sm:text-[16px]">
        {{ contextTitle }}
      </h1>

      <template v-if="onLibrary">
        <div class="relative ml-auto min-w-0 flex-1 sm:max-w-xs">
          <AppIcon
            name="search"
            :size="15"
            class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref="searchEl"
            v-model="term"
            type="search"
            placeholder="Search your archive"
            aria-label="Search your archive"
            class="field py-1.5 pl-8 pr-8 text-[14px]"
          />
          <kbd
            v-if="!term"
            class="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 font-mono text-[10px] text-ink-muted sm:block"
          >
            /
          </kbd>
        </div>

        <div ref="filtersRoot" class="relative shrink-0">
          <button
            type="button"
            data-popover-trigger
            class="btn btn-secondary px-2 py-1.5"
            :class="activeFilterCount ? 'border-accent text-accent' : ''"
            :aria-expanded="filtersOpen"
            aria-label="Filters"
            @click="toggleFilters()"
          >
            <AppIcon name="filter" :size="15" />
            <span v-if="activeFilterCount" class="font-mono text-[11px]">{{ activeFilterCount }}</span>
          </button>

          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0"
          >
            <div
              v-if="filtersOpen"
              class="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-card border border-line bg-surface-elevated py-1 shadow-[var(--shadow-pop)]"
            >
              <p class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Content
              </p>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                @click="toggleFlag('media', Boolean(filters.hasMedia))"
              >
                <AppIcon name="image" :size="15" class="text-ink-muted" />
                <span class="flex-1">Has media</span>
                <AppIcon v-if="filters.hasMedia" name="check" :size="14" class="text-accent" />
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                @click="toggleFlag('links', Boolean(filters.hasLinks))"
              >
                <AppIcon name="link" :size="15" class="text-ink-muted" />
                <span class="flex-1">Has links</span>
                <AppIcon v-if="filters.hasLinks" name="check" :size="14" class="text-accent" />
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                @click="toggleFlag('pending', Boolean(filters.pendingSuggestion))"
              >
                <AppIcon name="tag" :size="15" class="text-ink-muted" />
                <span class="flex-1">Awaiting my decision</span>
                <AppIcon
                  v-if="filters.pendingSuggestion"
                  name="check"
                  :size="14"
                  class="text-accent"
                />
              </button>

              <div class="my-1 border-t border-line" />
              <p class="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                How it was filed
              </p>
              <button
                v-for="option in SOURCES"
                :key="option.value"
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                @click="setSource(option.value)"
              >
                <span class="flex-1">{{ option.label }}</span>
                <AppIcon
                  v-if="filters.source === option.value"
                  name="check"
                  :size="14"
                  class="text-accent"
                />
              </button>

              <template v-if="filters.author">
                <div class="my-1 border-t border-line" />
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                  @click="patch({ author: undefined })"
                >
                  <AppIcon name="user" :size="15" class="text-ink-muted" />
                  <span class="flex-1 truncate">{{ atHandle(filters.author) }}</span>
                  <AppIcon name="close" :size="14" class="text-ink-muted" />
                </button>
              </template>

              <template v-if="activeFilterCount">
                <div class="my-1 border-t border-line" />
                <button
                  type="button"
                  class="w-full px-3 py-1.5 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink"
                  @click="clear(); closeFilters()"
                >
                  Clear all filters
                </button>
              </template>
            </div>
          </Transition>
        </div>

        <div ref="sortRoot" class="relative hidden shrink-0 sm:block">
          <button
            type="button"
            data-popover-trigger
            class="btn btn-secondary px-2 py-1.5"
            :aria-expanded="sortOpen"
            aria-label="Sort order"
            @click="toggleSort()"
          >
            <span class="max-w-[9rem] truncate text-[13px]">{{ currentSort }}</span>
            <AppIcon name="chevronDown" :size="13" />
          </button>

          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0"
          >
            <div
              v-if="sortOpen"
              class="absolute right-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-card border border-line bg-surface-elevated py-1 shadow-[var(--shadow-pop)]"
            >
              <button
                v-for="option in SORTS"
                :key="option.value"
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
                @click="patch({ sort: option.value === 'newest' ? undefined : option.value }); closeSort()"
              >
                <span class="flex-1">{{ option.label }}</span>
                <AppIcon
                  v-if="filters.sort === option.value"
                  name="check"
                  :size="14"
                  class="text-accent"
                />
              </button>
            </div>
          </Transition>
        </div>
      </template>
    </div>
  </header>
</template>
