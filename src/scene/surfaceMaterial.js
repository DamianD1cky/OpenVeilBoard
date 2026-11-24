import {
  Color,
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  uniform,
} from "../engine/index.js";
import { createPlasterMaterial } from "./plaster.js";

const SURFACE_WGSL = `
fn surfIndentSdf(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let r = min(radius, min(halfSize.x, halfSize.y));
  let q = abs(p) - (halfSize - vec2f(r));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn surfTriplanar(t: texture_2d<f32>, s: sampler, positionWorld: vec3f, normalWorld: vec3f, scale: f32, walls: bool) -> vec4f {
  let n = abs(normalWorld);
  let p = positionWorld * vec3f(scale);
  if (!walls) {
    return textureSample(t, s, p.xz);
  }
  let powered = pow(n, vec3f(4.0));
  let blend = powered / vec3f(max(powered.x + powered.y + powered.z, 0.0001));
  return textureSample(t, s, p.zy) * vec4f(blend.x)
    + textureSample(t, s, p.xz) * vec4f(blend.y)
    + textureSample(t, s, p.xy) * vec4f(blend.z);
}
fn surfIndentCavity(positionWorld: vec3f, halfSize: vec2f, radius: f32, fade: f32, blur: f32) -> f32 {
  let d = surfIndentSdf(positionWorld.xz, halfSize, radius);
  let inside = step(d, 0.0);
  let reach = max(fade * max(blur, 0.01), 0.0001);
  return inside * pow(clamp(1.0 - max(-d, 0.0) / reach, 0.0, 1.0), 1.6);
}
fn surfIndentRim(positionWorld: vec3f, halfSize: vec2f, radius: f32, fade: f32, blur: f32) -> f32 {
  let d = surfIndentSdf(positionWorld.xz, halfSize, radius);
  let outside = step(0.0, d);
  let reach = max(fade * max(blur, 0.01), 0.0001);
  return outside * pow(clamp(1.0 - max(d, 0.0) / reach, 0.0, 1.0), 1.6);
}
`;

/**
 * Create a surface material for either the outer frame (`part === "frame"`)
 * or inner recessed tray (`part === "tray"`).
 * Delegates classic plaster wear to `createPlasterMaterial`, and unlocks
 * MeshPhysicalMaterial (clearcoat, anisotropy) + Fresnel velvet/leather sheen
 * + bevel patina for non-plaster styles.
 */
export function createSurfaceMaterial(
  slotConfig,
  textures,
  worldExtent,
  cavity,
  extras = {},
) {
  if (slotConfig.kind === "plaster" && slotConfig.wearMode === "plaster") {
    return createPlasterMaterial(
      textures,
      {
        repeat: slotConfig.repeat,
        color: slotConfig.color,
        roughness: slotConfig.roughness,
        metalness: slotConfig.metalness,
        normalScale: slotConfig.normalScale,
        bumpScale: 0.16,
      },
      worldExtent,
      { ...cavity, color: slotConfig.cavityColor, opacity: slotConfig.cavityOpacity },
      extras,
    );
  }

  const walls = cavity?.kind === "rim";
  const isPhysical = slotConfig.model === "physical";
  const usePatina = slotConfig.wearMode === "patina";
  const useSheen = (slotConfig.sheen ?? 0) > 0.001;

  const u = {
    uRepeat: uniform(slotConfig.repeat / Math.max(worldExtent, 1e-4)),
    uColor: uniform(new Color(slotConfig.color || "#ffffff")),
    uRough: uniform(slotConfig.roughness ?? 0.8),
    uMetal: uniform(slotConfig.metalness ?? 0),
    uAo: uniform(slotConfig.cavityOpacity ?? cavity?.opacity ?? 0.45),
    uShadow: uniform(new Color(slotConfig.cavityColor ?? "#141210")),
    uFade: uniform(cavity?.fade ?? 0.08),
    uBlur: uniform(cavity?.blur ?? 1.1),
    uHalf: uniform(new Vector2((cavity?.width ?? 2) * 0.5, (cavity?.height ?? 2) * 0.5)),
    uRadius: uniform(cavity?.radius ?? 0.05),
    uSheen: uniform(slotConfig.sheen ?? 0),
    uSheenColor: uniform(new Color(slotConfig.sheenColor ?? "#ffffff")),
  };

  const material = isPhysical
    ? new MeshPhysicalMaterial({
        clearcoat: slotConfig.clearcoat ?? 0,
        clearcoatRoughness: slotConfig.clearcoatRoughness ?? 0.25,
        anisotropy: slotConfig.anisotropy ?? 0,
        envMapIntensity: slotConfig.envMapIntensity ?? 1.2,
      })
    : new MeshStandardMaterial({
        envMapIntensity: slotConfig.envMapIntensity ?? 0.9,
      });

  material.name = `surface:${slotConfig.id}:${walls ? "frame" : "tray"}:${isPhysical ? "phys" : "std"}`;
  const cavityFn = walls ? "surfIndentRim" : "surfIndentCavity";
  const cavityScale = walls ? "1.0" : "1.15";

  material.hooks = {
    key: material.name,
    uniforms: u,
    textures: {
      pDiffuse: textures.map,
      pRough: textures.roughnessMap,
    },
    functions: SURFACE_WGSL,
    color: `
  var surfColor = surfTriplanar(pDiffuse, pDiffuse_sampler, positionWorld, normalWorld, material.uRepeat, ${walls}).xyz * material.uColor;
  let cavityAmount = clamp(${cavityFn}(positionWorld, material.uHalf, material.uRadius, material.uFade, material.uBlur) * material.uAo * ${cavityScale}, 0.0, 1.0);
  ${
    usePatina
      ? `let rimGlow = clamp(surfIndentRim(positionWorld, material.uHalf, material.uRadius, 0.025, 1.0), 0.0, 1.0);
  surfColor = mix(surfColor, surfColor * vec3f(1.22, 1.14, 1.04), rimGlow * 0.26);`
      : ""
  }
  surfColor = mix(surfColor, material.uShadow, cavityAmount);
  ${
    useSheen
      ? `let sheenNdotV = saturate1(dot(normalize(normalView), positionViewDirection));
  let sheenTerm = pow(1.0 - sheenNdotV, 3.2) * material.uSheen;
  surfColor = surfColor + material.uSheenColor * vec3f(sheenTerm * (1.0 - cavityAmount * 0.5));`
      : ""
  }
  diffuseColor = vec4f(surfColor, 1.0);
`,
    surface: `
  ambientOcclusion = 1.0 - cavityAmount * 0.85;
  roughness = clamp(surfTriplanar(pRough, pRough_sampler, positionWorld, normalWorld, material.uRepeat, ${walls}).y * material.uRough, 0.08, 1.0);
  metalness = material.uMetal;
  emissive = vec3f(0.0);
`,
  };

  // Align normalMap repeat with world-space uRepeat so normal detail matches diffuse tiling
  const normalScale = slotConfig.normalScale ?? 0.35;
  if (textures.normalMap) {
    const uRep = slotConfig.repeat / Math.max(worldExtent, 1e-4);
    textures.normalMap.repeat.set(uRep, uRep);
    material.normalMap = textures.normalMap;
    material.normalScale.set(normalScale, normalScale);
  }
  material.side = walls ? FrontSide : DoubleSide;

  const update = (nextSlot, nextExtent, nextCavity) => {
    const cfg = nextSlot ?? slotConfig;
    const rep = cfg.repeat / Math.max(nextExtent, 1e-4);
    u.uRepeat.value = rep;
    u.uColor.value.set(cfg.color || "#ffffff");
    u.uRough.value = cfg.roughness ?? 0.8;
    u.uMetal.value = cfg.metalness ?? 0;
    u.uAo.value = cfg.cavityOpacity ?? nextCavity?.opacity ?? 0.45;
    u.uShadow.value.set(cfg.cavityColor ?? "#141210");
    u.uFade.value = nextCavity?.fade ?? 0.08;
    u.uBlur.value = nextCavity?.blur ?? 1.1;
    if (nextCavity) {
      u.uHalf.value.set(nextCavity.width * 0.5, nextCavity.height * 0.5);
      u.uRadius.value = nextCavity.radius;
    }
    if (textures.normalMap) {
      textures.normalMap.repeat.set(rep, rep);
      material.normalScale.set(cfg.normalScale ?? 0.35, cfg.normalScale ?? 0.35);
    }
  };

  return { material, update };
}
