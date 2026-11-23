export const clampCoordinate = (n) =>
  Math.max(-0.5, Math.min(0.5, Number(n) || 0));
export const paperAspect = (style) =>
  style === "dossier" ? 1.25 : style === "note" ? 1 : 0.8;
export const legacyToNormalized = (x, y) => ({
  x: clampCoordinate((x - 44) / (2144 - 88) - 0.5),
  y: clampCoordinate((y - 44) / (1206 - 88) - 0.5),
});
export const normalizedToLegacy = (x, y) => ({
  x: Math.round((clampCoordinate(x) + 0.5) * (2144 - 88) + 44),
  y: Math.round((clampCoordinate(y) + 0.5) * (1206 - 88) + 44),
});
export function visibleEdges(notes, edges) {
  const active = new Set(notes.filter((n) => !n.archivedAt).map((n) => n.id));
  return edges.filter(
    (e) => active.has(e.fromNoteId) && active.has(e.toNoteId),
  );
}
// SAT handles both card rotations. The solver is bounded for crowded tables.
export function overlap(a, b) {
  const axes = [a.rotation, b.rotation].flatMap((r) => {
    const angle = (r * Math.PI) / 180;
    return [
      [Math.cos(angle), Math.sin(angle)],
      [-Math.sin(angle), Math.cos(angle)],
    ];
  });
  let best = null;
  for (const [ax, ay] of axes) {
    const radius = (card) => {
      const r = (card.rotation * Math.PI) / 180;
      return (
        (Math.abs(ax * Math.cos(r) + ay * Math.sin(r)) * card.width) / 2 +
        (Math.abs(-ax * Math.sin(r) + ay * Math.cos(r)) * card.height) / 2
      );
    };
    const distance = (a.x - b.x) * ax + (a.y - b.y) * ay;
    const depth = radius(a) + radius(b) + 0.012 - Math.abs(distance);
    if (depth <= 0) return null;
    if (!best || depth < best.depth)
      best = {
        depth,
        x: ax * (distance < 0 ? -1 : 1),
        y: ay * (distance < 0 ? -1 : 1),
      };
  }
  return best;
}
export function settlePosition(card, others, bounds = { x: 0.45, y: 0.38 }) {
  const next = { ...card };
  for (let i = 0; i < 12; i++) {
    let changed = false;
    for (const other of others) {
      if (other.id === next.id) continue;
      const hit = overlap(next, other);
      if (!hit) continue;
      next.x += hit.x * hit.depth;
      next.y += hit.y * hit.depth;
      changed = true;
    }
    next.x = Math.max(-bounds.x, Math.min(bounds.x, next.x));
    next.y = Math.max(-bounds.y, Math.min(bounds.y, next.y));
    if (!changed) break;
  }
  return { x: next.x, y: next.y };
}
export function findFreePosition(
  card,
  others,
  bounds,
  reserved = [],
  preferred = { x: 0, y: 0 },
) {
  const candidates = [preferred];
  for (let y = -3; y <= 3; y++)
    for (let x = -4; x <= 4; x++)
      candidates.push({ x: (bounds.x * x) / 4, y: (bounds.y * y) / 3 });
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.y - preferred.y) -
      Math.hypot(b.x - preferred.x, b.y - preferred.y),
  );
  for (const point of candidates) {
    if (Math.abs(point.x) > bounds.x || Math.abs(point.y) > bounds.y) continue;
    if (
      ![...others, ...reserved].some((other) =>
        overlap({ ...card, ...point }, other),
      )
    )
      return point;
  }
  return settlePosition({ ...card, ...preferred }, others, bounds);
}
