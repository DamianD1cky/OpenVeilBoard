import {
  Color,
  DataTexture,
  MeshStandardMaterial,
  uniform,
  Vector2,
  DoubleSide,
  FrontSide,
} from "../engine/index.js";
import { loadTexture } from "../engine/texture.js";
import {
  PLASTER_DIFFUSE,
  PLASTER_DISPLACEMENT,
  PLASTER_NORMAL,
  PLASTER_ROUGHNESS,
  PLASTER_WEAR,
} from "../shared/sceneAssets.js";
export const WEAR_EXTENT = [7.2, 3.6];
const CHIP_THRESHOLD = 0.8;
const BITE_SCALE = 9;
const BITE_TURN = [Math.cos(0.7), Math.sin(0.7)];
const CHIP_SPREAD = 0.093;
const GRAIN_SCALE = 0.45;
const GRAIN_MEAN = 0.766;
const GRAIN_SPREAD = 0.018;
const f = (x) => (Number.isInteger(x) ? `${x}.0` : `${x}`);
export const WEAR_WGSL = `
fn wearUv(x: f32, z: f32) -> vec2f {
  return vec2f(x / ${f(WEAR_EXTENT[0])} + 0.5, 0.5 - z / ${f(WEAR_EXTENT[1])});
}
fn turnedWearUv(p: vec3f) -> vec2f {
  return wearUv((p.x * ${BITE_TURN[0]} - p.z * ${BITE_TURN[1]}) * ${f(BITE_SCALE)},
    (p.x * ${BITE_TURN[1]} + p.z * ${BITE_TURN[0]}) * ${f(BITE_SCALE)});
}
fn lipDistance(xz: vec2f, half: vec2f, radius: f32) -> f32 {
  let q = abs(xz) - half + vec2f(radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
}
`;
const PLASTER_WGSL = `
fn plasterTriplanar(t: texture_2d<f32>, s: sampler, positionWorld: vec3f, normalWorld: vec3f, scale: f32, walls: bool) -> vec4f {
  let n = abs(normalWorld);
  let wall = select(0.0, 1.0 - clamp((n.y - 0.42) / 0.56, 0.0, 1.0), walls);
  let yBoost = 3.4 - wall * 2.6;
  let xz = 0.22 + wall * 0.7;
  let biased = n * vec3f(xz, yBoost, xz);
  let blend = biased / vec3f(dot(biased, vec3f(1.0)));
  let p = positionWorld * vec3f(scale);
  return textureSample(t, s, p.zy) * vec4f(blend.x) + textureSample(t, s, p.xz) * vec4f(blend.y) + textureSample(t, s, p.xy) * vec4f(blend.z);
}

fn indentEdge(positionWorld: vec3f, half: vec2f, radius: f32) -> f32 {
  let q = abs(positionWorld.xz) - half + vec2f(radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - radius;
}

fn indentCavity(positionWorld: vec3f, half: vec2f, radius: f32, fade: f32, blur: f32) -> f32 {
  let d = indentEdge(positionWorld, half, radius);
  let inside = max(0.0, -d);
  let t = clamp(inside / max(fade, 0.001), 0.0, 1.0);
  let softness = max(blur, 0.4);
  let rim = 1.0 - pow(t, 1.0 / (softness * 0.45 + 0.35));
  let hideCrease = clamp(inside / 0.003, 0.0, 1.0);
  return clamp(rim * hideCrease * select(0.0, 1.0, d <= 0.0), 0.0, 1.0);
}

fn indentRim(positionWorld: vec3f, half: vec2f, radius: f32, fade: f32, blur: f32) -> f32 {
  let d = indentEdge(positionWorld, half, radius);
  let inside = max(0.0, -d);
  let t = clamp((inside - 0.0015) / max(fade, 0.03), 0.0, 1.0);
  let wall = clamp(t / 0.16, 0.0, 1.0);
  let lip = pow(1.0 - t, 1.35);
  let foot = pow(t, 1.8);
  let mid = t * (1.0 - t) * 4.0;
  let turn = clamp(0.5 + positionWorld.x * 0.09 + positionWorld.z * 0.05, 0.0, 1.0);
  let softness = max(blur, 0.4);
  return clamp(pow(wall * (lip * 0.58 + foot * 0.4 + turn * 0.22 + 0.16 - mid * 0.1), 1.0 / (softness * 0.22 + 0.62)), 0.0, 1.0);
}
`;
const wearWGSL = (floor) => `
struct WearSample { w: vec4f, bite: f32, chip: f32, deep: f32, wallEdge: f32, flat: f32, inward: f32 };

fn sampleWear(positionWorld: vec3f, normalWorldGeometry: vec3f) -> WearSample {
  var s: WearSample;
  s.w = textureSample(wearMap, wearMap_sampler, wearUv(positionWorld.x, positionWorld.z));
  s.bite = (textureSample(wearMap, wearMap_sampler, turnedWearUv(positionWorld)).z - 0.5) / ${CHIP_SPREAD};
  let lip = lipDistance(positionWorld.xz, material.wHalf, material.wRadius);
  s.inward = ${floor ? `-lip - material.wWallInset` : `lip + material.wLipInset`};
  let near = pow(1.0 - clamp(s.inward / material.wReach, 0.0, 1.0), 1.5);
  let field = s.w.z + s.bite * material.wBite * (near * 0.6 + 0.4) + near * material.wChips * ${floor ? `0.35` : `1.0`};
  let aa = max(fwidth(field), 0.006);
  s.chip = smoothstep(${f(CHIP_THRESHOLD)} - aa, ${f(CHIP_THRESHOLD)} + aa, field);
  s.deep = smoothstep(${f(CHIP_THRESHOLD)}, ${CHIP_THRESHOLD + 0.14}, field);
  s.wallEdge = s.chip * (1.0 - smoothstep(${f(CHIP_THRESHOLD)}, aa * 2.5 + ${f(CHIP_THRESHOLD)}, field));
  s.flat = smoothstep(0.3, 0.75, abs(normalWorldGeometry.y));
  return s;
}

fn wearNormal(s: WearSample, positionView: vec3f, faceDirection: f32, baseNormal: vec3f) -> vec3f {
  let chipped = (s.chip * 0.55 + s.deep * 0.45) * material.wChipDepth;
  let cracked = s.w.x * material.wRecessDepth;
  let dHdxy = (vec2f(dpdx(chipped), -dpdy(chipped)) * vec2f(s.flat) + vec2f(dpdx(cracked), -dpdy(cracked))) * vec2f(-material.wBump);
  let sigmaX = normalize(dpdx(positionView));
  let sigmaY = normalize(-dpdy(positionView));
  let r1 = cross(sigmaY, baseNormal);
  let r2 = cross(baseNormal, sigmaX);
  let det = dot(sigmaX, r1) * faceDirection;
  let grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * baseNormal - grad);
}

fn wearColor(s: WearSample, baseColor: vec3f) -> vec3f {
  let exposed = mix(vec3f(dot(baseColor, vec3f(0.2126, 0.7152, 0.0722))), baseColor, 0.55) * material.wChipTint
    * vec3f(material.wChipLift) * vec3f(s.bite * 0.03 + 1.0);
  var color = mix(baseColor, exposed, s.chip * s.flat)
    * vec3f(1.0 - s.wallEdge * 0.35 * s.flat)
    * vec3f(1.0 - s.w.x * material.wCracks)
    * vec3f(1.0 - s.w.y * material.wStains);
  ${
    floor
      ? `let foot = pow(1.0 - clamp(s.inward / material.wGrimeReach, 0.0, 1.0), 1.6);
  color = color * vec3f(1.0 - foot * smoothstep(0.3, 0.72, s.w.z) * material.wGrime);`
      : ``
  }
  return color;
}
`;
let shared = null;
export function loadPlasterTextures(anisotropy = 11) {
  shared ??= Promise.all(
    [PLASTER_DIFFUSE, PLASTER_DISPLACEMENT, PLASTER_NORMAL, PLASTER_ROUGHNESS, PLASTER_WEAR].map(
      (url) => loadTexture(url),
    ),
  ).then(([map, displacementMap, normalMap, roughnessMap, wearMap]) => {
    for (const texture of [map, displacementMap, normalMap, roughnessMap, wearMap]) {
      texture.wrapS = `repeat`;
      texture.wrapT = `repeat`;
      texture.anisotropy = anisotropy;
      texture.colorSpace = ``;
      texture.needsUpdate = true;
    }
    map.colorSpace = `srgb`;
    paintMaps.wear.image = wearMap.image;
    paintMaps.wear.needsUpdate = true;
    paintMaps.grain.image = displacementMap.image;
    paintMaps.grain.needsUpdate = true;
    return {
      map,
      displacementMap,
      normalMap,
      roughnessMap,
      wearMap,
    };
  });
  return shared;
}
function blankTexel() {
  const texel = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texel.wrapS = `repeat`;
  texel.wrapT = `repeat`;
  texel.magFilter = `linear`;
  texel.minFilter = `linear-mipmap-linear`;
  texel.generateMipmaps = true;
  texel.anisotropy = 8;
  texel.flipY = false;
  texel.needsUpdate = true;
  return texel;
}
export const paintMaps = {
  wear: blankTexel(),
  grain: blankTexel(),
};
export const paintWearUniforms = {
  amount: uniform(0),
  dirt: uniform(0),
};
export const PAINT_WEAR_WGSL = `
${WEAR_WGSL}
fn paintWear(positionWorld: vec3f, em: f32) -> vec2f {
  let w = textureSample(paintWearMap, paintWearMap_sampler, wearUv(positionWorld.x, positionWorld.z));
  let bite = (textureSample(paintWearMap, paintWearMap_sampler, turnedWearUv(positionWorld)).z - 0.5) / ${CHIP_SPREAD};
  let grain = clamp((textureSample(paintGrainMap, paintGrainMap_sampler, positionWorld.xz * ${GRAIN_SCALE}).x - ${GRAIN_MEAN}) / ${GRAIN_SPREAD}, -4.0, 4.0);
  let amount = mix(0.45, 1.0, smoothstep(0.08, 0.35, em)) * material.paintAmount;
  let field = w.z - 0.5 + bite * 0.08 + grain * 0.04;
  let threshold = 0.44 - amount * 0.27;
  let aa = max(fwidth(field), 0.004);
  let flake = smoothstep(threshold - aa, threshold + aa, field);
  let thin = smoothstep(threshold - 0.12, threshold, field) * amount * 0.45;
  let cracked = smoothstep(0.08, 0.35, w.x) * clamp(amount * 1.5, 0.0, 1.0);
  let keep = (1.0 - flake) * (1.0 - thin) * (1.0 - cracked);
  let shade = 1.0 - w.y * material.paintDirt;
  return vec2f(keep, shade);
}
`;
export function paintWearHooks() {
  return {
    uniforms: {
      paintAmount: paintWearUniforms.amount,
      paintDirt: paintWearUniforms.dirt,
    },
    textures: {
      paintWearMap: paintMaps.wear,
      paintGrainMap: paintMaps.grain,
    },
  };
}
function wearUniforms() {
  return {
    wHalf: uniform(new Vector2(1, 1)),
    wRadius: uniform(0.1),
    wLipInset: uniform(0),
    wWallInset: uniform(0),
    wReach: uniform(0.05),
    wChips: uniform(0),
    wChipDepth: uniform(1),
    wRecessDepth: uniform(1),
    wBite: uniform(0),
    wChipTint: uniform(new Color(`#ffffff`)),
    wChipLift: uniform(1),
    wCracks: uniform(0),
    wStains: uniform(0),
    wGrime: uniform(0),
    wGrimeReach: uniform(0.1),
    wBump: uniform(0),
  };
}
function writeWear(u, wear) {
  u.wHalf.value.set(wear.lip.width * 0.5, wear.lip.height * 0.5);
  u.wRadius.value = wear.lip.radius;
  u.wLipInset.value = wear.lip.lipInset;
  u.wWallInset.value = wear.lip.wallInset;
  u.wReach.value = wear.chipReach;
  u.wChips.value = wear.chips;
  u.wChipDepth.value = wear.chipDepth;
  u.wRecessDepth.value = wear.recessDepth;
  u.wBite.value = wear.bite;
  u.wChipTint.value.set(wear.chipTint);
  u.wChipLift.value = wear.chipLift;
  u.wCracks.value = wear.cracks;
  u.wStains.value = wear.stains;
  u.wGrime.value = wear.grime;
  u.wGrimeReach.value = wear.grimeReach;
  u.wBump.value = wear.bump;
}
export function createPlasterMaterial(
  textures,
  settings,
  worldExtent = 1,
  cavity = null,
  extras = {},
) {
  const kind = cavity?.kind;
  const walls = kind === `rim`;
  const wear = extras.wear?.enabled ? extras.wear : null;
  const wearSurface = wear ? (walls ? `frame` : `floor`) : null;
  const u = {
    uRepeat: uniform(1),
    uColor: uniform(new Color(settings.color)),
    uRough: uniform(settings.roughness),
    uMetal: uniform(settings.metalness),
    uAo: uniform(0.42),
    uShadow: uniform(new Color(`#1a1814`)),
    uFade: uniform(0.12),
    uBlur: uniform(2.2),
    uHalf: uniform(new Vector2(1, 1)),
    uRadius: uniform(0.08),
    ...(wearSurface ? wearUniforms() : {}),
  };
  const material = new MeshStandardMaterial();
  material.name = `plaster:${kind ?? `plain`}${wearSurface ? `:${wearSurface}` : ``}`;
  const cavityFn = kind === `rim` ? `indentRim` : `indentCavity`;
  const cavityScale = kind === `rim` ? `1.0` : `1.15`;
  material.hooks = {
    key: material.name,
    uniforms: u,
    textures: {
      pDiffuse: textures.map,
      pRough: textures.roughnessMap,
      ...(wearSurface
        ? {
            wearMap: textures.wearMap,
          }
        : {}),
    },
    functions: `${PLASTER_WGSL}${wearSurface ? WEAR_WGSL + wearWGSL(wearSurface === `floor`) : ``}`,
    normal: ``,
    color: `
  var plasterColor = plasterTriplanar(pDiffuse, pDiffuse_sampler, positionWorld, normalWorld, material.uRepeat, ${walls}).xyz * material.uColor;
  ${
    cavity
      ? `let cavityAmount = clamp(${cavityFn}(positionWorld, material.uHalf, material.uRadius, material.uFade, material.uBlur) * material.uAo * ${cavityScale}, 0.0, 1.0);
  plasterColor = mix(plasterColor, material.uShadow, cavityAmount);`
      : `let cavityAmount = 0.0;`
  }
  diffuseColor = vec4f(plasterColor, 1.0);`,
    surface: `
  ${cavity ? `ambientOcclusion = 1.0 - cavityAmount;` : ``}
  roughness = plasterTriplanar(pRough, pRough_sampler, positionWorld, normalWorld, material.uRepeat, ${walls}).y * material.uRough;
  metalness = material.uMetal;
  emissive = vec3f(0.0);`,
  };
  if (wearSurface) {
    material.hooks.normal = `
  let wear = sampleWear(positionWorld, normalWorldGeometry);
  normalView = wearNormal(wear, positionView, faceDirection, normalView);`;
    material.hooks.color = `
  var plasterBase = plasterTriplanar(pDiffuse, pDiffuse_sampler, positionWorld, normalWorld, material.uRepeat, ${walls}).xyz * material.uColor;
  ${
    cavity
      ? `let cavityAmount = clamp(${cavityFn}(positionWorld, material.uHalf, material.uRadius, material.uFade, material.uBlur) * material.uAo * ${cavityScale}, 0.0, 1.0);
  plasterBase = mix(plasterBase, material.uShadow, cavityAmount);`
      : `let cavityAmount = 0.0;`
  }
  diffuseColor = vec4f(wearColor(wear, plasterBase), 1.0);`;
  }
  const update = (settings, worldExtent, cavity, extras = {}) => {
    u.uRepeat.value = settings.repeat / Math.max(worldExtent, 1e-4);
    u.uColor.value.set(settings.color);
    u.uRough.value = settings.roughness;
    u.uMetal.value = settings.metalness;
    u.uAo.value = cavity?.opacity ?? 0;
    u.uShadow.value.set(cavity?.color ?? `#1a1814`);
    u.uFade.value = cavity?.fade ?? 0.12;
    u.uBlur.value = cavity?.blur ?? 2.2;
    if (cavity) {
      u.uHalf.value.set(cavity.width * 0.5, cavity.height * 0.5);
      u.uRadius.value = cavity.radius;
    }
    if (wearSurface && extras.wear?.enabled) {
      writeWear(u, extras.wear);
    }
    const noBump = extras.bump === false;
    material.side = extras.front || noBump ? FrontSide : DoubleSide;
    material.normalScale.set(settings.normalScale, settings.normalScale);
    material.bumpScale = noBump ? 0 : settings.bumpScale;
    material.normalMap = noBump ? null : textures.normalMap;
    material.bumpMap = noBump ? null : textures.displacementMap;
  };
  update(settings, worldExtent, cavity, extras);
  return {
    material,
    update,
  };
}
