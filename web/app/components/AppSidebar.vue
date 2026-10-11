<script setup lang="ts">
import type { Category } from '~/types/api';

const emit = defineEmits<{ navigate: [] }>();

const route = useRoute();
const { categories, uncategorizedCount, pending, loaded, ensureLoaded } = useCategories();

const editing = ref<Category | null>(null);
const showDialog = ref(false);

onMounted(() => {
  void ensureLoaded();
});

const activeCategory = computed(() => (route.query.category as string | undefined) ?? null);

const totalArchived = computed(() =>
  categories.value.reduce((sum, c) => sum + c.bookmarkCount, uncategorizedCount.value),
);

function openCreate(): void {
  editing.value = null;
  showDialog.value = true;
}

function openEdit(category: Category): void {
  editing.value = category;
  showDialog.value = true;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-2.5 px-4 py-4">
      <span
        class="brand-mark size-7 text-[13px]"
        aria-hidden="true"
      >
        X
      </span>
      <span class="text-[15px] font-semibold tracking-tight text-ink">XVault</span>
    </div>

    <nav class="px-2" aria-label="Library">
      <NuxtLink
        :to="{ path: '/' }"
        class="flex items-center gap-2.5 rounded-button px-2.5 py-1.5 text-[14px] transition-colors"
        :class="
          activeCategory === null && !route.query.pending
            ? 'bg-accent-subtle font-medium text-ink'
            : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
        "
        @click="emit('navigate')"
      >
        <AppIcon name="library" :size="16" />
        <span class="flex-1">Library</span>
        <span v-if="loaded" class="font-mono text-[11px] text-ink-muted">{{ totalArchived }}</span>
      </NuxtLink>

      <NuxtLink
        :to="{ path: '/', query: { category: 'none' } }"
        class="mt-0.5 flex items-center gap-2.5 rounded-button px-2.5 py-1.5 text-[14px] transition-colors"
        :class="
          activeCategory === 'none'
            ? 'bg-accent-subtle font-medium text-ink'
            : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
        "
        @click="emit('navigate')"
      >
        <AppIcon name="inbox" :size="16" />
        <span class="flex-1">Uncategorized</span>
        <span v-if="loaded" class="font-mono text-[11px] text-ink-muted">
          {{ uncategorizedCount }}
        </span>
      </NuxtLink>
    </nav>

    <div class="mt-5 flex items-center justify-between px-4">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Categories</h2>
      <button
        type="button"
        class="-m-1 rounded-control p-1 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        aria-label="New category"
        @click="openCreate"
      >
        <AppIcon name="plus" :size="15" />
      </button>
    </div>

    <div class="mt-1 flex-1 overflow-y-auto px-2 pb-2">
      <div v-if="pending && !loaded" class="space-y-1.5 px-1 py-2">
        <div v-for="i in 4" :key="i" class="skeleton h-6 rounded-button" />
      </div>

      <p v-else-if="!categories.length" class="px-2.5 py-2 text-[12px] leading-relaxed text-ink-muted">
        No categories yet. Create one to start organising your archive.
      </p>

      <div v-else class="space-y-0.5">
        <div
          v-for="category in categories"
          :key="category.id"
          class="group/row flex items-center gap-1"
        >
          <NuxtLink
            :to="{ path: '/', query: { category: category.id } }"
            class="flex min-w-0 flex-1 items-center gap-2.5 rounded-button px-2.5 py-1.5 text-[14px] transition-colors"
            :class="
              activeCategory === category.id
                ? 'bg-accent-subtle font-medium text-ink'
                : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
            "
            @click="emit('navigate')"
          >
            <span class="size-1.5 shrink-0 rounded-full" :class="categoryDot(category.color)" />
            <span class="truncate">{{ category.name }}</span>
            <span class="ml-auto shrink-0 font-mono text-[11px] text-ink-muted">
              {{ category.bookmarkCount }}
            </span>
          </NuxtLink>
          <button
            type="button"
            class="shrink-0 rounded-control p-1 text-ink-muted opacity-0 transition-all hover:bg-surface-subtle hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100 max-sm:opacity-100"
            :aria-label="`Edit ${category.name}`"
            @click="openEdit(category)"
          >
            <AppIcon name="more" :size="14" />
          </button>
        </div>
      </div>
    </div>

    <div class="border-t border-line p-2">
      <SyncPanel @navigate="emit('navigate')" />
      <AccountMenu class="mt-1" @navigate="emit('navigate')" />
    </div>

    <CategoryDialog v-if="showDialog" :category="editing" @close="showDialog = false" />
  </div>
</template>
