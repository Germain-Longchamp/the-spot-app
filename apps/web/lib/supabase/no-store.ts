/**
 * Next.js keeps the answers of server-side fetch() calls in its Data Cache.
 * For database reads that is wrong: on 2026-11-08 the operator panel kept
 * showing the jobs and gallery as they were at its first load after a deploy,
 * hiding every new print request. Every server-side Supabase call goes
 * through this fetch, which never caches.
 */
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
