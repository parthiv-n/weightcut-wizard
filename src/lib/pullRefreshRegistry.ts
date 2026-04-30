// Soft-refresh registry for pull-to-refresh. Pages register a callback so the
// global PullToRefresh component invalidates their data hook instead of
// reloading the page — preserves React state, keeps realtime sockets alive,
// and matches scaled-app pull-to-refresh behavior.

type PullRefreshHandler = () => void | Promise<void>;
let currentHandler: PullRefreshHandler | null = null;

export function registerPullRefresh(handler: PullRefreshHandler): () => void {
  currentHandler = handler;
  return () => {
    if (currentHandler === handler) currentHandler = null;
  };
}

export function getPullRefreshHandler(): PullRefreshHandler | null {
  return currentHandler;
}
