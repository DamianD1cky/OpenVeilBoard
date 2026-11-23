const EPSILON = 1e-10;
const SETTLE_RATE = 16;
const REST_LIFT = 1e-6;
export function createPolaroidContact() {
  return {
    active: false,
    lift: 0,
    tiltX: 0,
    tiltZ: 0,
    pivotX: 0,
    pivotY: 0,
    pivotZ: 0,
    exposure: 1,
    nextExposure: 1,
    revision: 0,
    slopeX: 0,
    slopeZ: 0,
    minOffset: 0,
    maxOffset: 0,
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
    area: 0,
    points: [],
    hull: [],
    overlaps: [],
    overlapCache: new WeakMap(),
  };
}
function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function polygonArea(points) {
  let twiceArea = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twiceArea += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return Math.abs(twiceArea) * 0.5;
}
function convexHull(points, hull) {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  hull.length = 0;
  for (const point of points) {
    while (
      hull.length >= 2 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= EPSILON
    ) {
      hull.pop();
    }
    hull.push(point);
  }
  const lowerLength = hull.length;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const point = points[i];
    while (
      hull.length > lowerLength &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= EPSILON
    ) {
      hull.pop();
    }
    hull.push(point);
  }
  if (hull.length > 1) {
    hull.pop();
  }
}
export function updatePolaroidContact(contact, positions, normal) {
  contact.revision += 1;
  const useSlope = normal && Math.abs(normal.y) > 0.001;
  contact.slopeX = useSlope ? -normal.x / normal.y : 0;
  contact.slopeZ = useSlope ? -normal.z / normal.y : 0;
  contact.minOffset = Infinity;
  contact.maxOffset = -Infinity;
  contact.minX = Infinity;
  contact.maxX = -Infinity;
  contact.minZ = Infinity;
  contact.maxZ = -Infinity;
  const points = contact.points;
  let count = 0;
  for (const position of positions) {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      continue;
    }
    const point =
      points[count] ??
      (points[count] = {
        x: 0,
        z: 0,
      });
    point.x = position.x;
    point.z = position.z;
    count += 1;
    const offset = position.y - contact.slopeX * position.x - contact.slopeZ * position.z;
    contact.minOffset = Math.min(contact.minOffset, offset);
    contact.maxOffset = Math.max(contact.maxOffset, offset);
    contact.minX = Math.min(contact.minX, position.x);
    contact.maxX = Math.max(contact.maxX, position.x);
    contact.minZ = Math.min(contact.minZ, position.z);
    contact.maxZ = Math.max(contact.maxZ, position.z);
  }
  points.length = count;
  convexHull(points, contact.hull);
  contact.area = polygonArea(contact.hull);
  contact.active = contact.hull.length >= 3 && contact.area > EPSILON;
  if (contact.active) {
    centroid(contact.hull, contact);
    contact.pivotY =
      contact.slopeX * contact.pivotX +
      contact.slopeZ * contact.pivotZ +
      (contact.minOffset + contact.maxOffset) / 2;
  }
  return contact;
}
function centroid(points, out) {
  let x = 0;
  let z = 0;
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const cross = points[j].x * points[i].z - points[i].x * points[j].z;
    twice += cross;
    x += (points[j].x + points[i].x) * cross;
    z += (points[j].z + points[i].z) * cross;
  }
  out.pivotX = x / (3 * twice);
  out.pivotZ = z / (3 * twice);
}
function planeLift(contact, x, z) {
  return contact.lift + contact.tiltX * (x - contact.pivotX) + contact.tiltZ * (z - contact.pivotZ);
}
function overlapPolygon(first, second) {
  if (
    first.maxX <= second.minX ||
    second.maxX <= first.minX ||
    first.maxZ <= second.minZ ||
    second.maxZ <= first.minZ
  ) {
    return null;
  }
  let polygon = first.hull;
  for (let i = 0; i < second.hull.length; i += 1) {
    const a = second.hull[i];
    const b = second.hull[(i + 1) % second.hull.length];
    const clipped = [];
    let previous = polygon[polygon.length - 1];
    let previousDistance = cross(a, b, previous);
    for (const current of polygon) {
      const distance = cross(a, b, current);
      const inside = distance >= 0;
      if (inside !== previousDistance >= 0) {
        const t = previousDistance / (previousDistance - distance);
        clipped.push({
          x: previous.x + (current.x - previous.x) * t,
          z: previous.z + (current.z - previous.z) * t,
        });
      }
      if (inside) {
        clipped.push(current);
      }
      previous = current;
      previousDistance = distance;
    }
    polygon = clipped;
    if (polygon.length < 3) {
      return null;
    }
  }
  const area = polygonArea(polygon);
  return area > EPSILON
    ? {
        polygon,
        area,
      }
    : null;
}
function liftAt(lower, upper, x, z, gap) {
  return (
    (lower.slopeX - upper.slopeX) * x +
    (lower.slopeZ - upper.slopeZ) * z +
    lower.maxOffset -
    upper.minOffset +
    planeLift(lower, x, z) +
    gap
  );
}
function requiredLift(lower, upper, polygon, gap) {
  let lift = -Infinity;
  for (const point of polygon) {
    lift = Math.max(lift, liftAt(lower, upper, point.x, point.z, gap));
  }
  return lift;
}
export function solveRestingPlane(points, pivotX, pivotZ, maxSlope = 0.7) {
  let best = null;
  const n = points.length;
  for (let i = 0; i < n - 2; i += 1) {
    const a = points[i];
    const ax = a.x - pivotX;
    const az = a.z - pivotZ;
    for (let j = i + 1; j < n - 1; j += 1) {
      const b = points[j];
      const bx = b.x - pivotX;
      const bz = b.z - pivotZ;
      for (let k = j + 1; k < n; k += 1) {
        const c = points[k];
        const cx = c.x - pivotX;
        const cz = c.z - pivotZ;
        const det = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(det) < 1e-10) {
          continue;
        }
        const db = b.lift - a.lift;
        const dc = c.lift - a.lift;
        const tiltX = (db * (cz - az) - (bz - az) * dc) / det;
        const tiltZ = ((bx - ax) * dc - db * (cx - ax)) / det;
        if (tiltX * tiltX + tiltZ * tiltZ > maxSlope * maxSlope) {
          continue;
        }
        const lift = a.lift - tiltX * ax - tiltZ * az;
        if (best && lift >= best.lift) {
          continue;
        }
        let clears = true;
        for (let m = 0; m < n && clears; m += 1) {
          const p = points[m];
          clears = lift + tiltX * (p.x - pivotX) + tiltZ * (p.z - pivotZ) >= p.lift - 1e-7;
        }
        if (clears) {
          best = {
            lift,
            tiltX,
            tiltZ,
          };
        }
      }
    }
  }
  if (best) {
    return best;
  }
  let lift = 0;
  for (const point of points) {
    lift = Math.max(lift, point.lift);
  }
  return {
    lift,
    tiltX: 0,
    tiltZ: 0,
  };
}
const TILT_RATE = 14;
function settleLift(current, target, delta) {
  if (target >= current) {
    return target;
  }
  const next = target + (current - target) * Math.exp(-SETTLE_RATE * delta);
  return next - target < REST_LIFT ? target : next;
}
function settleTilt(contact, tiltX, tiltZ, delta) {
  const keep = Math.exp(-TILT_RATE * delta);
  contact.tiltX = tiltX + (contact.tiltX - tiltX) * keep;
  contact.tiltZ = tiltZ + (contact.tiltZ - tiltZ) * keep;
  if (Math.abs(contact.tiltX - tiltX) < 1e-6) {
    contact.tiltX = tiltX;
  }
  if (Math.abs(contact.tiltZ - tiltZ) < 1e-6) {
    contact.tiltZ = tiltZ;
  }
}
function supportPoints(upper, gap, out) {
  out.length = 0;
  for (const point of upper.hull) {
    out.push({
      x: point.x,
      z: point.z,
      lift: 0,
    });
  }
  for (const { polygon, lower } of upper.overlaps) {
    for (const point of polygon) {
      const lift = liftAt(lower, upper, point.x, point.z, gap);
      if (lift > REST_LIFT) {
        out.push({
          x: point.x,
          z: point.z,
          lift,
        });
      }
    }
  }
  return out;
}
const supports = [];
export function resolvePolaroidContacts(
  contacts,
  ranks,
  gap,
  delta,
  grounded = 0,
  { tilt = false } = {},
) {
  const separation = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  let changed = false;
  for (const contact of contacts) {
    if (!contact) {
      continue;
    }
    contact.overlaps.length = 0;
    contact.nextExposure = 1;
    if (!contact.active) {
      const lift = settleLift(contact.lift, 0, dt);
      changed ||= lift !== contact.lift;
      contact.lift = lift;
      if (contact.tiltX || contact.tiltZ) {
        settleTilt(contact, 0, 0, dt);
        changed = true;
      }
    }
  }
  for (let rank = grounded; rank < ranks.length; rank += 1) {
    const upper = contacts[ranks[rank]];
    if (!upper?.active) {
      continue;
    }
    let target = 0;
    for (let below = 0; below < rank; below += 1) {
      const lower = contacts[ranks[below]];
      if (!lower?.active) {
        continue;
      }
      let cached = upper.overlapCache.get(lower);
      if (
        !cached ||
        cached.lowerRevision !== lower.revision ||
        cached.upperRevision !== upper.revision
      ) {
        const polygon = overlapPolygon(lower, upper);
        cached = {
          lowerRevision: lower.revision,
          upperRevision: upper.revision,
          overlap: polygon
            ? {
                ...polygon,
                lower,
                needed: 0,
              }
            : null,
        };
        upper.overlapCache.set(lower, cached);
      }
      const overlap = cached.overlap;
      if (!overlap) {
        continue;
      }
      const needed = requiredLift(lower, upper, overlap.polygon, separation);
      target = Math.max(target, needed);
      overlap.needed = needed;
      upper.overlaps.push(overlap);
    }
    if (tilt) {
      changed = restTilted(upper, target, separation, dt) || changed;
      continue;
    }
    const lift = settleLift(upper.lift, target, dt);
    changed ||= lift !== upper.lift;
    upper.lift = lift;
  }
  for (const upper of contacts) {
    if (!upper?.active) {
      continue;
    }
    for (const { lower, area, needed } of upper.overlaps) {
      const shelterDistance = Math.max(0.04, Math.sqrt(lower.area) * 0.1);
      const proximity = Math.max(0, 1 - Math.max(0, upper.lift - needed) / shelterDistance);
      const coverage = Math.min(1, area / lower.area) * proximity;
      lower.nextExposure = Math.min(lower.nextExposure, 1 - coverage);
    }
  }
  for (const contact of contacts) {
    if (!contact) {
      continue;
    }
    changed ||= contact.exposure !== contact.nextExposure;
    contact.exposure = contact.nextExposure;
  }
  return changed;
}
function restTilted(upper, level, gap, delta) {
  const before = upper.lift + upper.tiltX + upper.tiltZ;
  if (level <= REST_LIFT) {
    settleTilt(upper, 0, 0, delta);
    upper.lift = settleLift(upper.lift, Math.max(0, level), delta);
  } else {
    supportPoints(upper, gap, supports);
    const plane = solveRestingPlane(supports, upper.pivotX, upper.pivotZ);
    settleTilt(upper, plane.tiltX, plane.tiltZ, delta);
    let clear = 0;
    for (const point of supports) {
      const below =
        point.lift -
        upper.tiltX * (point.x - upper.pivotX) -
        upper.tiltZ * (point.z - upper.pivotZ);
      clear = Math.max(clear, below);
    }
    upper.lift = Math.max(clear, settleLift(upper.lift, plane.lift, delta));
  }
  return upper.lift + upper.tiltX + upper.tiltZ !== before;
}
