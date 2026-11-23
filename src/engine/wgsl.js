export const COMMON = `
const PI: f32 = 3.141592653589793;
const RECIPROCAL_PI: f32 = 0.3183098861837907;

fn saturate1(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

fn sRGBTransferOETF(color: vec3f) -> vec3f {
  return mix(pow(color, vec3f(0.41666)) * vec3f(1.055) - vec3f(0.055), color * vec3f(12.92), vec3f(color <= vec3f(0.0031308)));
}

fn sRGBTransferEOTF(color: vec3f) -> vec3f {
  return mix(pow(color * vec3f(0.9478672986) + vec3f(0.0521327014), vec3f(2.4)), color * vec3f(0.0773993808), vec3f(color <= vec3f(0.04045)));
}

fn acesFilmicToneMapping(color: vec3f, exposure: f32) -> vec3f {
  let v = mat3x3f(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * ((color * vec3f(exposure)) / vec3f(0.6));
  return clamp(mat3x3f(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602)
    * (((v * (v + vec3f(0.0245786))) - vec3f(0.000090537)) / ((v * ((v + vec3f(0.432951)) * vec3f(0.983729))) + vec3f(0.238081))),
    vec3f(0.0), vec3f(1.0));
}

// TSL's dFdy flips WebGPU's screen y to match GLSL.
fn dFdx3(v: vec3f) -> vec3f { return dpdx(v); }
fn dFdy3(v: vec3f) -> vec3f { return -dpdy(v); }

fn packNormalToRGB(n: vec3f) -> vec3f { return n * 0.5 + 0.5; }
fn unpackRGBToNormal(c: vec3f) -> vec3f { return c * 2.0 - 1.0; }

fn hash11(seed: f32) -> f32 {
  // three's hash(): a PCG-style integer hash on the float bits.
  var state = u32(seed) * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((word >> 22u) ^ word) / f32(0xffffffffu);
}
`;
export const BRDF = `
fn V_GGX_SmithCorrelated(alpha: f32, dotNL: f32, dotNV: f32) -> f32 {
  let a2 = alpha * alpha;
  return 0.5 / max(dotNL * sqrt(a2 + (1.0 - a2) * (dotNV * dotNV)) + dotNV * sqrt(a2 + (1.0 - a2) * (dotNL * dotNL)), 0.000001);
}

fn D_GGX(alpha: f32, dotNH: f32) -> f32 {
  let a2 = alpha * alpha;
  let d = 1.0 - (dotNH * dotNH) * (1.0 - a2);
  return (a2 / (d * d)) * RECIPROCAL_PI;
}

// Direct specular with the DFG-LUT multi-scattering term (three r185).
fn directSpecularGGX(lightDir: vec3f, viewDir: vec3f, normal: vec3f, specColor: vec3f, roughness: f32) -> vec3f {
  let halfDir = normalize(lightDir + viewDir);
  let dotVH = saturate1(dot(viewDir, halfDir));
  let fresnel = exp2((dotVH * -5.55473 - 6.98316) * dotVH);
  let alpha = roughness * roughness;
  let dotNL = saturate1(dot(normal, lightDir));
  let dotNV = saturate1(dot(normal, viewDir));
  let dotNH = saturate1(dot(normal, halfDir));
  let dfgV = textureSample(dfgLut, dfgSampler, vec2f(roughness, dotNV)).xy;
  let dfgL = textureSample(dfgLut, dfgSampler, vec2f(roughness, dotNL)).xy;
  let Favg = specColor + (vec3f(1.0) - specColor) * vec3f(0.047619);
  let EssV = 1.0 - (dfgV.x + dfgV.y);
  let EssL = 1.0 - (dfgL.x + dfgL.y);
  let single = ((specColor * vec3f(1.0 - fresnel) + vec3f(fresnel)) * vec3f(V_GGX_SmithCorrelated(alpha, dotNL, dotNV))) * vec3f(D_GGX(alpha, dotNH));
  let FssEssV = specColor * vec3f(dfgV.x) + vec3f(dfgV.y);
  let FssEssL = specColor * vec3f(dfgL.x) + vec3f(dfgL.y);
  let Fms = ((FssEssV * FssEssL) * Favg) / ((vec3f(1.0) - (vec3f(EssV * EssL) * Favg) * Favg) + vec3f(0.000001));
  return single + Fms * vec3f(EssV * EssL);
}

// Anisotropic GGX (three r185's physical model with anisotropy > 0).
fn V_GGX_SmithCorrelated_Anisotropic(alphaT: f32, alphaB: f32, dotTV: f32, dotBV: f32, dotTL: f32, dotBL: f32, dotNV: f32, dotNL: f32) -> f32 {
  return 0.5 / max(dotNL * length(vec3f(alphaT * dotTV, alphaB * dotBV, dotNV)) + dotNV * length(vec3f(alphaT * dotTL, alphaB * dotBL, dotNL)), 0.000001);
}

fn D_GGX_Anisotropic(alphaT: f32, alphaB: f32, dotNH: f32, dotTH: f32, dotBH: f32) -> f32 {
  let a2 = alphaT * alphaB;
  let v = vec3f(alphaB * dotTH, alphaT * dotBH, a2 * dotNH);
  let v2 = dot(v, v);
  let w2 = a2 / v2;
  return RECIPROCAL_PI * (a2 * (w2 * w2));
}

fn directSpecularGGXAnisotropic(lightDir: vec3f, viewDir: vec3f, normal: vec3f, specColor: vec3f, roughness: f32,
  alphaT: f32, anisotropyT: vec3f, anisotropyB: vec3f) -> vec3f {
  let halfDir = normalize(lightDir + viewDir);
  let dotVH = saturate1(dot(viewDir, halfDir));
  let fresnel = exp2((dotVH * -5.55473 - 6.98316) * dotVH);
  let alpha = roughness * roughness;
  let dotNL = saturate1(dot(normal, lightDir));
  let dotNV = saturate1(dot(normal, viewDir));
  let dotNH = saturate1(dot(normal, halfDir));
  let dfgV = textureSample(dfgLut, dfgSampler, vec2f(roughness, dotNV)).xy;
  let dfgL = textureSample(dfgLut, dfgSampler, vec2f(roughness, dotNL)).xy;
  let Favg = specColor + (vec3f(1.0) - specColor) * vec3f(0.047619);
  let EssV = 1.0 - (dfgV.x + dfgV.y);
  let EssL = 1.0 - (dfgL.x + dfgL.y);
  let visibility = V_GGX_SmithCorrelated_Anisotropic(alphaT, alpha, dot(anisotropyT, viewDir), dot(anisotropyB, viewDir),
    dot(anisotropyT, lightDir), dot(anisotropyB, lightDir), dotNV, dotNL);
  let distribution = D_GGX_Anisotropic(alphaT, alpha, dotNH, dot(anisotropyT, halfDir), dot(anisotropyB, halfDir));
  let single = ((specColor * vec3f(1.0 - fresnel) + vec3f(fresnel)) * vec3f(visibility)) * vec3f(distribution);
  let FssEssV = specColor * vec3f(dfgV.x) + vec3f(dfgV.y);
  let FssEssL = specColor * vec3f(dfgL.x) + vec3f(dfgL.y);
  let Fms = ((FssEssV * FssEssL) * Favg) / ((vec3f(1.0) - (vec3f(EssV * EssL) * Favg) * Favg) + vec3f(0.000001));
  return single + Fms * vec3f(EssV * EssL);
}

// The clearcoat lobe's direct specular: BRDF_GGX with f0 0.04, f90 1 and no
// multi-scattering (three r185's PhysicalLightingModel.direct).
fn clearcoatSpecularGGX(lightDir: vec3f, viewDir: vec3f, normal: vec3f, roughness: f32) -> vec3f {
  let halfDir = normalize(lightDir + viewDir);
  let dotVH = saturate1(dot(viewDir, halfDir));
  let fresnel = exp2((dotVH * -5.55473 - 6.98316) * dotVH);
  let alpha = roughness * roughness;
  let F = vec3f(0.04) * vec3f(1.0 - fresnel) + vec3f(fresnel);
  return (F * vec3f(V_GGX_SmithCorrelated(alpha, saturate1(dot(normal, lightDir)), saturate1(dot(normal, viewDir)))))
    * vec3f(D_GGX(alpha, saturate1(dot(normal, halfDir))));
}

fn distanceAttenuation(lightDistance: f32, cutoffDistance: f32, decay: f32) -> f32 {
  let falloff = 1.0 / max(pow(lightDistance, decay), 0.01);
  if (cutoffDistance > 0.0) {
    let ratio = lightDistance / cutoffDistance;
    let r4 = ratio * ratio * ratio * ratio;
    let w = clamp(1.0 - r4, 0.0, 1.0);
    return falloff * w * w;
  }
  return falloff;
}
`;
export const PMREM = `
const cubeUV_minMipLevel: f32 = 4.0;
const cubeUV_minTileSize: f32 = 16.0;

fn roughnessToMip(roughness: f32) -> f32 {
  var mip = 0.0;
  if (roughness >= 0.8) {
    mip = (1.0 - roughness) * (-1.0 - -2.0) / (1.0 - 0.8) + -2.0;
  } else if (roughness >= 0.4) {
    mip = (0.8 - roughness) * (2.0 - -1.0) / (0.8 - 0.4) + -1.0;
  } else if (roughness >= 0.305) {
    mip = (0.4 - roughness) * (3.0 - 2.0) / (0.4 - 0.305) + 2.0;
  } else if (roughness >= 0.21) {
    mip = (0.305 - roughness) * (4.0 - 3.0) / (0.305 - 0.21) + 3.0;
  } else {
    mip = -2.0 * log2(1.16 * roughness);
  }
  return mip;
}

fn cubeUVGetFace(direction: vec3f) -> f32 {
  let a = abs(direction);
  if (a.x > a.z) {
    if (a.x > a.y) { return select(3.0, 0.0, direction.x > 0.0); }
    return select(4.0, 1.0, direction.y > 0.0);
  }
  if (a.z > a.y) { return select(5.0, 2.0, direction.z > 0.0); }
  return select(4.0, 1.0, direction.y > 0.0);
}

fn cubeUVGetUV(direction: vec3f, face: f32) -> vec2f {
  var uv = vec2f(0.0);
  if (face == 0.0) { uv = vec2f(direction.z, direction.y) / abs(direction.x); }
  else if (face == 1.0) { uv = vec2f(-direction.x, -direction.z) / abs(direction.y); }
  else if (face == 2.0) { uv = vec2f(-direction.x, direction.y) / abs(direction.z); }
  else if (face == 3.0) { uv = vec2f(-direction.z, direction.y) / abs(direction.x); }
  else if (face == 4.0) { uv = vec2f(-direction.x, direction.z) / abs(direction.y); }
  else { uv = vec2f(direction.x, direction.y) / abs(direction.z); }
  return 0.5 * (uv + vec2f(1.0));
}

fn cubeUVBilinear(direction: vec3f, mipInt: f32) -> vec3f {
  var face = cubeUVGetFace(direction);
  let filterInt = max(cubeUV_minMipLevel - mipInt, 0.0);
  let mip = max(mipInt, cubeUV_minMipLevel);
  let faceSize = exp2(mip);
  var uv = cubeUVGetUV(direction, face) * vec2f(faceSize - 2.0) + vec2f(1.0);
  if (face > 2.0) {
    uv.y = uv.y + faceSize;
    face = face - 3.0;
  }
  uv.x = uv.x + face * faceSize;
  uv.x = uv.x + filterInt * (3.0 * cubeUV_minTileSize);
  uv.y = uv.y + 4.0 * (exp2(frame.envMaxMip) - faceSize);
  uv.x = uv.x * frame.envTexel.x;
  uv.y = uv.y * frame.envTexel.y;
  return textureSampleGrad(envMap, envSampler, uv, vec2f(0.0), vec2f(0.0)).xyz;
}

// World direction → radiance from the PMREM at a roughness.
fn textureCubeUV(worldDirection: vec3f, roughness: f32) -> vec3f {
  let direction = (frame.envRotation * vec4f(worldDirection.x, -worldDirection.y, worldDirection.z, 1.0)).xyz;
  let mip = clamp(roughnessToMip(roughness), -2.0, frame.envMaxMip);
  let mipF = fract(mip);
  let mipInt = floor(mip);
  var color = cubeUVBilinear(direction, mipInt);
  if (mipF != 0.0) {
    color = mix(color, cubeUVBilinear(direction, mipInt + 1.0), mipF);
  }
  return color;
}
`;
export const PMREM_MATERIAL = `
fn cubeUVBilinearM(direction: vec3f, mipInt: f32) -> vec3f {
  var face = cubeUVGetFace(direction);
  let filterInt = max(cubeUV_minMipLevel - mipInt, 0.0);
  let mip = max(mipInt, cubeUV_minMipLevel);
  let faceSize = exp2(mip);
  var uv = cubeUVGetUV(direction, face) * vec2f(faceSize - 2.0) + vec2f(1.0);
  if (face > 2.0) {
    uv.y = uv.y + faceSize;
    face = face - 3.0;
  }
  uv.x = uv.x + face * faceSize;
  uv.x = uv.x + filterInt * (3.0 * cubeUV_minTileSize);
  uv.y = uv.y + 4.0 * (exp2(material.envMaxMipM) - faceSize);
  uv.x = uv.x * material.envTexelM.x;
  uv.y = uv.y * material.envTexelM.y;
  return textureSampleGrad(envMapM, envMapM_sampler, uv, vec2f(0.0), vec2f(0.0)).xyz;
}

fn textureCubeUVM(worldDirection: vec3f, roughness: f32) -> vec3f {
  let direction = (material.envRotationM * vec4f(worldDirection.x, -worldDirection.y, worldDirection.z, 1.0)).xyz;
  let mip = clamp(roughnessToMip(roughness), -2.0, material.envMaxMipM);
  let mipF = fract(mip);
  let mipInt = floor(mip);
  var color = cubeUVBilinearM(direction, mipInt);
  if (mipF != 0.0) {
    color = mix(color, cubeUVBilinearM(direction, mipInt + 1.0), mipF);
  }
  return color;
}
`;
export const SHADOW = `
// PCF-soft filtering (three's PCFSoftShadowMap) over the key light's map.
fn keyShadow(positionWorld: vec3f, normalWorld: vec3f) -> f32 {
  let coord4 = frame.shadowMatrix * vec4f(positionWorld + normalWorld * vec3f(frame.shadowNormalBias), 1.0);
  let projected = coord4.xyz / vec3f(coord4.w);
  var coord = vec3f(projected.x, 1.0 - projected.y, projected.z + frame.shadowBias);
  var shadow = 1.0;
  let size = frame.shadowMapSize;
  // Gathers run for every fragment so they stay in uniform control flow.
  let f = fract(coord.xy * size + vec2f(0.5));
  let snapped = coord.xy - (f - vec2f(0.5)) * (vec2f(1.0) / size);
  let s0 = textureGatherCompare(shadowMap, shadowSampler, snapped, coord.z, vec2i(-1, 1));
  let s1 = textureGatherCompare(shadowMap, shadowSampler, snapped, coord.z, vec2i(1, 1));
  let s2 = textureGatherCompare(shadowMap, shadowSampler, snapped, coord.z, vec2i(-1, -1));
  let s3 = textureGatherCompare(shadowMap, shadowSampler, snapped, coord.z, vec2i(1, -1));
  let filtered = ((((mix(s0.x, s1.y, f.x) + s0.y) + s1.x) * f.y + ((mix(s0.w, s1.z, f.x) + s0.z) + s1.w))
    + ((mix(s2.x, s3.y, f.x) + s2.y) + s3.x) + (((mix(s2.w, s3.z, f.x) + s2.z) + s3.w) * (1.0 - f.y))) * 0.1111111111111111;
  if (coord.x >= 0.0 && coord.x <= 1.0 && coord.y >= 0.0 && coord.y <= 1.0 && coord.z <= 1.0) {
    shadow = filtered;
  }
  return mix(1.0, shadow, frame.shadowIntensity);
}
`;
export const FRAME_FIELDS = [
  [`projection`, `mat4x4f`],
  [`view`, `mat4x4f`],
  [`cameraWorld`, `mat4x4f`],
  [`projectionInverse`, `mat4x4f`],
  [`shadowMatrix`, `mat4x4f`],
  [`envRotation`, `mat4x4f`],
  [`cameraPosition`, `vec3f`],
  [`time`, `f32`],
  [`resolution`, `vec2f`],
  [`near`, `f32`],
  [`far`, `f32`],
  [`ambient`, `vec3f`],
  [`dirCount`, `f32`],
  [`dirDirection0`, `vec4f`],
  [`dirColor0`, `vec4f`],
  [`dirDirection1`, `vec4f`],
  [`dirColor1`, `vec4f`],
  [`dirDirection2`, `vec4f`],
  [`dirColor2`, `vec4f`],
  [`pointPosition0`, `vec4f`],
  [`pointColor0`, `vec4f`],
  [`pointCount`, `f32`],
  [`envIntensity`, `f32`],
  [`envMaxMip`, `f32`],
  [`envEnabled`, `f32`],
  [`envTexel`, `vec2f`],
  [`shadowMapSize`, `vec2f`],
  [`shadowBias`, `f32`],
  [`shadowNormalBias`, `f32`],
  [`shadowIntensity`, `f32`],
  [`shadowEnabled`, `f32`],
  [`aoEnabled`, `f32`],
  [`exposure`, `f32`],
];
export const FRAME_BINDINGS = `
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(0) @binding(3) var envMap: texture_2d<f32>;
@group(0) @binding(4) var envSampler: sampler;
@group(0) @binding(5) var dfgLut: texture_2d<f32>;
@group(0) @binding(6) var dfgSampler: sampler;
@group(0) @binding(7) var aoMap: texture_2d<f32>;
@group(0) @binding(8) var aoSampler: sampler;
`;
const CLEARCOAT_SURFACE = `
  let clearcoat = material.clearcoat;
  let clearcoatRoughness = min(max(material.clearcoatRoughness, 0.0525) + max(max(geometryRoughnessDelta.x, geometryRoughnessDelta.y), geometryRoughnessDelta.z), 1.0);
  let clearcoatNormalView = normalView;
  var clearcoatSpecularDirect = vec3f(0.0);
  var clearcoatRadiance = vec3f(0.0);
`;
function clearcoatDirect(lightColor) {
  return `    clearcoatSpecularDirect = clearcoatSpecularDirect + (vec3f(saturate1(dot(clearcoatNormalView, lightDir))) * (${lightColor}))
      * clearcoatSpecularGGX(lightDir, positionViewDirection, clearcoatNormalView, clearcoatRoughness);`;
}
const CLEARCOAT_FINISH = `
  {
    let ccDotNV = saturate1(dot(clearcoatNormalView, positionViewDirection));
    let ccFab = textureSample(dfgLut, dfgSampler, vec2f(clearcoatRoughness, ccDotNV)).xy;
    let clearcoatSpecularIndirect = (clearcoatRadiance * (vec3f(0.04) * vec3f(ccFab.x) + vec3f(ccFab.y))) * vec3f(ambientOcclusion);
    let ccFresnel = exp2((ccDotNV * -5.55473 - 6.98316) * ccDotNV);
    let ccF = vec3f(0.04) * vec3f(1.0 - ccFresnel) + vec3f(ccFresnel);
    outgoingLight = outgoingLight * (vec3f(1.0) - vec3f(clearcoat) * ccF) + (clearcoatSpecularDirect + clearcoatSpecularIndirect) * vec3f(clearcoat);
  }
`;
const ANISOTROPY_FRAME = `
  var anisotropyDirection = material.anisotropyVector;
  var anisotropyAmount = length(anisotropyDirection);
  if (anisotropyAmount == 0.0) {
    anisotropyDirection = vec2f(1.0, 0.0);
  } else {
    anisotropyDirection = anisotropyDirection / vec2f(anisotropyAmount);
    anisotropyAmount = saturate1(anisotropyAmount);
  }
  let alphaT = mix(roughness * roughness, 1.0, anisotropyAmount * anisotropyAmount);
  var anisotropyT: vec3f;
  var anisotropyB: vec3f;
  {
    let frameNormal = normalViewGeometry * vec3f(faceDirection);
    let q0 = dFdx3(positionView);
    let q1 = dFdy3(positionView);
    let st0 = dpdx(uv);
    let st1 = -dpdy(uv);
    let q0perp = cross(frameNormal, q0);
    let Tg = cross(q1, frameNormal) * st0.x + q0perp * st1.x;
    let Bg = cross(q1, frameNormal) * st0.y + q0perp * st1.y;
    let det = max(dot(Tg, Tg), dot(Bg, Bg));
    let scale = select(inverseSqrt(det), 0.0, det == 0.0);
    let T = (cross(q1, normalView) * st0.x + q0perp * st1.x) * scale;
    let B = Bg * scale;
    anisotropyT = T * vec3f(anisotropyDirection.x) + B * vec3f(anisotropyDirection.y);
    anisotropyB = B * vec3f(anisotropyDirection.x) - T * vec3f(anisotropyDirection.y);
  }
  let bentFactor = 1.0 - anisotropyAmount * (1.0 - roughness);
  let bentNormalView = normalize(mix(normalize(cross(cross(anisotropyB, positionViewDirection), anisotropyB)), normalView,
    (bentFactor * bentFactor) * (bentFactor * bentFactor)));
`;
const ATTRIBUTE_TYPES = {
  float32: `f32`,
  float32x2: `vec2f`,
  float32x3: `vec3f`,
  float32x4: `vec4f`,
  uint16x4: `vec4u`,
  uint32x4: `vec4u`,
  uint8x4: `vec4u`,
  unorm8x4: `vec4f`,
  uint32: `u32`,
};
export function buildMeshShader(cfg) {
  const { material, pass, attributes } = cfg;
  const hooks = material.hooks ?? {};
  const has = (name) => attributes.some((a) => a.name === name);
  const varyings = [];
  const addVarying = (name, type, interpolate = ``) =>
    varyings.push({
      name,
      type,
      interpolate,
    });
  addVarying(`positionView`, `vec3f`);
  addVarying(`positionWorld`, `vec3f`);
  addVarying(`normalViewGeometry`, `vec3f`);
  addVarying(`normalWorldGeometry`, `vec3f`);
  if (has(`uv`)) {
    addVarying(`uv`, `vec2f`);
  }
  if (cfg.hasTangents) {
    addVarying(`tangentView`, `vec3f`);
    addVarying(`bitangentView`, `vec3f`);
  }
  if (hooks.needsPositionLocal) {
    addVarying(`positionLocal`, `vec3f`);
  }
  for (const [name, type] of Object.entries(hooks.varyings ?? {})) {
    const flat =
      type.startsWith(`u`) || type.startsWith(`i`) || type.endsWith(`u`) || type.endsWith(`i`);
    addVarying(`h_${name}`, type, flat ? `@interpolate(flat)` : ``);
  }
  const texturesWGSL = cfg.textures.map(({ name, kind }, i) => {
    const type = kind === `uint` ? `texture_2d<u32>` : `texture_2d<f32>`;
    return `@group(1) @binding(${1 + i * 2}) var ${name}: ${type};\n@group(1) @binding(${2 + i * 2}) var ${name}_sampler: sampler;`;
  }).join(`
`);
  const attrStruct = attributes.map(
    (a) => `  @location(${a.location}) ${a.name}: ${ATTRIBUTE_TYPES[a.format]},`,
  ).join(`
`);
  const varyingStruct = varyings.map(
    (v, i) => `  @location(${i}) ${v.interpolate} ${v.name}: ${v.type},`,
  ).join(`
`);
  const hookVaryings = Object.keys(hooks.varyings ?? {});
  const vStruct = hookVaryings.length
    ? `struct HookVaryings {\n${hookVaryings.map((n) => `  ${n}: ${hooks.varyings[n]},`).join(`
`)}\n};`
    : `struct HookVaryings { _unused: f32 };`;
  const attrNames = attributes.map((a) => a.name);
  const aStruct = `struct HookAttributes {\n${attributes.map(
    (a) => `  ${a.name}: ${ATTRIBUTE_TYPES[a.format]},`,
  ).join(`
`)}\n};`;
  const skinning = cfg.skinned
    ? `
  {
    let skinMatrix = in.skinWeight.x * bones[in.skinIndex.x] + in.skinWeight.y * bones[in.skinIndex.y]
      + in.skinWeight.z * bones[in.skinIndex.z] + in.skinWeight.w * bones[in.skinIndex.w];
    let bound = object.bindMatrixInverse * skinMatrix * object.bindMatrix;
    positionLocal = (bound * vec4f(positionLocal, 1.0)).xyz;
    normalLocal = (bound * vec4f(normalLocal, 0.0)).xyz;
    ${cfg.hasTangents ? `tangentLocal = (bound * vec4f(tangentLocal, 0.0)).xyz;` : ``}
  }`
    : ``;
  const vertex = `
struct VertexIn {
${attrStruct}
};

struct Varyings {
  @builtin(position) clip: vec4f,
${varyingStruct}
};

${vStruct}
${aStruct}

@vertex
fn vs(in: VertexIn, @builtin(instance_index) instanceIndex: u32, @builtin(vertex_index) vertexIndex: u32) -> Varyings {
  var out: Varyings;
  var v: HookVaryings;
  var attr: HookAttributes;
${attrNames.map((n) => `  attr.${n} = in.${n};`).join(`
`)}
  var positionLocal = in.position;
  var normalLocal = ${has(`normal`) ? `in.normal` : `vec3f(0.0, 0.0, 1.0)`};
  ${cfg.hasTangents ? `var tangentLocal = in.tangent.xyz;` : ``}
  let uv = ${has(`uv`) ? `in.uv` : `vec2f(0.0)`};
  ${skinning}
  ${hooks.vertex ?? ``}
  let modelView = frame.view * object.model;
  let positionWorld = (object.model * vec4f(positionLocal, 1.0)).xyz;
  let positionView = (modelView * vec4f(positionLocal, 1.0)).xyz;
  out.positionWorld = positionWorld;
  out.positionView = positionView;
  let normalViewGeometry = normalize((frame.view * vec4f(object.normalMatrix * normalLocal, 0.0)).xyz);
  out.normalViewGeometry = normalViewGeometry;
  out.normalWorldGeometry = normalize((vec4f(normalViewGeometry, 0.0) * frame.view).xyz);
  ${has(`uv`) ? `out.uv = uv;` : ``}
  ${
    cfg.hasTangents
      ? `
  out.tangentView = (modelView * vec4f(tangentLocal, 0.0)).xyz;
  out.bitangentView = cross(normalViewGeometry, normalize(out.tangentView)) * vec3f(in.tangent.w);`
      : ``
  }
  ${hooks.needsPositionLocal ? `out.positionLocal = positionLocal;` : ``}
  var clipPosition = frame.projection * vec4f(positionView, 1.0);
  ${hooks.clip ?? ``}
  out.clip = clipPosition;
${hookVaryings.map((n) => `  out.h_${n} = v.${n};`).join(`
`)}
  return out;
}
`;
  const model = cfg.model;
  const lit = model !== `basic`;
  const m = material;
  const clearcoat = model === `physical` && m.clearcoat > 0;
  const uvExpr = (name) =>
    cfg.uvTransforms.includes(name) ? `(material.${name}Transform * vec3f(uv, 1.0)).xy` : `uv`;
  let normalCode = `
  let normalViewGeometry = ${has(`normal`) ? `normalize(in.normalViewGeometry)` : `normalize(cross(dpdx(in.positionView), -dpdy(in.positionView)))`};
  let normalWorldGeometry = normalize(in.normalWorldGeometry);
  var normalView = normalViewGeometry${has(`normal`) ? ` * vec3f(faceDirection)` : ``};
`;
  if (lit && m.normalMap) {
    normalCode += cfg.hasTangents
      ? `
  let tangentView = normalize(in.tangentView) * vec3f(faceDirection);
  let bitangentView = normalize(in.bitangentView) * vec3f(faceDirection);`
      : `
  let q0 = dFdx3(in.positionView);
  let q1 = dFdy3(in.positionView);
  let st0 = dpdx(uv);
  let st1 = -dpdy(uv);
  let q1perp = cross(q1, normalView);
  let q0perp = cross(normalView, q0);
  let Tf = q1perp * st0.x + q0perp * st1.x;
  let Bf = q1perp * st0.y + q0perp * st1.y;
  let detF = max(dot(Tf, Tf), dot(Bf, Bf));
  let scaleF = select(inverseSqrt(detF), 0.0, detF == 0.0);
  let tangentView = Tf * scaleF * faceDirection;
  let bitangentView = Bf * scaleF * faceDirection;`;
    normalCode += `
  let TBN = mat3x3f(tangentView, bitangentView, normalView);
  let mapN = textureSample(normalMap, normalMap_sampler, ${uvExpr(`normalMap`)}) * 2.0 - vec4f(1.0);
  normalView = normalize(TBN * vec3f(mapN.xy * material.normalScale, mapN.z));
`;
  } else if (lit && m.bumpMap) {
    normalCode += `
  {
    let bumpUv = ${uvExpr(`bumpMap`)};
    let Hll = textureSample(bumpMap, bumpMap_sampler, bumpUv).x;
    let dHdxy = vec2f(
      textureSample(bumpMap, bumpMap_sampler, bumpUv + dpdx(bumpUv)).x - Hll,
      textureSample(bumpMap, bumpMap_sampler, bumpUv - dpdy(bumpUv)).x - Hll,
    ) * material.bumpScale;
    let sigmaX = normalize(dFdx3(positionView));
    let sigmaY = normalize(dFdy3(positionView));
    let R1 = cross(sigmaY, normalView);
    let R2 = cross(normalView, sigmaX);
    let det = dot(sigmaX, R1) * faceDirection;
    let grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
    normalView = normalize(abs(det) * normalView - grad);
  }
`;
  }
  normalCode += `${hooks.normal ?? ``}
  let normalWorld = normalize((vec4f(normalView, 0.0) * frame.view).xyz);
`;
  let colorCode = `
  var diffuseColor = vec4f(material.color, 1.0);
`;
  if (m.map) {
    colorCode += `  diffuseColor = diffuseColor * textureSample(map, map_sampler, ${uvExpr(`map`)});\n`;
  }
  colorCode += `${hooks.color ?? ``}
  diffuseColor.a = diffuseColor.a * ${hooks.opacityNode ? `(${hooks.opacityNode})` : `material.opacity`};
`;
  if (m.alphaMap) {
    colorCode += `  diffuseColor.a = diffuseColor.a * textureSample(alphaMap, alphaMap_sampler, ${uvExpr(`alphaMap`)}).y;\n`;
  }
  colorCode += hooks.opacity ?? ``;
  if (m.alphaTest > 0) {
    colorCode += `  if (diffuseColor.a <= material.alphaTest) { discard; }
`;
  }
  if (cfg.opaque) {
    colorCode += `  diffuseColor.a = 1.0;
`;
  }
  const aoSample = cfg.ao
    ? `  ambientOcclusion = ambientOcclusion * textureSample(aoMap, aoSampler, fragCoord.xy / frame.resolution).x;
`
    : ``;
  let surfaceCode = ``;
  let lightingCode = ``;
  if (lit) {
    surfaceCode = `
  var metalness = material.metalness;
  var roughness = material.roughness;
  var ambientOcclusion = 1.0;
  var emissive = material.emissive;
${m.metalnessMap ? `  metalness = metalness * textureSample(metalnessMap, metalnessMap_sampler, ${uvExpr(`metalnessMap`)}).z;\n` : ``}${m.roughnessMap ? `  roughness = roughness * textureSample(roughnessMap, roughnessMap_sampler, ${uvExpr(`roughnessMap`)}).y;\n` : ``}${m.aoMap ? `  ambientOcclusion = (textureSample(aoMap_m, aoMap_m_sampler, ${uvExpr(`aoMap_m`)}).x - 1.0) * material.aoMapIntensity + 1.0;\n` : ``}${m.emissiveMap ? `  emissive = emissive * textureSample(emissiveMap, emissiveMap_sampler, ${uvExpr(`emissiveMap`)}).xyz;\n` : ``}${hooks.surface ?? ``}
${aoSample}
  let geometryRoughnessDelta = max(abs(dpdx(normalViewGeometry)), abs(-dpdy(normalViewGeometry)));
  roughness = min(max(roughness, 0.0525) + max(max(geometryRoughnessDelta.x, geometryRoughnessDelta.y), geometryRoughnessDelta.z), 1.0);
${
  model === `physical`
    ? `  let specularColorBase = min(vec3f(pow((material.ior - 1.0) / (material.ior + 1.0), 2.0)) * material.specularColor, vec3f(1.0)) * material.specularIntensity;\n`
    : `  let specularColorBase = vec3f(0.04);
`
}
  let specularColorBlended = mix(specularColorBase, diffuseColor.rgb, metalness);
  let diffuseContribution = diffuseColor.rgb * vec3f(1.0 - metalness);
${cfg.anisotropy ? ANISOTROPY_FRAME : ``}${clearcoat ? CLEARCOAT_SURFACE : ``}`;
    const specularCall = cfg.anisotropy
      ? `directSpecularGGXAnisotropic(lightDir, positionViewDirection, normalView, specularColorBlended, roughness, alphaT, anisotropyT, anisotropyB)`
      : `directSpecularGGX(lightDir, positionViewDirection, normalView, specularColorBlended, roughness)`;
    let dirLights = ``;
    for (let i = 0; i < cfg.lights.directional; i++) {
      const shadowed = i === 0 && cfg.lights.shadow;
      dirLights += `
  {
    let lightDir = normalize((frame.view * vec4f(frame.dirDirection${i}.xyz, 0.0)).xyz);
    let dotNL = dot(normalView, lightDir);
    ${shadowed ? `let shadowFactor = select(1.0, keyShadow(positionWorld, normalWorld), frame.shadowEnabled > 0.5);` : `let shadowFactor = 1.0;`}
    let irradianceL = vec3f(saturate1(dotNL)) * (frame.dirColor${i}.xyz * vec3f(shadowFactor));
${clearcoat ? clearcoatDirect(`frame.dirColor${i}.xyz * vec3f(shadowFactor)`) : ``}
    directDiffuse = directDiffuse + irradianceL * (diffuseContribution * vec3f(RECIPROCAL_PI));
    directSpecular = directSpecular + irradianceL * ${specularCall};
  }`;
    }
    let pointLights = ``;
    for (let i = 0; i < cfg.lights.point; i++) {
      pointLights += `
  {
    let lightPosView = (frame.view * vec4f(frame.pointPosition${i}.xyz, 1.0)).xyz;
    let lVector = lightPosView - positionView;
    let lightDir = normalize(lVector);
    let attenuation = distanceAttenuation(length(lVector), frame.pointPosition${i}.w, frame.pointColor${i}.w);
    let irradianceL = vec3f(saturate1(dot(normalView, lightDir))) * (frame.pointColor${i}.xyz * vec3f(attenuation));
${clearcoat ? clearcoatDirect(`frame.pointColor${i}.xyz * vec3f(attenuation)`) : ``}
    directDiffuse = directDiffuse + irradianceL * (diffuseContribution * vec3f(RECIPROCAL_PI));
    directSpecular = directSpecular + irradianceL * ${specularCall};
  }`;
    }
    const envSample = cfg.lights.materialEnv ? `textureCubeUVM` : `textureCubeUV`;
    const envCode = cfg.lights.env
      ? `
  {
    // three r185's materialEnvIntensity: material.envMap ? envMapIntensity : scene.environmentIntensity.
    let envScale = ${cfg.lights.materialEnv ? `material.envMapIntensity` : `frame.envIntensity`};
    let radianceNormal = ${cfg.anisotropy ? `bentNormalView` : `normalView`};
    let reflectView = normalize(mix(reflect(-positionViewDirection, radianceNormal), radianceNormal, roughness * roughness * roughness * roughness));
    let reflectWorld = normalize((frame.cameraWorld * vec4f(reflectView, 0.0)).xyz);
    radiance = radiance + ${envSample}(reflectWorld, roughness) * vec3f(envScale);
    iblIrradiance = iblIrradiance + (${envSample}(normalWorld, 1.0) * vec3f(PI)) * vec3f(envScale);
${
  clearcoat
    ? `    let clearcoatReflectView = normalize(mix(reflect(-positionViewDirection, clearcoatNormalView), clearcoatNormalView, clearcoatRoughness * clearcoatRoughness * clearcoatRoughness * clearcoatRoughness));
    clearcoatRadiance = clearcoatRadiance + ${envSample}(normalize((frame.cameraWorld * vec4f(clearcoatReflectView, 0.0)).xyz), clearcoatRoughness) * vec3f(envScale);`
    : ``
}
  }`
      : ``;
    lightingCode = `
  var irradiance = frame.ambient;
  var directDiffuse = vec3f(0.0);
  var directSpecular = vec3f(0.0);
${dirLights}
${pointLights}
  var radiance = vec3f(0.0);
  var iblIrradiance = vec3f(0.0);
${envCode}
  var indirectDiffuse = irradiance * (diffuseContribution * vec3f(RECIPROCAL_PI));
  let dotNV = dot(normalView, positionViewDirection);
  let fab = textureSample(dfgLut, dfgSampler, vec2f(roughness, saturate1(dotNV))).xy;
  let FssEssD = specularColorBase * vec3f(fab.x) + vec3f(fab.y);
  let FavgD = specularColorBase + (vec3f(1.0) - specularColorBase) * vec3f(0.047619);
  let EmsD = 1.0 - (fab.x + fab.y);
  let multiD = ((FssEssD * FavgD) / (vec3f(1.0) - vec3f(EmsD) * FavgD)) * vec3f(EmsD);
  let FssEssM = diffuseColor.rgb * vec3f(fab.x) + vec3f(fab.y);
  let FavgM = diffuseColor.rgb + (vec3f(1.0) - diffuseColor.rgb) * vec3f(0.047619);
  let multiM = ((FssEssM * FavgM) / (vec3f(1.0) - vec3f(EmsD) * FavgM)) * vec3f(EmsD);
  let singleScatter = mix(FssEssD, FssEssM, metalness);
  let multiScatter = mix(multiD, multiM, metalness);
  let cosineWeightedIrradiance = iblIrradiance * vec3f(RECIPROCAL_PI);
  var indirectSpecular = radiance * singleScatter + multiScatter * cosineWeightedIrradiance;
  indirectDiffuse = indirectDiffuse + (diffuseContribution * (vec3f(1.0) - (FssEssD + multiD))) * cosineWeightedIrradiance;
  indirectDiffuse = indirectDiffuse * vec3f(ambientOcclusion);
  let specularOcclusion = clamp(ambientOcclusion - (1.0 - pow(saturate1(dotNV) + ambientOcclusion, exp2(-(1.0 - roughness * -16.0)))), 0.0, 1.0);
  indirectSpecular = indirectSpecular * vec3f(specularOcclusion);
  ${clearcoat ? `var` : `let`} outgoingLight = (directDiffuse + indirectDiffuse) + (directSpecular + indirectSpecular);
${clearcoat ? CLEARCOAT_FINISH : ``}
  var outputColor = max(vec4f(outgoingLight + emissive, diffuseColor.a), vec4f(0.0));
`;
  } else {
    surfaceCode = `
  var ambientOcclusion = 1.0;
  var emissive = vec3f(0.0);
${hooks.surface ?? ``}
${aoSample}
`;
    lightingCode = `
  let outgoingLight = (vec3f(1.0) * vec3f(ambientOcclusion)) * diffuseColor.rgb;
  // three's basic material adds an emissive node too (NodeMaterial.setupLighting).
  var outputColor = max(vec4f(outgoingLight + emissive, diffuseColor.a), vec4f(0.0));
`;
  }
  const fragmentInputs = `
  let fragCoord = in.clip;
  let positionWorld = in.positionWorld;
  let positionView = in.positionView;
  let positionViewDirection = normalize(-in.positionView);
  let faceDirection = select(-1.0, 1.0, isFront);
  let screenUV = fragCoord.xy / frame.resolution;
  let uv = ${has(`uv`) ? `in.uv` : `vec2f(0.0)`};
  ${hooks.needsPositionLocal ? `let positionLocal = in.positionLocal;` : ``}
  var v: HookVaryings;
${hookVaryings.map((n) => `  v.${n} = in.h_${n};`).join(`
`)}
`;
  let fragment;
  if (pass.kind === `depth`) {
    const needsAlpha = m.alphaTest > 0;
    fragment = `
@fragment
fn fs(in: Varyings, @builtin(front_facing) isFront: bool) {
${
  needsAlpha
    ? `${fragmentInputs}
  let normalViewGeometry = normalize(in.normalViewGeometry);
  var normalView = normalViewGeometry * vec3f(faceDirection);
  let normalWorld = normalize((vec4f(normalView, 0.0) * frame.view).xyz);
${colorCode}`
    : ``
}
}
`;
  } else {
    const outputStruct = `struct FragOut {\n${pass.outputs.map(
      (o, i) => `  @location(${i}) ${o.name}: ${o.type},`,
    ).join(`
`)}\n};`;
    fragment = `
${outputStruct}

@fragment
fn fs(in: Varyings, @builtin(front_facing) isFront: bool) -> FragOut {
${fragmentInputs}
${normalCode}
${colorCode}
${surfaceCode}
${lightingCode}
${hooks.output ?? ``}
  var out: FragOut;
${pass.write}
  return out;
}
`;
  }
  const objectStruct = `
struct ObjectUniforms {
  model: mat4x4f,
  normalMatrix: mat3x3f,
  bindMatrix: mat4x4f,
  bindMatrixInverse: mat4x4f,
  custom0: vec4f,
  custom1: vec4f,
};
@group(2) @binding(0) var<uniform> object: ObjectUniforms;
${cfg.skinned ? `@group(2) @binding(1) var<storage, read> bones: array<mat4x4f>;` : ``}
`;
  const code = [
    `diagnostic(off, derivative_uniformity);`,
    COMMON,
    `struct Frame {\n${cfg.frameLayout.fields.map((f) => `  ${f.name}: ${f.type},`).join(`
`)}\n};`,
    `@group(0) @binding(0) var<uniform> frame: Frame;`,
    FRAME_BINDINGS,
    cfg.materialLayout.wgsl(),
    `@group(1) @binding(0) var<uniform> material: MaterialUniforms;`,
    texturesWGSL,
    objectStruct,
    cfg.sceneHook?.wgsl ?? ``,
    BRDF,
    PMREM,
    cfg.lights.materialEnv ? PMREM_MATERIAL : ``,
    SHADOW,
    hooks.functions ?? ``,
    vertex,
    fragment,
  ].join(`
`);
  return code;
}
export const FULLSCREEN_VERTEX = `
struct FullscreenOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> FullscreenOut {
  var out: FullscreenOut;
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  out.clip = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2f(x, y);
  return out;
}
`;
