import { PerspectiveCamera, Quaternion, Vector3 } from "../../engine/index.js";
import { OPENING_BEATS, OPENING_LANDING_AT as LANDING_AT } from "./openingBeats.js";
export * from "./openingBeats.js";
const _slotA = new Vector3();
const _slotB = new Vector3();
const _slotC = new Vector3();
const _slotD = new Vector3();
export const POLAROID_STACK_STEP = 0.0014;
export const PRINT_LAND = {
  x: 0.026,
  z: 0.05,
  yaw: 0.1,
};
const _dummy = new PerspectiveCamera();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _fwd = new Vector3();
const _up = new Vector3();
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clonePose(pose) {
  return {
    position: {
      ...pose.position,
    },
    lookAt: {
      ...pose.lookAt,
    },
    up: {
      ...pose.up,
    },
    fov: pose.fov,
    near: pose.near,
    far: pose.far,
  };
}
function quatLooking(pose, out) {
  _dummy.position.set(pose.position.x, pose.position.y, pose.position.z);
  _dummy.up.set(pose.up.x, pose.up.y, pose.up.z);
  _dummy.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  return out.copy(_dummy.quaternion);
}
export function openingMarks(layout, restY, card, intro = {}) {
  const floorY = -layout.indentDepth + 0.0016;
  const slotHeight = 0.014;
  return {
    restY,
    floorY,
    zoom: intro.zoom ?? 0.65,
    viewport: {
      width: layout.pixelWidth,
      height: layout.pixelHeight,
    },
    slot: {
      x: intro.slotX ?? 0,
      y: floorY,
      z: intro.slotZ ?? 0,
    },
    seat: {
      x: PRINT_LAND.x,
      y: restY,
      z: PRINT_LAND.z,
    },
    card: {
      width: card.width,
      height: card.height,
    },
    slotSize: {
      width: card.width * 1.08,
      height: slotHeight,
      radius: slotHeight * 0.5,
      depth: 0.1,
    },
  };
}
export function closeupPose(marks, rest) {
  const zoom = marks.zoom;
  const pose = {
    ...clonePose(rest),
    position: {
      x: marks.slot.x + (rest.position.x - rest.lookAt.x) * zoom,
      y: marks.floorY + (rest.position.y - marks.floorY) * zoom,
      z: marks.slot.z + (rest.position.z - rest.lookAt.z) * zoom + marks.card.height * 1.05,
    },
    lookAt: {
      x: marks.slot.x,
      y: marks.floorY,
      z: marks.slot.z,
    },
  };
  const { width, height } = marks.viewport ?? {};
  if (width > 0 && width < 768 && height > 0) {
    const barWidth = Math.min(width * 0.4, 208);
    const distance =
      (marks.slotSize.width * height) / (2 * Math.tan((pose.fov * Math.PI) / 360) * barWidth);
    const dx = pose.position.x - pose.lookAt.x;
    const dy = pose.position.y - pose.lookAt.y;
    const dz = pose.position.z - pose.lookAt.z;
    const scale = distance / Math.hypot(dx, dy, dz);
    pose.position.x = pose.lookAt.x + dx * scale;
    pose.position.y = pose.lookAt.y + dy * scale;
    pose.position.z = pose.lookAt.z + dz * scale;
  }
  return pose;
}
export function restPose(cam) {
  return {
    position: {
      x: cam.x,
      y: cam.height,
      z: cam.z,
    },
    lookAt: {
      x: cam.lookAtX,
      y: cam.lookAtY,
      z: cam.lookAtZ,
    },
    up: {
      x: 0,
      y: 0,
      z: -1,
    },
    fov: cam.fov,
    near: cam.near,
    far: cam.far,
  };
}
export function livePose(rest, parallaxOffset) {
  const ox = parallaxOffset?.x ?? 0;
  const oz = parallaxOffset?.z ?? 0;
  const look = parallaxOffset?.look ?? 0;
  return {
    position: {
      x: rest.position.x + ox,
      y: rest.position.y,
      z: rest.position.z + oz,
    },
    lookAt: {
      x: rest.lookAt.x + ox * look,
      y: rest.lookAt.y,
      z: rest.lookAt.z + oz * look,
    },
    up: {
      ...rest.up,
    },
    fov: rest.fov,
    near: rest.near,
    far: rest.far,
  };
}
export function blendCameraPose(a, b, t) {
  const k = clamp01(t);
  if (k <= 0) {
    return clonePose(a);
  }
  if (k >= 1) {
    return clonePose(b);
  }
  quatLooking(a, _qa);
  quatLooking(b, _qb);
  _qa.slerp(_qb, k);
  const px = lerp(a.position.x, b.position.x, k);
  const py = lerp(a.position.y, b.position.y, k);
  const pz = lerp(a.position.z, b.position.z, k);
  _fwd.set(0, 0, -1).applyQuaternion(_qa);
  _up.set(0, 1, 0).applyQuaternion(_qa);
  return {
    position: {
      x: px,
      y: py,
      z: pz,
    },
    lookAt: {
      x: px + _fwd.x,
      y: py + _fwd.y,
      z: pz + _fwd.z,
    },
    up: {
      x: _up.x,
      y: _up.y,
      z: _up.z,
    },
    fov: lerp(a.fov, b.fov, k),
    near: b.near ?? a.near,
    far: b.far ?? a.far,
  };
}
export function poseForOpening(state, marks, rest) {
  const closeup = closeupPose(marks, rest);
  if (state.phase === `loading`) {
    return closeup;
  }
  if (state.phase === `playing`) {
    if (state.fall >= LANDING_AT) {
      return rest;
    }
    const arc = printArc(state, marks, marks.card);
    const peak = clonePose(rest);
    const rise = Math.max(0, arc.peakY - marks.floorY);
    peak.position.y += rise * 0.75;
    peak.lookAt.y += rise * 0.35;
    if (arc.time <= arc.peakTime) {
      const ascent = (arc.y - arc.startY) / (arc.peakY - arc.startY);
      return blendCameraPose(closeup, peak, smoothstep(ascent));
    }
    const descent = (arc.peakY - arc.y) / (arc.peakY - marks.seat.y);
    return blendCameraPose(peak, rest, smootherstep(descent));
  }
  return rest;
}
export function cameraDescending(state, marks) {
  if (state.phase === `live`) {
    return true;
  }
  if (state.phase !== `playing`) {
    return false;
  }
  const arc = printArc(state, marks, marks.card);
  return arc.time > arc.peakTime;
}
function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
function smootherstep(t) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
export function slotOpenAmount(state) {
  if (state.phase === `live`) {
    return 0;
  }
  if (state.phase !== `playing`) {
    return 1;
  }
  return 1 - smoothstep((state.fall ?? 0) / 0.2);
}
function printArc(state, marks, card) {
  const launch = state.phase === `playing` ? clamp01(state.launch) : 0;
  const fall = state.phase === `playing` ? clamp01(state.fall) : 0;
  const half = card.height * 0.5;
  const rest = marks.seat;
  const startY = marks.floorY - half - 0.016;
  const releaseY = marks.floorY + half + card.height * 0.4;
  const launchTime = OPENING_BEATS.launch;
  const flightTime = 0.96 * 0.86;
  const totalTime = launchTime + flightTime;
  const gravity =
    (2 * ((releaseY - startY) / launchTime - (rest.y - startY) / totalTime)) / flightTime;
  const velocity = (rest.y - startY) / totalTime + gravity * totalTime * 0.5;
  const peakTime = velocity / gravity;
  const elapsed = launch * launchTime + Math.min(fall, LANDING_AT) * OPENING_BEATS.flight;
  const landingTime = launchTime + OPENING_BEATS.flight * LANDING_AT;
  const t =
    elapsed <= peakTime
      ? elapsed
      : peakTime + ((elapsed - peakTime) * (totalTime - peakTime)) / (landingTime - peakTime);
  let y = startY + velocity * t - 0.5 * gravity * t * t;
  const cushionAt = peakTime + (totalTime - peakTime) * 0.35;
  if (t > cushionAt) {
    const span = totalTime - cushionAt;
    const u = clamp01((t - cushionAt) / span);
    const entryY = startY + velocity * cushionAt - 0.5 * gravity * cushionAt * cushionAt;
    const entryVelocity = velocity - gravity * cushionAt;
    y =
      (2 * u ** 3 - 3 * u ** 2 + 1) * entryY +
      (u ** 3 - 2 * u ** 2 + u) * span * entryVelocity +
      (-2 * u ** 3 + 3 * u ** 2) * rest.y;
  }
  return {
    startY,
    time: t,
    peakTime,
    peakY: startY + velocity * peakTime - 0.5 * gravity * peakTime * peakTime,
    y,
  };
}
export function printPose(state, marks, card) {
  const launch = state.phase === `playing` ? clamp01(state.launch) : 0;
  const fall = state.phase === `playing` ? clamp01(state.fall) : 0;
  const half = card.height * 0.5;
  const rest = marks.seat;
  const arc = printArc(state, marks, card);
  const travel = smootherstep(fall / LANDING_AT);
  const driftAt = LANDING_AT * 0.88;
  const driftElapsed = Math.max(0, fall - driftAt) * OPENING_BEATS.flight;
  const driftDuration = (1 - driftAt) * OPENING_BEATS.flight;
  const coast = (time) => 1 - (1 + time * 8) * Math.exp(-time * 8);
  const driftProgress = clamp01(coast(driftElapsed) / coast(driftDuration));
  const drift = driftProgress - travel;
  const flatten = smootherstep((fall - 0.04) / (LANDING_AT - 0.04));
  const settle = clamp01((fall - LANDING_AT) / (1 - LANDING_AT));
  const tap = Math.sin(settle * Math.PI) ** 2 * (1 - settle);
  const pitch = (-Math.PI / 2) * flatten + tap * 0.005;
  const clearance = fall > 0 ? Math.abs(Math.cos(pitch)) * half : 0;
  return {
    position: {
      x: lerp(marks.slot.x, rest.x, travel) + drift * card.width * 0.045,
      y: Math.max(arc.y, fall > 0 ? rest.y + clearance : arc.startY) + tap * 0.001,
      z: lerp(marks.slot.z, rest.z, travel) + drift * card.height * 0.008,
    },
    pitch,
    roll: 0,
    yaw: PRINT_LAND.yaw * travel + drift * 0.025,
    visible: launch > 0 || fall > 0,
  };
}
export function projectSlotScreen(camera, marks, width, height) {
  camera.updateWorldMatrix(true, false);
  const { slot, slotSize } = marks;
  const hw = slotSize.width * 0.5;
  const hd = slotSize.height * 0.5;
  const y = slot.y + 0.002;
  _slotA.set(slot.x - hw, y, slot.z - hd).project(camera);
  _slotB.set(slot.x + hw, y, slot.z - hd).project(camera);
  _slotC.set(slot.x + hw, y, slot.z + hd).project(camera);
  _slotD.set(slot.x - hw, y, slot.z + hd).project(camera);
  const xs = [_slotA.x, _slotB.x, _slotC.x, _slotD.x].map((x) => (x * 0.5 + 0.5) * width);
  const ys = [_slotA.y, _slotB.y, _slotC.y, _slotD.y].map((y) => (-y * 0.5 + 0.5) * height);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    width: Math.max(right - left, 2),
    height: Math.max(bottom - top, 2),
  };
}
export function applyCamera(camera, pose) {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.up.set(pose.up.x, pose.up.y, pose.up.z);
  camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  let projection = camera.fov !== pose.fov;
  camera.fov = pose.fov;
  if (pose.near != null && camera.near !== pose.near) {
    camera.near = pose.near;
    projection = true;
  }
  if (pose.far != null && camera.far !== pose.far) {
    camera.far = pose.far;
    projection = true;
  }
  if (projection) {
    camera.updateProjectionMatrix();
  }
}
