import "server-only";

/** Lists are read a page at a time: never more rows than one page needs. */
export const PAGE_SIZE = 25;

/** SQL: one page plus one row — that extra row only tells whether there is a next page. */
export const pageLimit = (page: number) => `LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`;

/** The page's rows, and whether there are more (no COUNT query needed). */
export function paged<T>(rows: T[], page: number) {
  return { items: rows.slice(0, PAGE_SIZE), page, hasMore: rows.length > PAGE_SIZE };
}
