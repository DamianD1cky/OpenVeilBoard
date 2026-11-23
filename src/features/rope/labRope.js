import { benchHeight } from "./labBenchLayout.js";
export const ROPE_POINTS = 26;
const GRAVITY = -2.4;
const DAMPING = 0.92;
const ITERATIONS = 12;
const STIFFNESS = 0.5;
const SET = 0.003;
const MAX_TURN = 0.6;
const TAIL_STIFFNESS = 0.75;
const FABRIK_PASSES = 6;
const STICK = 4e-5;
const RIM_RAMP = 0.11;
const BOX_RAMP = 0.035;
const FEED = 1.5;
export function ropeGround(surface, x, z, radius) {
  return ground(surface, x, z, radius);
}
export function boxTop(surface, x, z) {
  let top = -Infinity;
  for (const box of surface.boxes ?? []) {
    const dx = x - box.x;
    const dz = z - box.z;
    const lx = dx * box.cos + dz * box.sin;
    const lz = -dx * box.sin + dz * box.cos;
    if (Math.abs(lx) <= box.halfWidth && Math.abs(lz) <= box.halfDepth) {
      top = Math.max(top, box.top);
    }
  }
  return top;
}
function ground(surface, x, z, radius) {
  let height = benchHeight(surface, x, z, RIM_RAMP);
  for (const box of surface.boxes ?? []) {
    const dx = x - box.x;
    const dz = z - box.z;
    const lx = dx * box.cos + dz * box.sin;
    const lz = -dx * box.sin + dz * box.cos;
    const out = Math.max(
      Math.abs(lx) - box.halfWidth,
      Math.abs(lz) - box.halfDepth,
    );
    if (out >= BOX_RAMP) {
      continue;
    }
    const top =
      out <= 0 ? box.top : box.top - (out / BOX_RAMP) * (box.top - height);
    height = Math.max(height, top);
  }
  return height + radius;
}
function smooth(path, rounds = 3) {
  let points = path;
  for (let r = 0; r < rounds; r += 1) {
    const next = [points[0]];
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      next.push(
        [ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25],
        [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75],
      );
    }
    next.push(points[points.length - 1]);
    points = next;
  }
  return points;
}
export function createRope(
  laid,
  surface,
  radius,
  { anchorZ = Infinity, anchorX = Infinity } = {},
) {
  const path = smooth(laid);
  const fine = [];
  for (let i = 1; i < path.length; i += 1) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.004));
    for (let k = i === 1 ? 0 : 1; k <= steps; k += 1) {
      const x = ax + ((bx - ax) * k) / steps;
      const z = az + ((bz - az) * k) / steps;
      fine.push([x, ground(surface, x, z, radius), z]);
    }
  }
  const along = [0];
  for (let i = 1; i < fine.length; i += 1) {
    along.push(
      along[i - 1] +
        Math.hypot(
          fine[i][0] - fine[i - 1][0],
          fine[i][1] - fine[i - 1][1],
          fine[i][2] - fine[i - 1][2],
        ),
    );
  }
  const total = along[along.length - 1];
  const position = new Float32Array(ROPE_POINTS * 3);
  let j = 1;
  for (let k = 0; k < ROPE_POINTS; k += 1) {
    const s = (k / (ROPE_POINTS - 1)) * total;
    while (j < fine.length - 1 && along[j] < s) {
      j += 1;
    }
    const t = (s - along[j - 1]) / Math.max(1e-9, along[j] - along[j - 1]);
    for (let c = 0; c < 3; c += 1) {
      position[k * 3 + c] = fine[j - 1][c] + (fine[j][c] - fine[j - 1][c]) * t;
    }
  }
  const segment = total / (ROPE_POINTS - 1);
  const rope = {
    position,
    previous: position.slice(),
    rest: new Float32Array(ROPE_POINTS - 1).fill(segment),
    fed: 1,
    turn: turns(position),
    radius,
    grabbed: -1,
    target: {
      x: 0,
      y: 0,
      z: 0,
    },
    anchorZ,
    anchorX,
    plugged: null,
    awake: true,
    still: 0,
  };
  for (let i = 0; i < 90; i += 1) {
    stepRope(rope, surface, 1 / 60);
  }
  rope.previous.set(rope.position);
  return rope;
}
export function stepRope(rope, surface, dt) {
  const p = rope.position;
  const q = rope.previous;
  const n = ROPE_POINTS;
  const plug = rope.plugged;
  const pinned = (i) =>
    i === n - 1 || i === rope.grabbed || (plug !== null && i === 0);
  const g = GRAVITY * dt * dt;
  if (plug) {
    holdPlug(rope);
  }
  if (rope.grabbed >= 0) {
    let reach = 0;
    for (let i = rope.grabbed; i < n - 1; i += 1) {
      reach += rope.rest[i];
    }
    reach *= 0.97;
    const pin = (n - 1) * 3;
    const t = rope.target;
    let dx = t.x - p[pin];
    let dz = t.z - p[pin + 2];
    let d = Math.hypot(dx, dz);
    if (d > reach && Number.isFinite(rope.anchorZ)) {
      let x = t.x - (dx / d) * reach;
      let z = t.z - (dz / d) * reach;
      if (z < rope.anchorZ && x < rope.anchorX) {
        if (rope.anchorZ - z <= rope.anchorX - x) {
          z = rope.anchorZ;
        } else {
          x = rope.anchorX;
        }
      }
      const mx = x - p[pin];
      const mz = z - p[pin + 2];
      for (let i = rope.grabbed + 1; i < n; i += 1) {
        const share = (i - rope.grabbed) / (n - 1 - rope.grabbed);
        p[i * 3] += mx * share;
        p[i * 3 + 2] += mz * share;
        q[i * 3] += mx * share;
        q[i * 3 + 2] += mz * share;
      }
      dx = t.x - p[pin];
      dz = t.z - p[pin + 2];
      d = Math.hypot(dx, dz);
      if (d > reach && rope.fed < FEED) {
        const k = Math.min(d / reach, FEED / rope.fed);
        for (let i = 0; i < n - 1; i += 1) {
          rope.rest[i] *= k;
        }
        rope.fed *= k;
        reach *= k;
      }
    }
    if (d > reach) {
      const k = reach / d;
      t.x = p[pin] + dx * k;
      t.z = p[pin + 2] + dz * k;
    }
    if (plug && rope.grabbed > 1) {
      let span = 0;
      for (let i = 1; i < rope.grabbed; i += 1) {
        span += rope.rest[i];
      }
      span *= 0.97;
      const ex = t.x - p[3];
      const ez = t.z - p[5];
      const e = Math.hypot(ex, ez);
      if (e > span) {
        t.x = p[3] + (ex / e) * span;
        t.z = p[5] + (ez / e) * span;
      }
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    const k = i * 3;
    if (i === rope.grabbed || (plug && i === 0)) {
      q[k] = p[k];
      q[k + 1] = p[k + 1];
      q[k + 2] = p[k + 2];
      continue;
    }
    const vx = (p[k] - q[k]) * DAMPING;
    const vy = (p[k + 1] - q[k + 1]) * DAMPING;
    const vz = (p[k + 2] - q[k + 2]) * DAMPING;
    q[k] = p[k];
    q[k + 1] = p[k + 1];
    q[k + 2] = p[k + 2];
    p[k] += vx;
    p[k + 1] += vy + g;
    p[k + 2] += vz;
  }
  if (rope.grabbed >= 0) {
    drag(rope);
  }
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 3;
      const b = a + 3;
      const dx = p[b] - p[a];
      const dy = p[b + 1] - p[a + 1];
      const dz = p[b + 2] - p[a + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const wa = pinned(i) ? 0 : 1;
      const wb = pinned(i + 1) ? 0 : 1;
      if (wa + wb === 0) {
        continue;
      }
      const diff = (d - rope.rest[i]) / d / (wa + wb);
      p[a] += dx * diff * wa;
      p[a + 1] += dy * diff * wa;
      p[a + 2] += dz * diff * wa;
      p[b] -= dx * diff * wb;
      p[b + 1] -= dy * diff * wb;
      p[b + 2] -= dz * diff * wb;
    }
    for (let i = 1; i < n - 1; i += 1) {
      const a = (i - 1) * 3;
      const c = (i + 1) * 3;
      const wa = pinned(i - 1) ? 0 : 1;
      const wc = pinned(i + 1) ? 0 : 1;
      if (wa + wc === 0) {
        continue;
      }
      const dx = p[c] - p[a];
      const dy = p[c + 1] - p[a + 1];
      const dz = p[c + 2] - p[a + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const span =
        (rope.rest[i - 1] + rope.rest[i]) * Math.cos(rope.turn[i] / 2);
      const diff = (((d - span) / d) * STIFFNESS) / (wa + wc);
      p[a] += dx * diff * wa;
      p[a + 1] += dy * diff * wa;
      p[a + 2] += dz * diff * wa;
      p[c] -= dx * diff * wc;
      p[c + 1] -= dy * diff * wc;
      p[c + 2] -= dz * diff * wc;
    }
  }
  if (rope.grabbed >= 0) {
    const angle = turns(p);
    for (let i = 1; i < n - 1; i += 1) {
      const turn = rope.turn[i] + (angle[i] - rope.turn[i]) * SET;
      rope.turn[i] = Math.max(-MAX_TURN, Math.min(MAX_TURN, turn));
    }
  }
  let motion = 0;
  for (let i = 0; i < n; i += 1) {
    const k = i * 3;
    const floor = ground(surface, p[k], p[k + 2], rope.radius);
    if (p[k + 1] < floor) {
      p[k + 1] = floor;
      if (!pinned(i)) {
        q[k] += (p[k] - q[k]) * 0.5;
        q[k + 2] += (p[k + 2] - q[k + 2]) * 0.5;
        q[k + 1] = p[k + 1];
        if (Math.hypot(p[k] - q[k], p[k + 2] - q[k + 2]) < STICK) {
          q[k] = p[k];
          q[k + 2] = p[k + 2];
        }
      }
    }
    motion = Math.max(
      motion,
      Math.abs(p[k] - q[k]),
      Math.abs(p[k + 1] - q[k + 1]),
      Math.abs(p[k + 2] - q[k + 2]),
    );
  }
  return motion;
}
function turns(p) {
  const out = new Float32Array(ROPE_POINTS);
  for (let i = 1; i < ROPE_POINTS - 1; i += 1) {
    const ax = p[i * 3] - p[i * 3 - 3];
    const az = p[i * 3 + 2] - p[i * 3 - 1];
    const bx = p[i * 3 + 3] - p[i * 3];
    const bz = p[i * 3 + 5] - p[i * 3 + 2];
    if (Math.min(Math.hypot(ax, az), Math.hypot(bx, bz)) < 0.001) {
      continue;
    }
    out[i] = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
  }
  return out;
}
function follow(p, i, j, length) {
  const a = i * 3;
  const b = j * 3;
  const dx = p[a] - p[b];
  const dy = p[a + 1] - p[b + 1];
  const dz = p[a + 2] - p[b + 2];
  const d = Math.hypot(dx, dy, dz) || 1e-9;
  p[a] = p[b] + (dx / d) * length;
  p[a + 1] = p[b + 1] + (dy / d) * length;
  p[a + 2] = p[b + 2] + (dz / d) * length;
}
function drag(rope) {
  const p = rope.position;
  const n = ROPE_POINTS;
  const g = rope.grabbed;
  const k = g * 3;
  p[k] = rope.target.x;
  p[k + 1] = rope.target.y;
  p[k + 2] = rope.target.z;
  if (rope.plugged) {
    for (let pass = 0; pass < FABRIK_PASSES; pass += 1) {
      for (let i = 2; i < g; i += 1) {
        follow(p, i, i - 1, rope.rest[i - 1]);
      }
      for (let i = g - 1; i >= 2; i -= 1) {
        follow(p, i, i + 1, rope.rest[i]);
      }
    }
  }
  for (let i = rope.plugged ? -1 : g - 1; i >= 0; i -= 1) {
    const a = i * 3;
    const b = (i + 1) * 3;
    const c = (i + 2) * 3;
    let lx = p[a] - p[b];
    let lz = p[a + 2] - p[b + 2];
    const ll = Math.hypot(lx, lz) || 1e-9;
    lx /= ll;
    lz /= ll;
    let sx = p[b] - p[c];
    let sz = p[b + 2] - p[c + 2];
    const sl = Math.hypot(sx, sz) || 1e-9;
    sx /= sl;
    sz /= sl;
    const angle = -rope.turn[i + 1];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = sx * cos - sz * sin;
    const tz = sx * sin + sz * cos;
    let dx = tx * TAIL_STIFFNESS + lx * (1 - TAIL_STIFFNESS);
    let dz = tz * TAIL_STIFFNESS + lz * (1 - TAIL_STIFFNESS);
    const dl = Math.hypot(dx, dz) || 1e-9;
    dx /= dl;
    dz /= dl;
    const dy = Math.max(
      -0.9,
      Math.min(0.9, (p[a + 1] - p[b + 1]) / rope.rest[i]),
    );
    const flat = Math.sqrt(1 - dy * dy);
    p[a] = p[b] + dx * flat * rope.rest[i];
    p[a + 1] = p[b + 1] + dy * rope.rest[i];
    p[a + 2] = p[b + 2] + dz * flat * rope.rest[i];
  }
  for (let pass = 0; pass < FABRIK_PASSES; pass += 1) {
    for (let i = n - 2; i > g; i -= 1) {
      follow(p, i, i + 1, rope.rest[i]);
    }
    for (let i = g + 1; i < n - 1; i += 1) {
      follow(p, i, i - 1, rope.rest[i - 1]);
    }
  }
}
function holdPlug(rope) {
  const p = rope.position;
  const { x, y, z } = rope.plugged;
  p[0] = x;
  p[1] = y;
  p[2] = z;
  // Note links anchor the endpoint; the neighbouring node remains flexible.
}
export function plugRope(rope, socket) {
  rope.plugged = socket;
  if (rope.grabbed >= 0 && rope.grabbed < 2) {
    rope.grabbed = -1;
  }
  holdPlug(rope);
  rope.previous.set(rope.position.subarray(0, 6), 0);
  rope.awake = true;
}
export function unplugRope(rope) {
  rope.plugged = null;
  rope.awake = true;
}
