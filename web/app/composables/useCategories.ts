import type { Category, CategoryColor, CategoryListResponse } from '~/types/api';

/**
 * Categories are shared state, not per-page state.
 *
 * The sidebar, the library filter and the card's category picker all show the
 * same list and the same counts. Holding one copy in `useState` means assigning
 * a bookmark updates every one of them at once, instead of three components
 * drifting apart until a reload.
 */
export function useCategories() {
  const api = useApi();

  const categories = useState<Category[]>('xv:categories', () => []);
  const uncategorizedCount = useState<number>('xv:uncategorized-count', () => 0);
  const pending = useState<boolean>('xv:categories-pending', () => false);
  const loaded = useState<boolean>('xv:categories-loaded', () => false);
  const error = useState<string | null>('xv:categories-error', () => null);

  async function refresh(): Promise<void> {
    pending.value = true;
    error.value = null;
    try {
      const data = await api.get<CategoryListResponse>('/categories');
      categories.value = data.categories;
      uncategorizedCount.value = data.uncategorizedCount;
      loaded.value = true;
    } catch (err) {
      error.value = errorMessage(err, 'Could not load your categories.');
    } finally {
      pending.value = false;
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value && !pending.value) await refresh();
  }

  async function create(input: {
    name: string;
    color?: CategoryColor;
    description?: string;
  }): Promise<Category> {
    const { category } = await api.post<{ category: Category }>('/categories', { ...input });
    categories.value = [...categories.value, category].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return category;
  }

  async function update(
    id: string,
    patch: { name?: string; color?: CategoryColor; description?: string },
  ): Promise<Category> {
    const { category } = await api.patch<{ category: Category }>(`/categories/${id}`, {
      ...patch,
    });
    categories.value = categories.value
      .map((c) => (c.id === id ? category : c))
      .sort((a, b) => a.name.localeCompare(b.name));
    return category;
  }

  /** Deleting a category never deletes bookmarks — they fall back to uncategorized. */
  async function remove(id: string): Promise<number> {
    const result = await api.del<{ deleted: boolean; bookmarksUncategorized: number }>(
      `/categories/${id}`,
    );
    categories.value = categories.value.filter((c) => c.id !== id);
    uncategorizedCount.value += result.bookmarksUncategorized;
    return result.bookmarksUncategorized;
  }

  /**
   * Local count bookkeeping after a single assignment, so the sidebar responds
   * immediately. `refresh()` remains the source of truth; this just avoids a
   * round trip for a change we already know the shape of.
   */
  function applyCountDelta(fromId: string | null, toId: string | null): void {
    if (fromId === toId) return;
    categories.value = categories.value.map((c) => {
      if (c.id === fromId) return { ...c, bookmarkCount: Math.max(0, c.bookmarkCount - 1) };
      if (c.id === toId) return { ...c, bookmarkCount: c.bookmarkCount + 1 };
      return c;
    });
    if (fromId === null) uncategorizedCount.value = Math.max(0, uncategorizedCount.value - 1);
    if (toId === null) uncategorizedCount.value += 1;
  }

  /**
   * A bookmark left the archive entirely. Distinct from `applyCountDelta(x, null)`,
   * which would move it *into* uncategorized — here nothing gains a count.
   */
  function applyRemoval(categoryId: string | null): void {
    if (categoryId === null) {
      uncategorizedCount.value = Math.max(0, uncategorizedCount.value - 1);
      return;
    }
    categories.value = categories.value.map((c) =>
      c.id === categoryId ? { ...c, bookmarkCount: Math.max(0, c.bookmarkCount - 1) } : c,
    );
  }

  const byId = computed(() => new Map(categories.value.map((c) => [c.id, c])));

  return {
    categories,
    uncategorizedCount,
    pending,
    loaded,
    error,
    byId,
    refresh,
    ensureLoaded,
    create,
    update,
    remove,
    applyCountDelta,
    applyRemoval,
  };
}
