const prefetched = new Set<string>();

export function prefetchRoute(importFn: () => Promise<any>, name: string) {
  if (prefetched.has(name)) return;
  prefetched.add(name);
  const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 100));
  schedule(() => { importFn().catch(() => {}); });
}
