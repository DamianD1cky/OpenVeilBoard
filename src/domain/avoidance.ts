export interface NormalizedRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  preferDir?: "left" | "right" | "down" | "up";
}

export interface AvoidCardInput {
  id: string;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

export interface AvoidOffset {
  dx: number;
  dy: number;
  yawDeg: number;
}

function rectsOverlap(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  r: NormalizedRect,
  pad = 0,
): boolean {
  return (
    ax + ahw > r.left - pad &&
    ax - ahw < r.right + pad &&
    ay + ahh > r.top - pad &&
    ay - ahh < r.bottom + pad
  );
}

function overlapArea(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  r: NormalizedRect,
): number {
  const ox = Math.max(0, Math.min(ax + ahw, r.right) - Math.max(ax - ahw, r.left));
  const oy = Math.max(0, Math.min(ay + ahh, r.bottom) - Math.max(ay - ahh, r.top));
  return ox * oy;
}

/**
 * Pure deterministic tabletop parting solver.
 * Computes temporary visual offsets so cards overlapping an open floating
 * sub-menu glide cleanly out of the way without mutating persisted note coords.
 */
export function computeAvoidanceOffsets(
  cards: readonly AvoidCardInput[],
  zone: NormalizedRect | null,
  well?: NormalizedRect | null,
): Map<string, AvoidOffset> {
  const result = new Map<string, AvoidOffset>();
  if (!zone || !cards.length) return result;

  const pad = 0.024;
  const paddedZone: NormalizedRect = {
    left: zone.left - pad,
    right: zone.right + pad,
    top: zone.top - pad,
    bottom: zone.bottom + pad,
    preferDir: zone.preferDir,
  };

  interface WorkingCard {
    id: string;
    ox: number;
    oy: number;
    x: number;
    y: number;
    halfW: number;
    halfH: number;
    moved: boolean;
  }

  const work: WorkingCard[] = cards.map((c) => ({
    id: c.id,
    ox: c.x,
    oy: c.y,
    x: c.x,
    y: c.y,
    halfW: c.halfW,
    halfH: c.halfH,
    moved: false,
  }));

  const clampTray = (c: WorkingCard) => {
    const minX = -0.485 + c.halfW;
    const maxX = 0.485 - c.halfW;
    const minY = -0.46 + c.halfH;
    const maxY = 0.485 - c.halfH;
    c.x = Math.max(minX, Math.min(maxX, c.x));
    c.y = Math.max(minY, Math.min(maxY, c.y));
  };

  const escapeZone = (c: WorkingCard) => {
    if (!rectsOverlap(c.x, c.y, c.halfW, c.halfH, paddedZone)) return;
    c.moved = true;
    const minX = -0.485 + c.halfW;
    const maxX = 0.485 - c.halfW;
    const minY = -0.46 + c.halfH;
    const maxY = 0.485 - c.halfH;

    const candidates: Array<{ dir: string; x: number; y: number }> = [
      { dir: "left", x: paddedZone.left - c.halfW, y: c.y },
      { dir: "right", x: paddedZone.right + c.halfW, y: c.y },
      { dir: "down", x: c.x, y: paddedZone.bottom + c.halfH },
      { dir: "up", x: c.x, y: paddedZone.top - c.halfH },
    ];

    let best = candidates[0];
    let bestScore = Infinity;
    for (const cand of candidates) {
      const cx = Math.max(minX, Math.min(maxX, cand.x));
      const cy = Math.max(minY, Math.min(maxY, cand.y));
      const stillInZone = overlapArea(cx, cy, c.halfW, c.halfH, paddedZone);
      const inWell = well ? overlapArea(cx, cy, c.halfW, c.halfH, well) : 0;
      const dist = Math.hypot(cx - c.ox, cy - c.oy);
      const prefBonus = cand.dir === zone.preferDir ? -0.06 : 0;
      const score = dist + prefBonus + stillInZone * 18 + inWell * 6;
      if (score < bestScore) {
        bestScore = score;
        best = { dir: cand.dir, x: cx, y: cy };
      }
    }
    c.x = best.x;
    c.y = best.y;
  };

  // Pass 1: push every overlapping card cleanly out of the sub-menu zone
  for (const c of work) escapeZone(c);
  if (!work.some((c) => c.moved)) return result;

  // Pass 2: 6 gentle relaxation steps so pushed cards fan out without piling up
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < work.length; i++) {
      const a = work[i];
      for (let j = i + 1; j < work.length; j++) {
        const b = work[j];
        if (!a.moved && !b.moved) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gapX = (a.halfW + b.halfW) * 0.88 - Math.abs(dx);
        const gapY = (a.halfH + b.halfH) * 0.88 - Math.abs(dy);
        if (gapX > 0 && gapY > 0) {
          const pushX = gapX < gapY;
          const sign = pushX ? (dx >= 0 ? 1 : -1) : dy >= 0 ? 1 : -1;
          const amount = (pushX ? gapX : gapY) * 0.45;
          if (a.moved && b.moved) {
            if (pushX) {
              a.x -= sign * amount;
              b.x += sign * amount;
            } else {
              a.y -= sign * amount;
              b.y += sign * amount;
            }
          } else if (a.moved) {
            if (pushX) a.x -= sign * amount * 1.4;
            else a.y -= sign * amount * 1.4;
          } else if (b.moved) {
            if (pushX) b.x += sign * amount * 1.4;
            else b.y += sign * amount * 1.4;
          }
        }
      }
    }
    for (const c of work) {
      if (!c.moved) continue;
      clampTray(c);
      escapeZone(c);
      if (well && rectsOverlap(c.x, c.y, c.halfW, c.halfH, well)) {
        c.x = Math.min(c.x, well.left - c.halfW - 0.015);
        clampTray(c);
      }
    }
  }

  // Pass 3: extreme-crowd fallback -> slide any still-obstructing card smoothly past rim
  for (const [idx, c] of work.entries()) {
    if (!c.moved) continue;
    const cardArea = Math.max(1e-4, 4 * c.halfW * c.halfH);
    const ratio = overlapArea(c.x, c.y, c.halfW, c.halfH, paddedZone) / cardArea;
    if (ratio > 0.14) {
      const zoneCenterX = (zone.left + zone.right) * 0.5;
      c.x = zoneCenterX >= 0 ? -0.54 - c.halfW : 0.54 + c.halfW;
    }
    const dx = c.x - c.ox;
    const dy = c.y - c.oy;
    if (Math.hypot(dx, dy) > 0.002) {
      const tiltSign = idx % 2 === 0 ? 1 : -1;
      const yawDeg = tiltSign * Math.min(4.2, Math.hypot(dx, dy) * 14);
      result.set(c.id, { dx, dy, yawDeg });
    }
  }

  return result;
}
