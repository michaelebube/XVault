import type { BookmarkQuery, CategorizationSource } from '~/types/api';

/**
 * The library's filter state lives in the URL, not in a store.
 *
 * That makes every view shareable and back-button-correct — "uncategorized,
 * with media, page 3" is a link — and it keeps the topbar and the list from
 * holding two copies of the same truth. The page simply watches the route.
 */
export function useLibraryQuery() {
  const route = useRoute();
  const router = useRouter();

  const filters = computed<BookmarkQuery>(() => {
    const q = route.query;
    const str = (key: string): string | undefined => {
      const value = Array.isArray(q[key]) ? q[key][0] : q[key];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    };

    const source = str('source');
    const sort = str('sort');

    return {
      q: str('q'),
      categoryId: str('category'),
      author: str('author'),
      ...(str('media') === '1' ? { hasMedia: true } : {}),
      ...(str('links') === '1' ? { hasLinks: true } : {}),
      ...(source === 'manual' || source === 'ai' || source === 'uncategorized'
        ? { source: source as CategorizationSource }
        : {}),
      ...(str('pending') === '1' ? { pendingSuggestion: true } : {}),
      sort:
        sort === 'oldest' || sort === 'tweet_newest' || sort === 'tweet_oldest'
          ? sort
          : 'newest',
      page: Number(str('page') ?? '1') || 1,
    };
  });

  /**
   * Patch the query string. Any change other than paging resets to page 1 —
   * landing on "page 4 of 2 results" is a classic filter bug.
   */
  function patch(next: Record<string, string | undefined>): void {
    const query: Record<string, string> = {};
    const merged = { ...route.query, ...next } as Record<string, unknown>;

    if (!('page' in next)) delete merged.page;

    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value.length > 0) query[key] = value;
    }

    void router.push({ path: route.path, query });
  }

  function clear(): void {
    void router.push({ path: route.path, query: {} });
  }

  const activeFilterCount = computed(() => {
    const f = filters.value;
    return [f.author, f.hasMedia, f.hasLinks, f.source, f.pendingSuggestion].filter(Boolean).length;
  });

  return { filters, patch, clear, activeFilterCount };
}
