import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Vector3,
  uniform,
} from "../engine/index.js";
import { FACTORY_DEFAULTS } from "./sceneControlDefaults.js";
import { noRaycast } from "./runtime/events.js";
function prefersReducedMotion() {
  return (
    typeof window !== `undefined` && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches
  );
}
const DUST_WGSL = `
fn dustHash(seed: f32) -> f32 {
  let state = u32(seed) * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((word >> 22u) ^ word) * 2.3283064365386963e-10;
}

fn dustId(instance: u32) -> f32 {
  return f32(instance) + material.dustSeed * 17.13;
}

fn dustCenter(id: f32) -> vec3f {
  let hx = dustHash(id);
  let hy = dustHash(id + 19.0);
  let hz = dustHash(id + 47.0);
  let hsx = dustHash(id + 73.0);
  let hsy = dustHash(id + 101.0);
  let hsz = dustHash(id + 131.0);
  let t = frame.time * material.dustSpeed;
  let rise = (t * material.dustRise) * (hsy * 0.6 + 0.4);
  let wrappedY = fract(hy + rise);
  let sway = vec3f(
    sin(t * (hsx * 0.55 + 0.2) + hx * 6.28318) * material.dustDrift,
    cos(t * (hsy * 0.35 + 0.15) + hy * 6.28318) * (material.dustDrift * 0.32),
    sin(t * (hsz * 0.5 + 0.22) + hz * 6.28318) * material.dustDrift,
  );
  return vec3f(
    (hx - 0.5) * material.dustExtent.x + sway.x,
    (wrappedY - 0.5) * material.dustExtent.y + sway.y,
    (hz - 0.5) * material.dustExtent.z + sway.z,
  ) + material.dustOrigin;
}

fn dustAlpha(coord: vec2f, id: f32, center: vec3f) -> f32 {
  let d = length(coord - vec2f(0.5)) * 2.0;
  let disc = pow(1.0 - clamp(d, 0.0, 1.0), material.dustSoftness);
  let tw = sin(frame.time * material.dustTwinkle * (dustHash(id + 173.0) * 0.7 + 0.3) + dustHash(id + 193.0) * 6.28318) * 0.5 + 0.5;
  let flicker = mix(0.48, 1.0, tw);
  let dist = length(center - frame.cameraPosition);
  let nearFade = smoothstep(material.dustNear, material.dustNear + 0.7, dist);
  let farFade = 1.0 - smoothstep(material.dustFar * 0.72, material.dustFar, dist);
  let halfH = material.dustExtent.y * 0.5;
  let top = material.dustOrigin.y + halfH;
  let bot = material.dustOrigin.y - halfH;
  let band = max(halfH * 0.1, 0.16);
  let yFade = smoothstep(bot, bot + band, center.y) * smoothstep(top, top - band, center.y);
  return disc * material.dustOpacity * flicker * nearFade * farFade * yFade;
}
`;
function createDustMaterial(u) {
  const material = new MeshBasicMaterial({
    color: u.color,
  });
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.toneMapped = false;
  material.blending = AdditiveBlending;
  material.hooks = {
    key: `dust-sprite`,
    uniforms: u.block,
    varyings: {
      instance: `u32`,
      center: `vec3f`,
    },
    functions: DUST_WGSL,
    vertex: `
  let dustIdV = dustId(instanceIndex);
  let dustCentre = dustCenter(dustIdV);
  positionLocal = dustCentre;
  v.instance = instanceIndex;
  v.center = dustCentre;`,
    clip: `
  {
    let angle = dustHash(dustIdV + 211.0) * 6.28318 + frame.time * (material.dustSpeed * 0.18);
    let c = cos(angle);
    let s = sin(angle);
    let scale = mix(material.dustSize, material.dustSize * material.dustSizeJitter, dustHash(dustIdV + 151.0));
    let corner = in.position.xy * (vec2f(length(object.model[0].xyz), length(object.model[1].xyz)) * vec2f(scale));
    let offset = mat2x2f(c, s, -s, c) * corner;
    clipPosition = frame.projection * vec4f(positionView.xy + offset, positionView.z, 1.0);
  }`,
    opacityNode: `dustAlpha(uv, dustId(v.instance), v.center)`,
  };
  return material;
}
export class DustField {
  constructor(ctx) {
    this.ctx = ctx;
    const dust = ctx.controls.dust ?? FACTORY_DEFAULTS.dust;
    const reduceMotion = prefersReducedMotion();
    const block = {
      dustOpacity: uniform(dust.opacity),
      dustSize: uniform(dust.size),
      dustSizeJitter: uniform(Math.max(dust.sizeJitter, 1)),
      dustSpeed: uniform(reduceMotion ? 0 : dust.speed),
      dustDrift: uniform(reduceMotion ? 0 : dust.drift),
      dustRise: uniform(reduceMotion ? 0 : dust.rise),
      dustTwinkle: uniform(reduceMotion ? 0 : dust.twinkle),
      dustSoftness: uniform(Math.max(dust.softness, 0.2)),
      dustExtent: uniform(new Vector3(dust.width, dust.height, dust.depth)),
      dustOrigin: uniform(new Vector3(dust.x, dust.y, dust.z)),
      dustNear: uniform(dust.near),
      dustFar: uniform(Math.max(dust.far, dust.near + 0.8)),
      dustSeed: uniform(dust.seed),
    };
    this.material = createDustMaterial({
      color: new Color(dust.color),
      block,
    });
    this.material.blending = dust.additive ? AdditiveBlending : NormalBlending;
    this.geometry = new PlaneGeometry(1, 1);
    this.object = null;
    if (!dust.enabled || dust.count < 1) {
      return;
    }
    const mesh = new InstancedMesh(this.geometry, this.material, Math.floor(dust.count));
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.raycast = noRaycast;
    this.object = mesh;
  }
  dispose() {
    this.object?.removeFromParent();
    this.material.dispose();
    this.geometry.dispose();
  }
}
