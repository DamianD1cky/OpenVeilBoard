export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === `function` ? patch(state) : patch;
      if (next === state || next == null) {
        return;
      }
      const merged =
        typeof state === `object` &&
        state !== null &&
        !Array.isArray(state) &&
        typeof next === `object`
          ? {
              ...state,
              ...next,
            }
          : next;
      let changed = merged !== state;
      if (changed && typeof state === `object` && state !== null && typeof merged === `object`) {
        changed =
          Object.keys(merged).some((key) => merged[key] !== state[key]) ||
          Object.keys(state).length !== Object.keys(merged).length;
      }
      if (!changed) {
        return;
      }
      const previous = state;
      state = merged;
      for (const listener of [...listeners]) {
        listener(state, previous);
      }
    },
    replace(next) {
      if (next === state) {
        return;
      }
      const previous = state;
      state = next;
      for (const listener of [...listeners]) {
        listener(state, previous);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export function createSignal(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get value() {
      return value;
    },
    set value(next) {
      if (Object.is(next, value)) {
        return;
      }
      const previous = value;
      value = next;
      for (const listener of [...listeners]) {
        listener(value, previous);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export function watch(sources, effect) {
  let cleanup = null;
  const run = () => {
    if (typeof cleanup === `function`) {
      cleanup();
    }
    cleanup = effect(...sources.map((s) => (s.get ? s.get() : s.value)));
  };
  const unsubscribes = sources.map((s) => s.subscribe(run));
  run();
  return () => {
    unsubscribes.forEach((off) => off());
    if (typeof cleanup === `function`) {
      cleanup();
    }
    cleanup = null;
  };
}
