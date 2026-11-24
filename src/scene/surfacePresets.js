import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "../engine/index.js";
import { loadTexture } from "../engine/texture.js";
import { loadPlasterTextures } from "./plaster.js";

/**
 * Individual slot material definitions.
 * Any slot can optionally specify `maps: { diffuse, normal, roughness }`
 * pointing to files under `public/textures/surfaces/<name>/` to override
 * the built-in procedural PBR texture generator.
 */
export const SURFACE_MATERIALS = {
  plaster_frame: {
    id: "plaster_frame",
    label: "冷灰暗房石膏",
    kind: "plaster",
    model: "standard",
    color: "#bebcb8",
    roughness: 1.0,
    metalness: 0.0,
    repeat: 2.45,
    normalScale: 0.35,
    sheen: 0,
    wearMode: "plaster",
    cavityColor: "#1a1814",
    cavityOpacity: 0.64,
    isDark: false,
  },
  plaster_tray: {
    id: "plaster_tray",
    label: "暖米暗房石膏",
    kind: "plaster",
    model: "standard",
    color: "#d4cec3",
    roughness: 1.0,
    metalness: 0.0,
    repeat: 2.45,
    normalScale: 0.39,
    sheen: 0,
    wearMode: "plaster",
    cavityColor: "#1a1814",
    cavityOpacity: 0.35,
    isDark: false,
    stampInk: "#514b3e",
    stampHoverInk: "#2a241b",
    wellInk: "#655d4c",
    slotBaseColor: "#24211c",
  },
  walnut: {
    id: "walnut",
    label: "深胡桃木清漆",
    kind: "procedural",
    generator: "walnut",
    model: "physical",
    color: "#ffffff",
    roughness: 0.56,
    metalness: 0.02,
    clearcoat: 0.52,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.35,
    repeat: 1.85,
    normalScale: 0.42,
    sheen: 0,
    wearMode: "patina",
    cavityColor: "#120a06",
    cavityOpacity: 0.62,
    isDark: true,
    stampInk: "#dfcca5",
    stampHoverInk: "#f7ead0",
    wellInk: "#cfb88a",
    slotBaseColor: "#140c07",
  },
  baize_felt: {
    id: "baize_felt",
    label: "墨绿台球呢绒",
    kind: "procedural",
    generator: "felt",
    model: "standard",
    color: "#ffffff",
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.65,
    repeat: 3.4,
    normalScale: 0.48,
    sheen: 0.32,
    sheenColor: "#588b6d",
    wearMode: "none",
    cavityColor: "#0a1710",
    cavityOpacity: 0.52,
    isDark: true,
    stampInk: "#d8bc82",
    stampHoverInk: "#f5dfad",
    wellInk: "#cbb078",
    slotBaseColor: "#09140e",
  },
  aged_brass: {
    id: "aged_brass",
    label: "包浆复古黄铜",
    kind: "procedural",
    generator: "brass",
    model: "physical",
    color: "#ffffff",
    roughness: 0.42,
    metalness: 0.86,
    anisotropy: 0.72,
    envMapIntensity: 1.9,
    repeat: 1.4,
    normalScale: 0.28,
    sheen: 0,
    wearMode: "patina",
    cavityColor: "#181106",
    cavityOpacity: 0.66,
    isDark: true,
    stampInk: "#f2e0b6",
    stampHoverInk: "#fff3d6",
    wellInk: "#dfc894",
    slotBaseColor: "#181209",
  },
  aged_leather: {
    id: "aged_leather",
    label: "压纹暗褐皮革",
    kind: "procedural",
    generator: "leather",
    model: "physical",
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0.02,
    clearcoat: 0.14,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.95,
    repeat: 2.8,
    normalScale: 0.55,
    sheen: 0.18,
    sheenColor: "#7a5338",
    wearMode: "patina",
    cavityColor: "#120a07",
    cavityOpacity: 0.56,
    isDark: true,
    stampInk: "#d8bc82",
    stampHoverInk: "#f7e3b7",
    wellInk: "#c9aa70",
    slotBaseColor: "#120b07",
  },
  brushed_metal: {
    id: "brushed_metal",
    label: "拉丝阳极氧化铝",
    kind: "procedural",
    generator: "metal",
    model: "physical",
    color: "#ffffff",
    roughness: 0.44,
    metalness: 0.88,
    anisotropy: 0.82,
    envMapIntensity: 2.1,
    repeat: 1.2,
    normalScale: 0.24,
    sheen: 0,
    wearMode: "none",
    cavityColor: "#0e1114",
    cavityOpacity: 0.6,
    isDark: false,
    stampInk: "#353c45",
    stampHoverInk: "#171c22",
    wellInk: "#444d57",
    slotBaseColor: "#121518",
  },
  esd_mat: {
    id: "esd_mat",
    label: "深灰实验切割垫",
    kind: "procedural",
    generator: "esd",
    model: "standard",
    color: "#ffffff",
    roughness: 0.72,
    metalness: 0.04,
    envMapIntensity: 0.85,
    repeat: 2.2,
    normalScale: 0.22,
    sheen: 0.08,
    sheenColor: "#6d7c86",
    wearMode: "none",
    cavityColor: "#0e1215",
    cavityOpacity: 0.5,
    isDark: true,
    stampInk: "#cfd8df",
    stampHoverInk: "#ffffff",
    wellInk: "#b2bec8",
    slotBaseColor: "#101417",
  },
  nero_marble: {
    id: "nero_marble",
    label: "黑曜金纹大理石",
    kind: "procedural",
    generator: "marble",
    model: "physical",
    color: "#ffffff",
    roughness: 0.34,
    metalness: 0.06,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.65,
    repeat: 1.5,
    normalScale: 0.16,
    sheen: 0,
    wearMode: "none",
    cavityColor: "#080706",
    cavityOpacity: 0.65,
    isDark: true,
    stampInk: "#dfc386",
    stampHoverInk: "#faebb8",
    wellInk: "#cfb376",
    slotBaseColor: "#080706",
  },
  micro_cement: {
    id: "micro_cement",
    label: "炭黑侘寂微水泥",
    kind: "plaster",
    model: "standard",
    color: "#3d3a36",
    roughness: 0.94,
    metalness: 0.02,
    repeat: 2.1,
    normalScale: 0.36,
    sheen: 0,
    wearMode: "none",
    cavityColor: "#100f0d",
    cavityOpacity: 0.58,
    isDark: true,
    stampInk: "#ddd6c7",
    stampHoverInk: "#ffffff",
    wellInk: "#bfb7a8",
    slotBaseColor: "#11100e",
  },
};

export const SURFACE_THEME_PRESETS = [
  {
    id: "plaster",
    label: "暗房石膏",
    subtitle: "冷灰石膏外框 · 暖米石膏内槽",
    frameId: "plaster_frame",
    trayId: "plaster_tray",
    swatches: ["#bebcb8", "#d4cec3"],
  },
  {
    id: "victorian_club",
    label: "维多利亚调查局",
    subtitle: "深胡桃木清漆 · 墨绿台球呢绒",
    frameId: "walnut",
    trayId: "baize_felt",
    swatches: ["#4a2c1a", "#1e3c2b"],
  },
  {
    id: "detective_brass",
    label: "复古黄铜皮桌",
    subtitle: "包浆黄铜外框 · 压纹暗褐皮革",
    frameId: "aged_brass",
    trayId: "aged_leather",
    swatches: ["#9f7e43", "#3e271b"],
  },
  {
    id: "forensic_lab",
    label: "刑侦实验台",
    subtitle: "拉丝阳极氧化铝 · 深灰切割垫",
    frameId: "brushed_metal",
    trayId: "esd_mat",
    swatches: ["#aeb6be", "#2b3238"],
  },
  {
    id: "obsidian_castle",
    label: "黑金古堡",
    subtitle: "黑曜金纹大理石 · 炭黑微水泥",
    frameId: "nero_marble",
    trayId: "micro_cement",
    swatches: ["#1c1a18", "#3d3a36"],
  },
];

export function resolveSurfaceTheme(theme) {
  const preset =
    SURFACE_THEME_PRESETS.find((p) => p.id === theme?.presetId) ??
    SURFACE_THEME_PRESETS[0];
  const frameId =
    theme?.framePreset && SURFACE_MATERIALS[theme.framePreset]
      ? theme.framePreset
      : preset.frameId;
  const trayId =
    theme?.trayPreset && SURFACE_MATERIALS[theme.trayPreset]
      ? theme.trayPreset
      : preset.trayId;
  return {
    presetId: preset.id,
    frameId,
    trayId,
    frame: SURFACE_MATERIALS[frameId],
    tray: SURFACE_MATERIALS[trayId],
  };
}

export function loadSavedSurfaceTheme(campaignId) {
  try {
    const raw = localStorage.getItem(`veilboard:surface:${campaignId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { presetId: "plaster", framePreset: "plaster_frame", trayPreset: "plaster_tray" };
}

export function saveSurfaceTheme(campaignId, theme) {
  try {
    localStorage.setItem(`veilboard:surface:${campaignId}`, JSON.stringify(theme));
  } catch {}
}

// ---------- Seamless Procedural PBR Generators (512x512, cached) ----------

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTileableNoise(gridSize, seed) {
  const rand = seeded(seed);
  const grid = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * gridSize;
    const y = ((v % 1) + 1) % 1 * gridSize;
    const x0 = Math.floor(x) % gridSize;
    const y0 = Math.floor(y) % gridSize;
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * gridSize + x0];
    const b = grid[y0 * gridSize + x1];
    const c = grid[y1 * gridSize + x0];
    const d = grid[y1 * gridSize + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

function fbmTile(u, v, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves.length; i++) {
    sum += octaves[i](u, v) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function buildNormalFromHeight(height, size, strength) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const mask = size - 1;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function buildProceduralSet(kind, anisotropy = 11) {
  const size = 512;
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = diffCanvas.height = size;
  const dctx = diffCanvas.getContext("2d", { colorSpace: "srgb" });
  const dImg = dctx.createImageData(size, size);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d");
  const rImg = rctx.createImageData(size, size);

  const height = new Float32Array(size * size);

  const n4 = makeTileableNoise(4, kind.charCodeAt(0) * 97 + 11);
  const n8 = makeTileableNoise(8, kind.charCodeAt(0) * 131 + 29);
  const n16 = makeTileableNoise(16, kind.charCodeAt(0) * 193 + 53);
  const n32 = makeTileableNoise(32, kind.charCodeAt(0) * 257 + 71);
  const n64 = makeTileableNoise(64, kind.charCodeAt(0) * 317 + 89);
  const rand = seeded(kind.charCodeAt(0) * 7919 + 42);

  let normalStrength = 2.0;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      let r = 128, g = 128, b = 128;
      let rough = 180;
      let h = 0.5;

      if (kind === "walnut") {
        normalStrength = 2.2;
        const warp = fbmTile(u, v, [n4, n8, n16]) * 0.24;
        const rings = Math.sin((v * 14.0 + warp * 12.0) * Math.PI * 2) * 0.5 + 0.5;
        const fineGrain = n64(u * 0.35, v * 4.0);
        const pore = n64(u * 1.2, v * 6.0) > 0.84 ? 0.14 : 0;
        const mixT = rings * 0.68 + fineGrain * 0.32;
        r = 56 + mixT * 52 - pore * 28;
        g = 34 + mixT * 31 - pore * 18;
        b = 20 + mixT * 18 - pore * 10;
        h = mixT * 0.65 - pore * 0.85;
        rough = 132 + (1 - mixT) * 58 + pore * 65;
      } else if (kind === "felt") {
        normalStrength = 3.2;
        const fbm = fbmTile(u, v, [n8, n16, n32, n64]);
        const weave =
          (Math.sin(x * 1.45) * Math.sin(y * 1.45)) * 0.08 +
          (rand() - 0.5) * 0.14;
        const tone = 0.78 + fbm * 0.32 + weave;
        r = 25 * tone;
        g = 68 * tone;
        b = 46 * tone;
        h = fbm * 0.55 + weave * 1.1;
        rough = 232 + weave * 20;
      } else if (kind === "brass" || kind === "metal") {
        normalStrength = 1.6;
        const streak =
          n64(u * 0.18, v * 5.0) * 0.65 +
          n32(u * 0.12, v * 3.0) * 0.35;
        const patina = fbmTile(u, v, [n4, n8, n16]);
        if (kind === "brass") {
          const t = 0.75 + streak * 0.3 - (1 - patina) * 0.22;
          r = 186 * t;
          g = 148 * t;
          b = 84 * t;
          rough = 86 + (1 - patina) * 78 + (1 - streak) * 28;
        } else {
          const t = 0.84 + streak * 0.24 - patina * 0.08;
          r = 178 * t;
          g = 185 * t;
          b = 194 * t;
          rough = 92 + (1 - streak) * 44;
        }
        h = streak * 0.7 + patina * 0.3;
      } else if (kind === "leather") {
        normalStrength = 3.4;
        const pebble = n64(u * 1.6, v * 1.6);
        const crease = Math.abs(fbmTile(u, v, [n8, n16, n32]) * 2 - 1);
        const bump = Math.pow(pebble, 0.75) * 0.75 + crease * 0.25;
        const tone = 0.68 + bump * 0.44;
        r = 68 * tone;
        g = 42 * tone;
        b = 28 * tone;
        h = bump;
        rough = 178 + (1 - bump) * 52;
      } else if (kind === "esd") {
        normalStrength = 1.4;
        const micro = n64(u * 2, v * 2) * 0.4 + (rand() - 0.5) * 0.15;
        const gx = Math.abs(((x % 64) / 64) - 0.5);
        const gy = Math.abs(((y % 64) / 64) - 0.5);
        const line = gx > 0.488 || gy > 0.488 ? 1 : 0;
        const subX = Math.abs(((x % 16) / 16) - 0.5);
        const subY = Math.abs(((y % 16) / 16) - 0.5);
        const sub = subX > 0.48 && subY > 0.48 ? 1 : 0;
        r = 42 + micro * 8 + line * 22 + sub * 10;
        g = 49 + micro * 8 + line * 28 + sub * 12;
        b = 54 + micro * 8 + line * 30 + sub * 13;
        h = 0.5 + micro * 0.25 - line * 0.18;
        rough = 175 + micro * 20 - line * 24;
      } else if (kind === "marble") {
        normalStrength = 1.1;
        const warp = fbmTile(u, v, [n4, n8, n16, n32]);
        const veinRaw = Math.abs(Math.sin((u * 3.0 + v * 2.0 + warp * 2.6) * Math.PI));
        const vein = Math.pow(Math.max(0, 1 - veinRaw * 9.0), 2.4);
        const subtleVein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((u * 5.0 - v * 4.0 + warp * 3.4) * Math.PI)) * 12.0), 2.0);
        const base = 20 + warp * 18;
        r = base + vein * 175 + subtleVein * 48;
        g = base * 0.96 + vein * 138 + subtleVein * 44;
        b = base * 0.92 + vein * 66 + subtleVein * 38;
        h = 0.5 + warp * 0.2 - vein * 0.35;
        rough = 74 + warp * 36 + vein * 48;
      }

      dImg.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      dImg.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      dImg.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      dImg.data[idx + 3] = 255;

      const rv = Math.max(20, Math.min(250, Math.round(rough)));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;

      height[y * size + x] = h;
    }
  }

  dctx.putImageData(dImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const normCanvas = buildNormalFromHeight(height, size, normalStrength);

  const map = new CanvasTexture(diffCanvas);
  map.colorSpace = SRGBColorSpace;
  const normalMap = new CanvasTexture(normCanvas);
  normalMap.colorSpace = NoColorSpace;
  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = NoColorSpace;

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = anisotropy;
    t.generateMipmaps = true;
    t.needsUpdate = true;
  }

  return { map, normalMap, roughnessMap };
}

const textureSetCache = new Map();

export async function loadSurfaceTextureSet(slotConfig, anisotropy = 11) {
  if (slotConfig.maps?.diffuse) {
    const key = `files:${slotConfig.maps.diffuse}`;
    if (!textureSetCache.has(key)) {
      textureSetCache.set(
        key,
        Promise.all([
          loadTexture(slotConfig.maps.diffuse),
          loadTexture(slotConfig.maps.normal),
          loadTexture(slotConfig.maps.roughness),
        ]).then(([map, normalMap, roughnessMap]) => {
          for (const t of [map, normalMap, roughnessMap]) {
            t.wrapS = RepeatWrapping;
            t.wrapT = RepeatWrapping;
            t.anisotropy = anisotropy;
            t.colorSpace = NoColorSpace;
            t.needsUpdate = true;
          }
          map.colorSpace = SRGBColorSpace;
          return { map, normalMap, roughnessMap };
        }),
      );
    }
    return textureSetCache.get(key);
  }
  if (slotConfig.kind === "plaster") {
    return loadPlasterTextures(anisotropy);
  }
  const genKey = `proc:${slotConfig.generator}`;
  if (!textureSetCache.has(genKey)) {
    textureSetCache.set(
      genKey,
      Promise.resolve(buildProceduralSet(slotConfig.generator, anisotropy)),
    );
  }
  return textureSetCache.get(genKey);
}
