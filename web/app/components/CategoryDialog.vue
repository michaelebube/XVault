<script setup lang="ts">
import type { Category, CategoryColor } from '~/types/api';

const props = defineProps<{ category?: Category | null }>();
const emit = defineEmits<{ close: []; saved: [category: Category]; deleted: [id: string] }>();

const { create, update, remove } = useCategories();
const toast = useToast();
const router = useRouter();
const route = useRoute();

const isEdit = computed(() => Boolean(props.category));

const name = ref(props.category?.name ?? '');
const description = ref(props.category?.description ?? '');
const color = ref<CategoryColor>(props.category?.color ?? 'neutral');
const saving = ref(false);
const confirmingDelete = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed || saving.value) return;

  saving.value = true;
  error.value = null;
  try {
    const payload = { name: trimmed, color: color.value, description: description.value.trim() };
    const saved = props.category
      ? await update(props.category.id, payload)
      : await create(payload);
    emit('saved', saved);
    emit('close');
  } catch (err) {
    error.value = errorMessage(err, 'Could not save that category.');
  } finally {
    saving.value = false;
  }
}

async function destroy(): Promise<void> {
  if (!props.category || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    const moved = await remove(props.category.id);
    // If the deleted category was the active filter, fall back to the library.
    if (route.query.category === props.category.id) {
      await router.replace({ path: '/' });
    }
    emit('deleted', props.category.id);
    emit('close');
    toast.success(
      moved > 0
        ? `Category deleted. ${plural(moved, 'bookmark')} moved to Uncategorized.`
        : 'Category deleted.',
    );
  } catch (err) {
    error.value = errorMessage(err, 'Could not delete that category.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="isEdit ? 'Edit category' : 'New category'"
    :description="
      isEdit ? undefined : 'Categories are yours alone — nothing here is shared with other users.'
    "
    @close="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="category-name">Name</label>
        <input
          id="category-name"
          v-model="name"
          type="text"
          class="field"
          maxlength="60"
          placeholder="Machine learning"
          required
        />
      </div>

      <div>
        <label class="label" for="category-description">Description <span class="text-ink-muted">(optional)</span></label>
        <input
          id="category-description"
          v-model="description"
          type="text"
          class="field"
          maxlength="200"
          placeholder="Papers, threads and notes worth revisiting"
        />
      </div>

      <div>
        <span class="label">Colour</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="option in CATEGORY_COLORS"
            :key="option"
            type="button"
            class="flex size-7 items-center justify-center rounded-control border transition-colors"
            :class="
              color === option ? 'border-line-strong bg-accent-subtle' : 'border-line hover:border-line-strong'
            "
            :aria-label="option"
            :aria-pressed="color === option"
            @click="color = option"
          >
            <span class="size-3 rounded-full" :class="categoryDot(option)" />
          </button>
        </div>
      </div>

      <p v-if="error" class="text-[13px] text-error">{{ error }}</p>

      <div class="flex items-center gap-2 pt-1">
        <button type="submit" class="btn btn-primary" :disabled="saving || !name.trim()">
          {{ isEdit ? 'Save changes' : 'Create category' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
      </div>
    </form>

    <div v-if="isEdit" class="mt-5 border-t border-line pt-4">
      <template v-if="!confirmingDelete">
        <button
          type="button"
          class="text-[13px] font-medium text-error transition-opacity hover:opacity-80"
          @click="confirmingDelete = true"
        >
          Delete category
        </button>
      </template>
      <template v-else>
        <p class="text-[13px] leading-relaxed text-ink-secondary">
          Delete <span class="font-medium text-ink">{{ category?.name }}</span
          >? Bookmarks filed here move to Uncategorized — none of them are deleted.
        </p>
        <div class="mt-2.5 flex gap-2">
          <button type="button" class="btn btn-danger py-1.5" :disabled="saving" @click="destroy">
            Delete category
          </button>
          <button type="button" class="btn btn-secondary py-1.5" @click="confirmingDelete = false">
            Keep it
          </button>
        </div>
      </template>
    </div>
  </AppModal>
</template>
