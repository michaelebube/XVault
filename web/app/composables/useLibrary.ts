import type { Bookmark, BookmarkListResponse, BookmarkQuery } from '~/types/api';

/**
 * The library list.
 *
 * Page-local on purpose (plain `ref`, not `useState`): the list is a view of a
 * query, and two places showing two different queries should not fight over one
 * cache. Categories and sync status are the opposite — genuinely global — which
 * is why those composables use `useState` and this one does not.
 */
export function useLibrary() {
  const api = useApi();

  const items = ref<Bookmark[]>([]);
  const page = ref(1);
  const limit = ref(24);
  const total = ref(0);
  const totalPages = ref(1);
  const pending = ref(false);
  const error = ref<string | null>(null);
  const loadedOnce = ref(false);

  /** Guards against an older, slower response overwriting a newer one. */
  let requestSeq = 0;

  async function load(query: BookmarkQuery = {}): Promise<void> {
    const seq = ++requestSeq;
    pending.value = true;
    error.value = null;

    try {
      const data = await api.get<BookmarkListResponse>('/bookmarks', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.author ? { author: query.author } : {}),
        ...(query.hasMedia !== undefined ? { hasMedia: query.hasMedia } : {}),
        ...(query.hasLinks !== undefined ? { hasLinks: query.hasLinks } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.pendingSuggestion ? { pendingSuggestion: true } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
        page: query.page ?? 1,
        limit: query.limit ?? limit.value,
      });

      if (seq !== requestSeq) return;

      items.value = data.items;
      page.value = data.page;
      limit.value = data.limit;
      total.value = data.total;
      totalPages.value = data.totalPages;
      loadedOnce.value = true;
    } catch (err) {
      if (seq !== requestSeq) return;
      error.value = errorMessage(err, 'Could not load your archive.');
    } finally {
      if (seq === requestSeq) pending.value = false;
    }
  }

  /** Swap one bookmark in place after a mutation, without refetching the page. */
  function replace(updated: Bookmark): void {
    items.value = items.value.map((b) => (b.id === updated.id ? updated : b));
  }

  function remove(id: string): void {
    items.value = items.value.filter((b) => b.id !== id);
    total.value = Math.max(0, total.value - 1);
  }

  return { items, page, limit, total, totalPages, pending, error, loadedOnce, load, replace, remove };
}

/**
 * Mutations that act on a single bookmark.
 *
 * Each one returns the re-serialized bookmark, so the caller can swap it into
 * the list with `replace()` instead of refetching the page — the archive does
 * not shift under the user because they filed one thing.
 */
export function useBookmarkActions() {
  const api = useApi();
  const unwrap = (p: Promise<{ bookmark: Bookmark }>) => p.then((r) => r.bookmark);

  return {
    setCategory: (id: string, categoryId: string | null) =>
      unwrap(api.patch<{ bookmark: Bookmark }>(`/bookmarks/${id}/category`, { categoryId })),
    acceptSuggestion: (id: string) =>
      unwrap(api.post<{ bookmark: Bookmark }>(`/bookmarks/${id}/suggestion/accept`)),
    rejectSuggestion: (id: string) =>
      unwrap(api.post<{ bookmark: Bookmark }>(`/bookmarks/${id}/suggestion/reject`)),
    updateNotes: (id: string, notes: string) =>
      unwrap(api.patch<{ bookmark: Bookmark }>(`/bookmarks/${id}/notes`, { notes })),
    remove: (id: string) => api.del<{ deleted: boolean }>(`/bookmarks/${id}`),
  };
}
