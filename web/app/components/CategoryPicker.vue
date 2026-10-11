<script setup lang="ts">
import type { Category, CategorizationSource } from '~/types/api';

const props = withDefaults(
  defineProps<{
    modelValue: Pick<Category, 'id' | 'name' | 'color'> | null;
    source?: CategorizationSource;
    busy?: boolean;
    align?: 'left' | 'right';
  }>(),
  { source: 'uncategorized', busy: false, align: 'left' },
);

const emit = defineEmits<{ select: [categoryId: string | null] }>();

const { categories, ensureLoaded, create } = useCategories();
const toast = useToast();

const search = ref('');
const creating = ref(false);
const listEl = ref<HTMLDivElement | null>(null);

const { open, root, close, toggle } = useDismissable({ onClose: () => (search.value = '') });

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return categories.value;
  return categories.value.filter((c) => c.name.toLowerCase().includes(term));
});

const exactExists = computed(() =>
  categories.value.some((c) => c.name.toLowerCase() === search.value.trim().toLowerCase()),
);

const canCreate = computed(() => search.value.trim().length > 0 && !exactExists.value);

async function onOpen(): Promise<void> {
  toggle();
  if (open.value) {
    await ensureLoaded();
    await nextTick();
    listEl.value?.querySelector<HTMLInputElement>('input')?.focus();
  }
}

function choose(categoryId: string | null): void {
  close();
  if (categoryId === (props.modelValue?.id ?? null)) return;
  emit('select', categoryId);
}

async function createAndAssign(): Promise<void> {
  const name = search.value.trim();
  if (!name || creating.value) return;
  creating.value = true;
  try {
    const category = await create({ name });
    close();
    emit('select', category.id);
  } catch (err) {
    toast.error(errorMessage(err, 'Could not create that category.'));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div ref="root" class="relative inline-flex">
    <button
      type="button"
      data-popover-trigger
      class="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-60"
      :class="
        modelValue
          ? categoryChip(modelValue.color)
          : 'border border-dashed border-line-strong text-ink-muted hover:border-ink hover:text-ink'
      "
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="busy"
      @click="onOpen"
    >
      <span
        v-if="modelValue"
        class="size-1.5 shrink-0 rounded-full"
        :class="categoryDot(modelValue.color)"
      />
      <AppIcon v-else name="plus" :size="13" />
      <span class="truncate">{{ modelValue?.name ?? 'Add category' }}</span>
      <span
        v-if="modelValue && source === 'ai'"
        class="font-mono text-[9px] uppercase tracking-wider opacity-70"
        title="Assigned from an accepted AI suggestion"
      >
        ai
      </span>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        ref="listEl"
        class="absolute top-full z-30 mt-1.5 w-64 overflow-hidden rounded-card border border-line bg-surface-elevated shadow-[var(--shadow-pop)]"
        :class="align === 'right' ? 'right-0' : 'left-0'"
        role="listbox"
      >
        <div class="border-b border-line p-2">
          <input
            v-model="search"
            type="text"
            placeholder="Find or create…"
            class="w-full rounded-control bg-surface-subtle px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
            @keydown.enter.prevent="canCreate ? createAndAssign() : choose(filtered[0]?.id ?? null)"
          />
        </div>

        <div class="max-h-64 overflow-y-auto py-1">
          <button
            type="button"
            role="option"
            :aria-selected="modelValue === null"
            class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-subtle"
            @click="choose(null)"
          >
            <span class="size-1.5 rounded-full border border-line-strong" />
            <span class="flex-1">Uncategorized</span>
            <AppIcon v-if="modelValue === null" name="check" :size="14" class="text-ink" />
          </button>

          <button
            v-for="category in filtered"
            :key="category.id"
            type="button"
            role="option"
            :aria-selected="modelValue?.id === category.id"
            class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
            @click="choose(category.id)"
          >
            <span class="size-1.5 shrink-0 rounded-full" :class="categoryDot(category.color)" />
            <span class="flex-1 truncate">{{ category.name }}</span>
            <AppIcon
              v-if="modelValue?.id === category.id"
              name="check"
              :size="14"
              class="text-ink"
            />
          </button>

          <p
            v-if="!filtered.length && !canCreate"
            class="px-3 py-3 text-center text-[13px] text-ink-muted"
          >
            No categories yet.
          </p>
        </div>

        <button
          v-if="canCreate"
          type="button"
          class="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-accent-subtle disabled:opacity-60"
          :disabled="creating"
          @click="createAndAssign"
        >
          <AppIcon name="plus" :size="14" />
          <span class="truncate">Create “{{ search.trim() }}”</span>
        </button>
      </div>
    </Transition>
  </div>
</template>
