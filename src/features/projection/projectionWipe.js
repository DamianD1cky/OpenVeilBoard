import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector2,
  Vector4,
  uniform,
} from "../../engine/index.js";
import { delay, duration, ease, reveal } from "../../shared/motionConfig.js";

export const PROJECTION_WIPE = {
  duration: duration.wipe,
  outDuration: duration.exit,
  delay: delay.wipe,
  easeIn: ease.thomas,
  easeOut: ease.thomas,
  soft: 0.16,
  overshoot: reveal.overshoot,
  glowWidth: 0.12,
  glow: 0.18,
  glowBloom: 0.22,
  glowColor: "#fff4dc",
};

export function createSharedWipe(projection) {
  const shared = {
    uFade: uniform(0),
    uFeather: uniform(projection.feather ?? 0.065),
    uOpacity: uniform(projection.opacity ?? 0.96),
    uWash: uniform(projection.wash ?? 0.12),
    uWashColor: uniform(new Color(projection.washColor ?? "#e8dcc8")),
    uBrightness: uniform(projection.brightness ?? 1.24),
    uWipeSoft: uniform(PROJECTION_WIPE.soft),
    uWipeOvershoot: uniform(PROJECTION_WIPE.overshoot),
    uGlowWidth: uniform(PROJECTION_WIPE.glowWidth),
    uGlow: uniform(PROJECTION_WIPE.glow),
    uGlowBloom: uniform(PROJECTION_WIPE.glowBloom),
    uGlowColor: uniform(new Color(PROJECTION_WIPE.glowColor)),
    uStripLeft: uniform(-1),
    uStripRight: uniform(1),
    uStripFeather: uniform(0.06),
    uStripEndFeather: uniform(0),
    uStripZ: uniform(0),
    uStripHeight: uniform(1),
    uCompact: uniform(0),
    uVertical: uniform(0),
    uInspect: uniform(0),
    uViewerTaper: uniform(0),
  };
  updateSharedWipe(shared, projection);
  return shared;
}

export function updateSharedWipe(shared, projection) {
  shared.uFeather.value = projection.feather ?? 0.065;
  shared.uOpacity.value = projection.opacity ?? 0.96;
  shared.uWash.value = projection.wash ?? 0.12;
  shared.uWashColor.value.set(projection.washColor ?? "#e8dcc8");
  shared.uBrightness.value = projection.brightness ?? 1.24;
  shared.uWipeSoft.value = PROJECTION_WIPE.soft;
  shared.uWipeOvershoot.value = PROJECTION_WIPE.overshoot;
  shared.uGlowWidth.value = PROJECTION_WIPE.glowWidth;
  shared.uGlow.value = PROJECTION_WIPE.glow;
  shared.uGlowBloom.value = PROJECTION_WIPE.glowBloom;
  shared.uGlowColor.value.set(PROJECTION_WIPE.glowColor);
}

let stillPlaceholder = null;
export function getSlidePlaceholder() {
  if (!stillPlaceholder) {
    const map = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    map.colorSpace = SRGBColorSpace;
    map.magFilter = LinearFilter;
    map.minFilter = LinearMipmapLinearFilter;
    map.needsUpdate = true;
    stillPlaceholder = map;
  }
  return stillPlaceholder;
}

const SLIDE_WGSL = `
struct SlideWipe { color: vec3f, alpha: f32, emissive: vec3f };

fn slideRoundedBox(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let q = abs(p) - halfSize + vec2f(radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
}

fn slideWipe(surfaceCoord: vec2f, shadow: f32) -> SlideWipe {
  let size = material.sSize;
  let compact = material.uCompact;
  let vertical = material.uVertical;
  let viewerProgress = clamp(material.sViewerProgress, 0.0, 1.0);
  let castShadowTint = mix(vec3f(shadow), vec3f(1.0), viewerProgress);
  let projectionAmount = 1.0 - viewerProgress;
  let inspectAmount = max(viewerProgress, material.uInspect);
  let cleanAmount = inspectAmount * 0.45;
  let effectAmount = 1.0 - cleanAmount;
  let taperAmount = mix(1.0, clamp(material.uViewerTaper, 0.0, 1.0) * 0.65, inspectAmount);
  let maskEpsilon = 0.000001;
  let stripLeft = material.uStripLeft;
  let stripRight = material.uStripRight;
  let stripZ = material.uStripZ;
  let stripHeight = material.uStripHeight;
  let sourceBounds = vec4f(stripLeft, stripRight, stripZ, stripHeight);
  let viewerBounds = mix(sourceBounds, material.sViewerBounds, viewerProgress);
  let viewerLeft = viewerBounds.x;
  let viewerRight = viewerBounds.y;
  let worldX = material.sX + (surfaceCoord.x - 0.5) * size.x;
  let worldZ = material.sZ - (surfaceCoord.y - 0.5) * size.y;

  let stripDistance = mix(
    abs(worldX - (viewerLeft + viewerRight) * 0.5) / max((viewerRight - viewerLeft) * 0.5, 0.001),
    abs(worldZ - viewerBounds.z) / max(viewerBounds.w * 0.5, 0.001),
    vertical);
  let centerFocus = 1.0 - smoothstep(mix(0.5, 0.7, compact), mix(0.94, 0.96, compact), stripDistance);

  let edgeDistance = min(stripDistance, 1.0);
  let crossScale = mix(1.0 - edgeDistance * edgeDistance * 0.08 * taperAmount, 1.0, compact);
  let widthScale = mix(1.0, crossScale, vertical);
  let heightScale = mix(crossScale, 1.0, vertical);
  let coord = vec2f((surfaceCoord.x - 0.5) / widthScale + 0.5, (surfaceCoord.y - 0.5) / heightScale + 0.5);

  let wipeCoord = vec2f(
    (worldX - stripLeft) / max(stripRight - stripLeft, 0.001),
    (stripZ - worldZ) / max(stripHeight, 0.001) + 0.5);
  let along = (1.0 - wipeCoord.x + wipeCoord.y) * 0.5;
  let wipeT = mix(material.uFade, 1.0, viewerProgress) * (1.0 + material.uWipeSoft + material.uWipeOvershoot);
  let wipeMask = smoothstep(along, along + material.uWipeSoft, wipeT);
  let wipeD = abs(along - (wipeT - material.uWipeSoft * 0.45));
  let glow = (smoothstep(material.uGlowWidth, 0.0, wipeD) * 0.55 + smoothstep(material.uGlowWidth * 0.38, 0.0, wipeD))
    * smoothstep(0.02, 0.12, material.uFade) * smoothstep(1.0, 0.7, material.uFade);

  var result: SlideWipe;
  let media = textureSample(slideMap, slideMap_sampler, coord);
  let wash = mix(material.uWash, min(material.uWash, 0.015), centerFocus) * effectAmount;
  let brightness = mix(mix(material.uBrightness, min(material.uBrightness, 1.04), centerFocus), 1.0, cleanAmount);
  let washed = mix(material.uWashColor, media.rgb, vec3f(1.0 - wash)) * brightness;
  result.color = (washed + material.uGlowColor * (glow * material.uGlow * effectAmount)) * castShadowTint;
  result.emissive = material.uGlowColor * (glow * material.uGlowBloom * effectAmount) * castShadowTint;

  let imageFeather = max(mix(material.uFeather, min(material.uFeather, 0.008), centerFocus), 0.00001);
  let edgeFeatherX = max(imageFeather * effectAmount, maskEpsilon);
  let edgeFeatherY = max(imageFeather * effectAmount, maskEpsilon);
  let edge = smoothstep(0.0, edgeFeatherX, coord.x) * smoothstep(0.0, edgeFeatherX, 1.0 - coord.x)
    * smoothstep(0.0, edgeFeatherY, coord.y) * smoothstep(0.0, edgeFeatherY, 1.0 - coord.y);
  let p = (coord - vec2f(0.5)) * size;
  let radius = min(material.sRadius, min(size.x, size.y) * 0.499) * effectAmount;
  let roundSdf = slideRoundedBox(p, size * 0.5, radius);
  let roundFeather = max(max(min(size.x, size.y) * 0.003, 0.0009) * effectAmount, maskEpsilon);
  let rounded = smoothstep(roundFeather, -roundFeather, roundSdf);
  let useRound = smoothstep(0.0004, 0.002, material.sRadius);

  let sourceStripFeather = material.uStripFeather;
  let stripFeather = max(sourceStripFeather * effectAmount, maskEpsilon);
  let stripX = material.sX + p.x;
  let stripEdge = smoothstep(viewerLeft, viewerLeft + stripFeather, stripX) * smoothstep(viewerRight, viewerRight - stripFeather, stripX);
  let useStrip = smoothstep(0.0, maskEpsilon, sourceStripFeather) * projectionAmount;

  result.alpha = edge * wipeMask * mix(material.uOpacity, 1.0, cleanAmount)
    * mix(1.0, rounded, useRound)
    * mix(1.0, stripEdge, useStrip);
  return result;
}
`;

const SLIDE_CLIP = `
  {
    let sourceNdc = clipPosition.xyz / clipPosition.w;
    let viewerSource = material.sViewerSource;
    let viewerRect = material.sViewerRect;
    let sourceCenter = vec2f(viewerSource.x + viewerSource.z * 0.5, viewerSource.y - viewerSource.w * 0.5);
    let targetCenter = vec2f(viewerRect.x + viewerRect.z * 0.5, viewerRect.y - viewerRect.w * 0.5);
    let viewerScale = viewerRect.zw / max(viewerSource.zw, vec2f(0.000001));
    let targetNdc = targetCenter + (sourceNdc.xy - sourceCenter) * viewerScale;
    let ndc = mix(sourceNdc.xy, targetNdc, clamp(material.sViewerMoveProgress, 0.0, 1.0));
    clipPosition = vec4f(ndc * clipPosition.w, clipPosition.z, clipPosition.w);
  }
`;

const SLIDE_COLOR = `
  let slideShadow = select(1.0, keyShadow(positionWorld, normalWorld), frame.shadowEnabled > 0.5);
  let slide = slideWipe(uv, slideShadow);
  diffuseColor = vec4f(slide.color, 1.0);
`;

const SLIDE_KEYS = [
  "size",
  "radius",
  "x",
  "z",
  "viewerProgress",
  "viewerMoveProgress",
  "viewerRect",
  "viewerSource",
  "viewerBounds",
];
const SLIDE_UNIFORM = (key) => `s${key[0].toUpperCase()}${key.slice(1)}`;

export function createSlideMaterial(wipe, map) {
  const material = new MeshBasicMaterial();
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.toneMapped = false;

  const values = {
    size: new Vector2(1, 1),
    radius: 0,
    x: 0,
    z: 0,
    viewerProgress: 0,
    viewerMoveProgress: 0,
    viewerRect: new Vector4(-1, 1, 2, 2),
    viewerSource: new Vector4(-1, 1, 2, 2),
    viewerBounds: new Vector4(-1, 1, 0, 2),
  };
  const uniforms = { ...wipe };
  const slide = {};
  for (const key of SLIDE_KEYS) {
    const value = values[key];
    const u = uniform(value);
    uniforms[SLIDE_UNIFORM(key)] = u;
    if (typeof value === "number") {
      Object.defineProperty(slide, key, {
        enumerable: true,
        get: () => u.value,
        set: (next) => {
          u.value = next;
        },
      });
    } else {
      slide[key] = value;
    }
  }
  material.wipe = wipe;
  material.slide = slide;
  material.hooks = {
    key: "note-projection-slide",
    uniforms,
    textures: { slideMap: map },
    functions: SLIDE_WGSL,
    clip: SLIDE_CLIP,
    color: SLIDE_COLOR,
    opacityNode: "slide.alpha",
    surface: "  emissive = slide.emissive;\n",
  };
  Object.defineProperty(material, "slideMap", {
    get: () => material.hooks.textures.slideMap,
    set: (next) => {
      material.hooks.textures.slideMap = next;
    },
  });
  return material;
}
