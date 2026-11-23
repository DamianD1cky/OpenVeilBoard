const STORAGE_KEY = `folio:audio`;
const CHANGE_EVENT = `folio:audio-preference`;
const DEFAULT_STATE = Object.freeze({
  enabled: true,
});
let state = DEFAULT_STATE;
let hydrated = false;
function readStoredState() {
  if (typeof window === `undefined`) {
    return DEFAULT_STATE;
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (typeof saved?.enabled !== `boolean`) {
      return DEFAULT_STATE;
    }
    return Object.freeze({
      enabled: saved.enabled,
    });
  } catch {
    return DEFAULT_STATE;
  }
}
function hydrate() {
  if (!hydrated && typeof window !== `undefined`) {
    state = readStoredState();
    hydrated = true;
  }
  return state;
}
export function getAudioPreferences() {
  return hydrate();
}
export function getAudioServerSnapshot() {
  return DEFAULT_STATE;
}
export function setAudioPreferences(update) {
  const current = hydrate();
  const next = typeof update === `function` ? update(current) : update;
  state = Object.freeze({
    enabled: Boolean(next?.enabled ?? current.enabled),
  });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeAudioPreferences(listener) {
  const storageChanged = (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }
    state = readStoredState();
    hydrated = true;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener(`storage`, storageChanged);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener(`storage`, storageChanged);
  };
}
