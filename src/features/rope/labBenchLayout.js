export const CM = 0.071;
export function benchSurface(layout, bevelOffset = 0) {
  return {
    halfWidth: layout.indentWidth / 2,
    halfHeight: layout.indentHeight / 2,
    radius: layout.indentRadius,
    lip: layout.bevelSize + bevelOffset,
    floorY: -layout.indentDepth + 0.0016,
    frameTop: layout.thickness + Math.max(layout.bevelThickness, layout.indentDepth) + 0.01,
  };
}
export function rimDistance(surface, x, z) {
  const qx = Math.abs(x) - surface.halfWidth + surface.radius;
  const qz = Math.abs(z) - surface.halfHeight + surface.radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return Math.min(Math.max(qx, qz), 0) + outside - surface.radius;
}
export function benchHeight(surface, x, z, drape = 0) {
  const d = rimDistance(surface, x, z) + surface.lip;
  if (d >= 0) {
    return surface.frameTop;
  }
  if (drape <= 0) {
    return surface.floorY;
  }
  const rise = surface.frameTop - surface.floorY;
  return Math.max(surface.floorY, surface.frameTop + (d / drape) * rise);
}
export function restingTilt(surface, x, z, angle, length) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  for (let s = 0; s <= length; s += 0.005) {
    if (rimDistance(surface, x + dx * s, z + dz * s) + surface.lip >= 0) {
      return Math.atan2(surface.frameTop - surface.floorY, Math.max(s, 0.05));
    }
  }
  return 0;
}
export function isCompactBench(view) {
  return view.width / view.height < 1.1;
}
export function getBenchLayout(layout, bevelOffset = 0) {
  const surface = benchSurface(layout, bevelOffset);
  const { halfWidth: hw, halfHeight: hh } = surface;
  const compact = isCompactBench(layout.view);
  const deg = Math.PI / 180;
  const tl = [-hw, -hh];
  const tr = [hw, -hh];
  const bl = [-hw, hh];
  const br = [hw, hh];
  return {
    surface,
    tapeRoll: {
      x: tl[0] - 0.14,
      z: tl[1] - 0.2,
      angle: 0,
    },
    tapeNote: compact
      ? null
      : {
          x: tl[0] + 0.12,
          z: tl[1] + 0.92,
          angle: -11 * deg,
        },
    screws: compact
      ? null
      : [
          {
            x: tl[0] - 0.12,
            z: 0.05,
            angle: 24 * deg,
          },
          {
            x: tl[0] + 0.07,
            z: 0.16,
            angle: -38 * deg,
          },
          {
            x: tl[0] - 0.2,
            z: 0.3,
            angle: 70 * deg,
          },
          {
            x: tl[0] + 0.04,
            z: 0.38,
            angle: 150 * deg,
          },
        ],
    caliper: compact
      ? null
      : {
          x: tr[0] - 1.42,
          z: tr[1] + 0.42,
          angle: 16 * deg,
        },
    tweezers: compact
      ? null
      : {
          x: tr[0] - 0.5,
          z: -0.66,
          angle: 50 * deg,
        },
    breadboard: {
      x: br[0] + 0.04,
      z: br[1] - 0.86,
      angle: -24 * deg,
    },
    wires: compact
      ? {
          x: br[0],
          z: br[1],
          from: `right`,
        }
      : {
          x: br[0] - 0.5,
          z: br[1] - 0.2,
          from: `bottom`,
        },
    partsBox: compact
      ? null
      : {
          x: bl[0] - 0.3,
          z: bl[1] - 0.8,
          angle: 8 * deg,
        },
  };
}
