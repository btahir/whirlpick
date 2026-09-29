// A tiny external store (PLAN §6.3): getState / subscribe / dispatch, read in components with
// useSyncExternalStore and selector hooks.
import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import { reducer } from "./reducer";
import type { Action, AppState } from "./types";

export interface Store {
  getState(): AppState;
  dispatch(a: Action): void;
  subscribe(fn: () => void): () => void;
}

export function createStore(initial: AppState, reduce: (s: AppState, a: Action) => AppState = reducer): Store {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(a) {
      const next = reduce(state, a);
      if (next === state) return;
      state = next;
      for (const fn of [...subs]) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreContext missing");
  return s;
}

/** Subscribe to a slice. The selector result is compared with Object.is (or `eq`). */
export function useSel<T>(sel: (s: AppState) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  const store = useStore();
  const last = useRef<{ v: T; state: AppState } | null>(null);
  const get = () => {
    const state = store.getState();
    // Same state object → same snapshot (useSyncExternalStore requires a cached result).
    if (last.current && last.current.state === state) return last.current.v;
    const v = sel(state);
    if (last.current && eq(last.current.v, v)) {
      last.current = { v: last.current.v, state };
      return last.current.v;
    }
    last.current = { v, state };
    return v;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

export function shallowEq<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
