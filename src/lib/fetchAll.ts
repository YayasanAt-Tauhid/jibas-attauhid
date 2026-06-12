// PostgREST project ini membatasi maksimal 1000 baris per response (max_rows),
// berapa pun range yang diminta — ambil per halaman 1000 sampai habis.
const BATCH = 1000;

export async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery(from, from + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}
