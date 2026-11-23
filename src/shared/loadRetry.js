export const LOAD_RETRY_DELAYS = [400, 1200];
export class LoadHttpError extends Error {
  constructor(url, status) {
    super(`${url} responded with ${status}`);
    this.name = `LoadHttpError`;
    this.status = status;
  }
}
export function isTransientLoadError(error) {
  if (!error || error.name === `AbortError`) {
    return false;
  }
  const status = error.status ?? error.response?.status;
  if (typeof status === `number`) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }
  return error.name === `TypeError`;
}
export function loadWithRetries({ manager, items, attempt, onLoad, onError }) {
  for (const item of items) {
    manager.itemStart(item);
  }
  let retries = 0;
  const run = () => {
    let settled = false;
    const resolve = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        onLoad?.(result);
      } finally {
        for (const item of items) {
          manager.itemEnd(item);
        }
      }
    };
    const reject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      const delay = LOAD_RETRY_DELAYS[retries];
      if (
        delay !== undefined &&
        isTransientLoadError(error) &&
        !manager.abortController?.signal.aborted
      ) {
        retries += 1;
        setTimeout(run, delay);
        return;
      }
      onError?.(error);
      for (const item of items) {
        manager.itemError(item);
        manager.itemEnd(item);
      }
    };
    try {
      attempt(resolve, reject);
    } catch (error) {
      reject(error);
    }
  };
  run();
}
