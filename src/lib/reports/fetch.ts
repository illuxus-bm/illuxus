// The API returns at most this many rows per request, so a report asks page by page until one comes back short.
const PAGE_SIZE = 1000;

type PageResult = { data: unknown; error: { message: string } | null };

export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}
