/**
 * Supabase returns at most 1000 rows per request. Keep asking for the next page
 * until a page comes back short. `build` must use a stable ORDER BY.
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  options: { pageSize?: number; cap?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000
  const cap = options.cap ?? 200000
  const out: T[] = []
  for (let from = 0; from < cap; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}
