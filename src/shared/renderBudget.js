export const RENDER_DPR_MIN = 1.5;
export const RENDER_TARGET_FPS = 120;
export const ROUTE_SETTLE_MS = 2500;
export const FRAME_CALM = 0;
export const FRAME_BUSY = 1;
export const FRAME_UNSETTLED = 2;
const TARGET_INTERVAL_MS = 1e3 / RENDER_TARGET_FPS;
const DEFAULT_INTERVAL_MS = 1e3 / 60;
const FAST_INTERVAL_MIN_MS = 4;
const FAST_INTERVAL_MAX_MS = 12.5;
const FAST_RUN = 8;
const WINDOW_MS = 2e3;
const WARMUP_MS = 5e3;
const RESIZE_SETTLE_MS = 1e3;
const HITCH_MS = 100;
const APPLY_QUIET_MS = 1e3;
const DPR_STEP = 0.25;
const SLOW_WINDOWS_TO_DROP = 2;
const GOOD_WINDOWS_TO_RECOVER = 6;
const PROMOTION_TRIAL_WINDOWS = 10;
const MISS_FACTOR = 1.5;
const SLOW_MISS_RATIO = 0.08;
const STABLE_MISS_RATIO = 0.02;
const SLOW_MEAN_FACTOR = 1.25;
const STABLE_MEAN_FACTOR = 1.05;
function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
export function getRenderDprBounds({
  dprMin = RENDER_DPR_MIN,
  dprMax = 2,
  deviceDpr = RENDER_DPR_MIN,
} = {}) {
  const min = Math.max(RENDER_DPR_MIN, positive(dprMin, RENDER_DPR_MIN));
  const nativeCap = Math.max(RENDER_DPR_MIN, positive(deviceDpr, RENDER_DPR_MIN));
  const max = Math.max(min, Math.min(positive(dprMax, 2), nativeCap));
  return {
    min,
    max,
  };
}
function clearWindow(state) {
  state.elapsed = 0;
  state.frames = 0;
  state.misses = 0;
}
export function resetRenderBudget(state) {
  clearWindow(state);
  state.warmup = WARMUP_MS;
  state.badWindows = 0;
  state.goodWindows = 0;
  state.pending = null;
  state.pendingReason = null;
  state.quiet = 0;
  state.calm = false;
}
export function createRenderBudget(options = {}) {
  const { min, max } = getRenderDprBounds(options);
  const state = {
    min,
    max,
    dpr: max,
    enabled: options.enabled !== false,
    fastRun: 0,
    fastSum: 0,
    refreshMs: null,
    sincePromotion: null,
    promotionsLocked: false,
    lastReason: null,
  };
  resetRenderBudget(state);
  return state;
}
export function getRenderFrameBudget(state) {
  return state.refreshMs === null
    ? DEFAULT_INTERVAL_MS
    : Math.max(TARGET_INTERVAL_MS, state.refreshMs);
}
export function reconcileRenderDpr(state, actualDpr) {
  if (!state?.enabled || Math.abs(actualDpr - state.dpr) < 0.001) {
    return null;
  }
  return state.dpr;
}
export function noteRenderBudgetInput(state) {
  if (state) {
    state.quiet = 0;
  }
}
function noteCadence(state, frameMs) {
  if (frameMs < FAST_INTERVAL_MIN_MS || frameMs >= FAST_INTERVAL_MAX_MS) {
    state.fastRun = 0;
    state.fastSum = 0;
    return;
  }
  state.fastRun += 1;
  state.fastSum += frameMs;
  if (state.fastRun < FAST_RUN) {
    return;
  }
  const interval = state.fastSum / state.fastRun;
  state.refreshMs = state.refreshMs === null ? interval : Math.min(state.refreshMs, interval);
  state.fastRun = 0;
  state.fastSum = 0;
}
function missThreshold(state) {
  if (state.refreshMs !== null && state.refreshMs < TARGET_INTERVAL_MS) {
    return 2 * state.refreshMs + 1;
  }
  return getRenderFrameBudget(state) * MISS_FACTOR;
}
function changeDpr(state, value, reason) {
  const next = Math.min(state.max, Math.max(state.min, Math.round(value * 1e3) / 1e3));
  if (Math.abs(next - state.dpr) < 0.001) {
    return null;
  }
  state.dpr = next;
  state.lastReason = reason;
  state.badWindows = 0;
  state.goodWindows = 0;
  clearWindow(state);
  state.warmup = RESIZE_SETTLE_MS;
  state.calm = false;
  return next;
}
function applyPending(state) {
  const next = state.pending;
  const reason = state.pendingReason;
  state.pending = null;
  state.pendingReason = null;
  if (next > state.dpr) {
    state.sincePromotion = 0;
  } else if (state.sincePromotion !== null && state.sincePromotion <= PROMOTION_TRIAL_WINDOWS) {
    state.promotionsLocked = true;
  }
  return changeDpr(state, next, reason);
}
function closeWindow(state) {
  if (state.sincePromotion !== null) {
    state.sincePromotion += 1;
  }
  const budget = getRenderFrameBudget(state);
  const mean = state.elapsed / state.frames;
  const missRatio = state.misses / state.frames;
  const slow = missRatio > SLOW_MISS_RATIO || mean > budget * SLOW_MEAN_FACTOR;
  const stable = missRatio <= STABLE_MISS_RATIO && mean <= budget * STABLE_MEAN_FACTOR;
  clearWindow(state);
  state.badWindows = slow ? state.badWindows + 1 : 0;
  state.goodWindows = stable ? state.goodWindows + 1 : 0;
  if (state.badWindows >= SLOW_WINDOWS_TO_DROP && state.dpr > state.min) {
    state.pending = state.dpr - DPR_STEP;
    state.pendingReason = `sustained-slow-frames`;
  } else if (
    state.goodWindows >= GOOD_WINDOWS_TO_RECOVER &&
    state.dpr < state.max &&
    !state.promotionsLocked
  ) {
    state.pending = state.dpr + DPR_STEP;
    state.pendingReason = `sustained-stable-frames`;
  } else {
    state.pending = null;
    state.pendingReason = null;
  }
}
export function sampleRenderBudget(state, frameMs, activity = FRAME_CALM) {
  if (!state.enabled || state.min === state.max) {
    return null;
  }
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    return null;
  }
  noteCadence(state, frameMs);
  if (frameMs > HITCH_MS || activity === FRAME_UNSETTLED) {
    resetRenderBudget(state);
    return null;
  }
  const sampled = activity === FRAME_CALM && state.calm;
  state.calm = activity === FRAME_CALM;
  if (!sampled) {
    state.quiet = 0;
    return null;
  }
  state.quiet += frameMs;
  if (state.warmup > 0) {
    state.warmup = Math.max(0, state.warmup - frameMs);
    return null;
  }
  state.elapsed += frameMs;
  state.frames += 1;
  if (frameMs > missThreshold(state)) {
    state.misses += 1;
  }
  if (state.elapsed >= WINDOW_MS) {
    closeWindow(state);
  }
  if (state.pending === null || state.quiet < APPLY_QUIET_MS) {
    return null;
  }
  return applyPending(state);
}
export function createRenderSignals() {
  return {
    hidden: false,
    settled: false,
    routeChangedAt: Number.NEGATIVE_INFINITY,
    sceneTransition: false,
    pipelineWarming: false,
    mediaMoving: false,
    animating: false,
  };
}
export function classifyRenderFrame(signals, now) {
  if (
    signals.hidden ||
    !signals.settled ||
    signals.pipelineWarming ||
    signals.sceneTransition ||
    signals.mediaMoving ||
    now - signals.routeChangedAt < ROUTE_SETTLE_MS
  ) {
    return FRAME_UNSETTLED;
  }
  return signals.animating ? FRAME_BUSY : FRAME_CALM;
}
