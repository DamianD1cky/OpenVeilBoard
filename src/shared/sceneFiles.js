const files = new Map();
export function prefetchSceneFiles(assets) {
  if (typeof fetch !== `function`) {
    return;
  }
  for (const { href, low, prefetch } of assets) {
    if (!prefetch || files.has(href)) {
      continue;
    }
    const blob = fetch(href, {
      credentials: `same-origin`,
      priority: low ? `low` : `auto`,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`${href}: ${response.status}`);
      }
      return response.blob();
    });
    blob.catch(() => {});
    files.set(href, blob);
  }
}
export function takeSceneFile(href) {
  const blob = files.get(href) ?? null;
  files.delete(href);
  return blob;
}
