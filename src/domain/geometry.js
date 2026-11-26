export const clampCoordinate = (n) =>
  Math.max(-0.5, Math.min(0.5, Number(n) || 0));

function estimateWrappedLines(text, unitsPerLine, maxLines) {
  if (!text || maxLines <= 0) return 0;
  let total = 0;
  for (const para of String(text).split("\n")) {
    let units = 0;
    let lines = 1;
    for (const ch of para) {
      const w = ch.charCodeAt(0) > 127 ? 1 : 0.56;
      if (units + w > unitsPerLine && units > 0) {
        lines++;
        units = w;
      } else {
        units += w;
      }
    }
    total += lines;
    if (total >= maxLines) return maxLines;
  }
  return Math.min(maxLines, total);
}

/**
 * Returns the physical paper width/height aspect ratio.
 * Accepts either a style string (legacy default) or a full note object
 * so short text notes shrink vertically instead of leaving empty bottom space.
 */
export const paperAspect = (styleOrNote) => {
  if (!styleOrNote || typeof styleOrNote === "string") {
    return styleOrNote === "dossier"
      ? 1.25
      : styleOrNote === "note"
        ? 1
        : 0.8;
  }
  const style = styleOrNote.cardStyle ?? "note";
  if (style === "polaroid") return 0.8;

  const hasImage = Boolean(
    styleOrNote.imageUrl ||
      styleOrNote.imagePath ||
      (Array.isArray(styleOrNote.media) && styleOrNote.media.length > 0),
  );
  if (hasImage) {
    return style === "dossier" ? 1.05 : style === "note" ? 0.9 : 0.8;
  }

  const caps = (styleOrNote.capabilities ?? []).filter((c) => c.enabled);
  const isSealed =
    styleOrNote.title === "机密便签" &&
    !styleOrNote.body &&
    caps.some((c) => c.type === "secret" && c.data?.scope !== "all");
  if (isSealed) return 1.18;

  const titleLines = Math.max(
    1,
    estimateWrappedLines(styleOrNote.title ?? "", 12, 2),
  );
  const cleanBody = String(styleOrNote.body ?? "")
    .replace(/^[ \t]*([-*+]\s+\[[ xX]\]|[-*+]|\d+\.|>)\s+/gm, "")
    .replace(/==/g, "")
    .replace(/[#*`>_~]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const bodyLines = cleanBody ? estimateWrappedLines(cleanBody, 18.5, 5) : 0;

  const topStart = style === "dossier" ? 142 : style === "urgent" ? 136 : 114;
  const hasClock = caps.some((c) => c.type === "event_clock");
  const footerH = hasClock ? 104 : 52;
  let height =
    topStart +
    titleLines * 62 +
    (bodyLines > 0 ? 22 + bodyLines * 56 : 14) +
    footerH;

  if (hasClock) height = Math.max(height, 540);

  const limits =
    style === "dossier"
      ? [420, 660]
      : style === "urgent"
        ? [460, 880]
        : [410, 768];
  const clamped = Math.max(limits[0], Math.min(limits[1], height));
  return 768 / clamped;
};
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
