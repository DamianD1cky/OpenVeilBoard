export function createWindSample(strokeId = 0) {
  return {
    x: 0,
    y: 0,
    time: null,
    vx: 0,
    vy: 0,
    gustX: 0,
    gustY: 0,
    gustTime: null,
    strokeId,
    strokeArmed: true,
    moveTime: null,
    dragging: false,
  };
}
export function setWindDragging(sample, dragging, strength = 0.3) {
  if (dragging && !sample.dragging) {
    const scale = Math.max(0, Math.min(1, strength));
    sample.gustX *= scale;
    sample.gustY *= scale;
  }
  sample.dragging = dragging;
}
export function sampleWindPointer(sample, x, y, time, controls, strengthScale = 1) {
  if (sample.time !== null) {
    const seconds = Math.max(0.001, (time - sample.time) / 1e3);
    sample.vx = (x - sample.x) / seconds;
    sample.vy = (y - sample.y) / seconds;
    if (x !== sample.x || y !== sample.y) {
      if (sample.moveTime !== null && time - sample.moveTime >= (controls.strokePause ?? 220)) {
        sample.strokeArmed = true;
        sample.gustX = 0;
        sample.gustY = 0;
        sample.gustTime = null;
      }
      sample.moveTime = time;
    }
    const speed = Math.hypot(sample.vx, sample.vy);
    const threshold = Math.max(0, controls.minSpeed ?? 1e3);
    const range = Math.max(1, controls.maxSpeed - threshold);
    const normalized = Math.min(1, Math.max(0, speed - threshold) / range);
    const incoming =
      normalized ** Math.max(1, controls.speedCurve ?? 2) * Math.max(0, Math.min(1, strengthScale));
    if (incoming > 0) {
      if (sample.strokeArmed) {
        sample.strokeId += 1;
        sample.strokeArmed = false;
      }
      const retained = windEnvelope(sample, time, controls.decay, 1);
      const amount = Math.max(incoming, retained);
      sample.gustX = (sample.vx / speed) * amount;
      sample.gustY = (sample.vy / speed) * amount;
      sample.gustTime = time;
    }
  }
  sample.x = x;
  sample.y = y;
  sample.time = time;
}
export function windEnvelope(sample, time, decay, strength) {
  if (sample.gustTime === null) {
    return 0;
  }
  const age = Math.max(0, (time - sample.gustTime) / 1e3);
  return Math.hypot(sample.gustX, sample.gustY) * strength * Math.exp(-decay * age);
}
export function settleWind(current, target, delta, response) {
  const next = current + (target - current) * (1 - Math.exp(-response * delta));
  return target === 0 && Math.abs(next) < 1e-5 ? 0 : next;
}
export function windFalloff(distance, radius) {
  if (radius <= 0 || distance >= radius) {
    return 0;
  }
  const t = Math.max(0, distance / radius);
  return 1 - t * t * (3 - 2 * t);
}
const WIND_FORCE_GAIN = 24;
const WIND_TORQUE_GAIN = 24;
const WIND_REST_SPEED = 1e-5;
const WIND_MAX_DELTA = 0.05;
export function createWindMotion() {
  return {
    vx: 0,
    vz: 0,
    spinVelocity: 0,
    dx: 0,
    dz: 0,
    dyaw: 0,
    strokeId: 0,
    exposure: 0,
  };
}
export function applyWindStroke(state, strokeId, x, z, torque, amount, controls) {
  if (strokeId <= 0 || amount <= 0) {
    return;
  }
  if (state.strokeId !== strokeId) {
    state.strokeId = strokeId;
    state.exposure = 0;
  }
  const added = Math.max(0, amount - state.exposure);
  state.exposure = Math.max(state.exposure, amount);
  if (added === 0) {
    return;
  }
  const mass = Math.max(0.001, controls.mass ?? 0.7);
  const impulse = (Math.max(0, controls.impulse ?? 0.08) * added) / amount / mass;
  state.vx += x * impulse * (controls.drift ?? 0.45) * WIND_FORCE_GAIN;
  state.vz += z * impulse * (controls.drift ?? 0.45) * WIND_FORCE_GAIN;
  state.spinVelocity += torque * impulse * (controls.spin ?? 0.65) * WIND_TORQUE_GAIN;
}
export function addWindMotion(wind, state, width, height) {
  const diagonal = Math.max(0.001, Math.hypot(width, height));
  const speed =
    (Math.hypot(state.vx, state.vz) + Math.abs(state.spinVelocity) * diagonal * 0.5) / diagonal;
  wind.motion += speed * speed;
}
export function stopWindMotion(state) {
  state.vx = 0;
  state.vz = 0;
  state.spinVelocity = 0;
  state.dx = 0;
  state.dz = 0;
  state.dyaw = 0;
}
export function advanceWindMotion(state, forceX, forceZ, torque, delta, controls) {
  const dt = Math.min(WIND_MAX_DELTA, Math.max(0, delta));
  const mass = Math.max(0.001, controls.mass ?? 0.7);
  const damping = Math.max(0, controls.friction ?? 2.75) / mass;
  const decay = Math.exp(-damping * dt);
  const velocityTime = damping > 0 ? -Math.expm1(-damping * dt) / damping : dt;
  const accelerationTime = damping > 0 ? (dt - velocityTime) / damping : dt * dt * 0.5;
  const forceGain = ((controls.drift ?? 0.2) * WIND_FORCE_GAIN) / mass;
  const torqueGain = ((controls.spin ?? 0.2) * WIND_TORQUE_GAIN) / mass;
  const ax = forceX * forceGain;
  const az = forceZ * forceGain;
  const angularAcceleration = torque * torqueGain;
  state.dx = state.vx * velocityTime + ax * accelerationTime;
  state.dz = state.vz * velocityTime + az * accelerationTime;
  state.dyaw = state.spinVelocity * velocityTime + angularAcceleration * accelerationTime;
  state.vx = state.vx * decay + ax * velocityTime;
  state.vz = state.vz * decay + az * velocityTime;
  state.spinVelocity = state.spinVelocity * decay + angularAcceleration * velocityTime;
  if (forceX === 0 && Math.abs(state.vx) < WIND_REST_SPEED) {
    state.vx = 0;
  }
  if (forceZ === 0 && Math.abs(state.vz) < WIND_REST_SPEED) {
    state.vz = 0;
  }
  if (torque === 0 && Math.abs(state.spinVelocity) < WIND_REST_SPEED) {
    state.spinVelocity = 0;
  }
}
export function windTiltClearance(width, height, tiltX, tiltZ, yaw, lift = 0) {
  const sx = Math.sin(tiltX);
  const cx = Math.cos(tiltX);
  const sz = Math.sin(tiltZ);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const edgeDrop =
    Math.abs(cx * sz * cy + sx * sy) * width * 0.5 +
    Math.abs(cx * sz * sy - sx * cy) * height * 0.5;
  return Math.max(0, edgeDrop - Math.max(0, lift) * cx * Math.cos(tiltZ));
}
