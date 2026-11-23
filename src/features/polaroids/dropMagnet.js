const CAPTURE_RADIUS = 0.42;
const RELEASE_DISTANCE = 1.6;
const RESISTANCE = 0.08;
export function createDropMagnet(x, z) {
  return {
    latched: false,
    x,
    z,
  };
}
export function updateDropMagnet(state, x, z, zone) {
  state.x = x;
  state.z = z;
  if (!zone || zone.width <= 0 || zone.height <= 0) {
    state.latched = false;
    return state;
  }
  const dx = x - zone.x;
  const dz = z - zone.z;
  const distance = Math.hypot(
    dx / (zone.width * CAPTURE_RADIUS),
    dz / (zone.height * CAPTURE_RADIUS),
  );
  state.latched = state.latched ? distance <= RELEASE_DISTANCE : distance <= 1;
  if (state.latched) {
    state.x = zone.x + dx * RESISTANCE;
    state.z = zone.z + dz * RESISTANCE;
  }
  return state;
}
