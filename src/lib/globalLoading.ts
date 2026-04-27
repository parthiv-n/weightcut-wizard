// Tiny module-level loading store. Survives any component unmount, so a
// loading overlay shown by page A stays visible across `navigate(...)` until
// page B explicitly hides it (or the next tick after first paint).
//
// Uses useSyncExternalStore — no zustand, no context, no provider. The store
// is a singleton that components subscribe to via the `useGlobalLoading` hook.

import { useSyncExternalStore } from "react";

export interface GlobalLoadingState {
  visible: boolean;
  title: string;
  subtitle: string;
  startedAt: number; // for "still working…" auto-subtitle promotion
}

const initialState: GlobalLoadingState = {
  visible: false,
  title: "",
  subtitle: "",
  startedAt: 0,
};

let state: GlobalLoadingState = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const globalLoading = {
  show(title: string, subtitle = "") {
    state = { visible: true, title, subtitle, startedAt: Date.now() };
    emit();
  },
  setSubtitle(subtitle: string) {
    if (!state.visible) return;
    state = { ...state, subtitle };
    emit();
  },
  hide() {
    if (!state.visible) return;
    state = { ...initialState };
    emit();
  },
  /** Convenience: hide on next animation frame (lets the destination page
   *  finish its first paint before we drop the overlay). */
  hideAfterPaint() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => globalLoading.hide());
    });
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): GlobalLoadingState {
  return state;
}

export function useGlobalLoading(): GlobalLoadingState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
