const LAST_LIGHTING_KEY = "veilboard:lighting:last";
const ROOM_LIGHTING_PREFIX = "veilboard:lighting:";

export const GOBO_PATTERNS = [
  { id: "flora", label: "树影", hint: "自然枝叶摇曳" },
  { id: "blinds", label: "百叶窗", hint: "黑色电影光栅" },
  { id: "window", label: "格子窗", hint: "维多利亚窗棂" },
  { id: "lamp", label: "台灯罩", hint: "聚光中心暗角" },
  { id: "none", label: "无投影", hint: "纯净平面光" },
];

export const LIGHTING_PRESETS = [
  {
    id: "afternoon",
    label: "午后树影",
    subtitle: "暖白窗光 · 斑驳枝叶",
    swatches: ["#fff1df", "#5e6a59"],
    state: {
      presetId: "afternoon",
      azimuth: 37,
      elevation: 47,
      warmth: 5600,
      brightness: 1.0,
      contrast: 1.0,
      goboPattern: "flora",
      goboOpacity: 0.75,
      goboSoft: 0.0,
      goboSway: 0.43,
      dustEnabled: true,
      clouds: false,
    },
  },
  {
    id: "desk_lamp",
    label: "深夜台灯",
    subtitle: "琥珀聚光 · 暗角沉静",
    swatches: ["#ffb566", "#1d1714"],
    state: {
      presetId: "desk_lamp",
      azimuth: 18,
      elevation: 54,
      warmth: 3000,
      brightness: 0.84,
      contrast: 1.48,
      goboPattern: "lamp",
      goboOpacity: 0.84,
      goboSoft: 1.2,
      goboSway: 0.0,
      dustEnabled: true,
      clouds: false,
    },
  },
  {
    id: "moonlit",
    label: "月夜薄雾",
    subtitle: "冷月长影 · 深蓝幽微",
    swatches: ["#a7cbff", "#1a2842"],
    state: {
      presetId: "moonlit",
      azimuth: -42,
      elevation: 31,
      warmth: 7800,
      brightness: 0.74,
      contrast: 1.32,
      goboPattern: "flora",
      goboOpacity: 0.82,
      goboSoft: 0.9,
      goboSway: 0.24,
      dustEnabled: true,
      clouds: false,
    },
  },
  {
    id: "rainy_skylight",
    label: "阴雨天窗",
    subtitle: "冷灰柔光 · 云影掠过",
    swatches: ["#d6e3f0", "#46525e"],
    state: {
      presetId: "rainy_skylight",
      azimuth: 14,
      elevation: 62,
      warmth: 6600,
      brightness: 0.92,
      contrast: 0.68,
      goboPattern: "window",
      goboOpacity: 0.62,
      goboSoft: 2.1,
      goboSway: 0.0,
      dustEnabled: false,
      clouds: true,
    },
  },
  {
    id: "golden_hour",
    label: "黄昏百叶",
    subtitle: "低角夕照 · 侦探光栅",
    swatches: ["#ff9d57", "#423244"],
    state: {
      presetId: "golden_hour",
      azimuth: 64,
      elevation: 28,
      warmth: 3350,
      brightness: 0.98,
      contrast: 1.38,
      goboPattern: "blinds",
      goboOpacity: 0.78,
      goboSoft: 0.65,
      goboSway: 0.0,
      dustEnabled: true,
      clouds: false,
    },
  },
  {
    id: "forensic",
    label: "刑侦读图",
    subtitle: "中性顶光 · 清晰无扰",
    swatches: ["#f2f7ff", "#93a0ae"],
    state: {
      presetId: "forensic",
      azimuth: 8,
      elevation: 72,
      warmth: 6150,
      brightness: 1.08,
      contrast: 0.82,
      goboPattern: "none",
      goboOpacity: 0.0,
      goboSoft: 0.4,
      goboSway: 0.0,
      dustEnabled: false,
      clouds: false,
    },
  },
];

export const DEFAULT_LIGHTING_STATE = { ...LIGHTING_PRESETS[0].state };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgbToHex(r, g, b) {
  const c = (n) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpRgb(c1, c2, t) {
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

/**
 * Calibrated artistic color temperature curve (2700K .. 8200K).
 * Passes through OpenVeilBoard's signature warm white #fff1df at 5600K.
 */
export function kelvinToKeyHex(kelvin) {
  const k = clamp(Number(kelvin) || 5600, 2700, 8200);
  const stops = [
    [2700, [255, 162, 86]],
    [3400, [255, 194, 132]],
    [4500, [255, 224, 186]],
    [5600, [255, 241, 223]],
    [6500, [238, 245, 255]],
    [8200, [168, 206, 255]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [k0, c0] = stops[i];
    const [k1, c1] = stops[i + 1];
    if (k <= k1) {
      const t = (k - k0) / (k1 - k0);
      const [r, g, b] = lerpRgb(c0, c1, t);
      return rgbToHex(r, g, b);
    }
  }
  const last = stops[stops.length - 1][1];
  return rgbToHex(last[0], last[1], last[2]);
}

function kelvinToFillHex(kelvin) {
  const k = clamp(Number(kelvin) || 5600, 2700, 8200);
  // Warm key gets cool indigo/slate fill; cool key gets soft silver-lavender fill.
  const t = (k - 2700) / (8200 - 2700);
  const warmKeyFill = [148, 174, 224];
  const neutralFill = [229, 235, 245];
  const coolKeyFill = [208, 218, 238];
  const rgb =
    t < 0.53
      ? lerpRgb(warmKeyFill, neutralFill, t / 0.53)
      : lerpRgb(neutralFill, coolKeyFill, (t - 0.53) / 0.47);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function kelvinToAmbientHex(kelvin, contrast) {
  const k = clamp(Number(kelvin) || 5600, 2700, 8200);
  const t = (k - 2700) / (8200 - 2700);
  const warmAmb = [206, 178, 152];
  const neutralAmb = [238, 229, 220];
  const coolAmb = [164, 188, 224];
  let rgb =
    t < 0.53
      ? lerpRgb(warmAmb, neutralAmb, t / 0.53)
      : lerpRgb(neutralAmb, coolAmb, (t - 0.53) / 0.47);
  // High contrast deepens ambient toward a cooler shadow base for filmic separation.
  if (contrast > 1.05) {
    const cMix = clamp((contrast - 1.05) / 0.55, 0, 0.55);
    const deepTint = k < 4600 ? [84, 72, 74] : [58, 76, 108];
    rgb = lerpRgb(rgb, deepTint, cMix);
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function kelvinToGoboHex(kelvin, contrast, pattern) {
  const k = clamp(Number(kelvin) || 5600, 2700, 8200);
  const t = (k - 2700) / (8200 - 2700);
  // Subtle chromatic shadow tint; near neutral #444444 at 5600K & contrast 1.0.
  const warmShadow = [50, 38, 34];
  const neutralShadow = [68, 68, 68];
  const coolShadow = [34, 48, 72];
  let rgb =
    t < 0.53
      ? lerpRgb(warmShadow, neutralShadow, t / 0.53)
      : lerpRgb(neutralShadow, coolShadow, (t - 0.53) / 0.47);
  if (pattern === "lamp") {
    // Desk lamp vignette falls off into deeper dark perimeter
    rgb = lerpRgb(rgb, [24, 18, 15], 0.58);
  } else if (contrast > 1.08) {
    const deepen = clamp((contrast - 1.08) * 0.45, 0, 0.35);
    rgb = rgb.map((c) => c * (1 - deepen));
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function kelvinToDustHex(kelvin) {
  const k = clamp(Number(kelvin) || 5600, 2700, 8200);
  const t = (k - 2700) / (8200 - 2700);
  const rgb =
    t < 0.53
      ? lerpRgb([255, 206, 148], [240, 230, 216], t / 0.53)
      : lerpRgb([240, 230, 216], [194, 220, 255], (t - 0.53) / 0.47);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

export function normalizeAzimuth(deg) {
  let a = Number(deg);
  if (!Number.isFinite(a)) return DEFAULT_LIGHTING_STATE.azimuth;
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return Math.round(a);
}

export function resolveLightingState(raw) {
  const base =
    LIGHTING_PRESETS.find((p) => p.id === raw?.presetId)?.state ??
    DEFAULT_LIGHTING_STATE;
  const pattern = GOBO_PATTERNS.some((p) => p.id === raw?.goboPattern)
    ? raw.goboPattern
    : base.goboPattern;
  return {
    presetId:
      typeof raw?.presetId === "string" && raw.presetId ? raw.presetId : base.presetId,
    azimuth: normalizeAzimuth(raw?.azimuth ?? base.azimuth),
    elevation: Math.round(clamp(Number(raw?.elevation ?? base.elevation), 24, 78)),
    warmth: Math.round(clamp(Number(raw?.warmth ?? base.warmth), 2700, 8200)),
    brightness: Number(clamp(Number(raw?.brightness ?? base.brightness), 0.55, 1.45).toFixed(2)),
    contrast: Number(clamp(Number(raw?.contrast ?? base.contrast), 0.55, 1.6).toFixed(2)),
    goboPattern: pattern,
    goboOpacity: Number(clamp(Number(raw?.goboOpacity ?? base.goboOpacity), 0, 1).toFixed(2)),
    goboSoft: Number(clamp(Number(raw?.goboSoft ?? base.goboSoft), 0, 3.6).toFixed(2)),
    goboSway: Number(clamp(Number(raw?.goboSway ?? base.goboSway), 0, 1.2).toFixed(2)),
    dustEnabled:
      raw?.dustEnabled !== undefined ? Boolean(raw.dustEnabled) : Boolean(base.dustEnabled),
    clouds: raw?.clouds !== undefined ? Boolean(raw.clouds) : Boolean(base.clouds),
  };
}

/**
 * Maps high-level perceptual lighting controls into all 6 physical rendering layers.
 */
export function computeLightingRig(rawState) {
  const s = resolveLightingState(rawState);
  const radius = 8.235; // Matches factory hypot(3.4, 6.0, -4.5)
  const azRad = (s.azimuth * Math.PI) / 180;
  const elRad = (s.elevation * Math.PI) / 180;
  const horiz = radius * Math.cos(elRad);
  const keyX = horiz * Math.sin(azRad);
  const keyY = radius * Math.sin(elRad);
  const keyZ = -horiz * Math.cos(azRad);

  // Place fill light roughly opposite key azimuth for stable rim/shadow modeling
  const fillAzRad = azRad - Math.PI * 0.56;
  const fillHoriz = 5.22;
  const fillX = fillHoriz * Math.sin(fillAzRad);
  const fillY = 5.5;
  const fillZ = -fillHoriz * Math.cos(fillAzRad);

  // Contrast shifts energy between key and ambient while keeping total midtone balanced.
  const keyIntensity = clamp(3.07 * s.brightness * (0.62 + 0.38 * s.contrast), 0.8, 6.2);
  const ambientIntensity = clamp(
    1.7 * s.brightness * (1.68 - 0.68 * s.contrast),
    0.26,
    3.2,
  );
  const fillIntensity = clamp(
    0.22 * s.brightness * (1.25 - 0.25 * s.contrast),
    0.08,
    0.65,
  );
  const envIntensity = clamp(
    0.55 * (0.65 + 0.35 * s.brightness) * (s.presetId === "forensic" ? 1.25 : 1.0),
    0.22,
    1.1,
  );
  const exposure = clamp(0.86 + (s.brightness - 0.86) * 0.65 + 0.14 * (1 - Math.abs(1 - s.brightness)), 0.72, 1.32);
  const bloomStrength = clamp(
    1.6 + Math.max(0, s.contrast - 1.0) * 0.75 + (s.warmth < 3800 ? 0.28 : 0),
    1.1,
    2.4,
  );

  const isFlora = s.goboPattern === "flora";
  const goboEnabled = s.goboPattern !== "none" && s.goboOpacity > 0.01;
  const dustOpacity = s.dustEnabled
    ? clamp(0.36 + Math.max(0, s.contrast - 0.9) * 0.24, 0.18, 0.68)
    : 0;

  return {
    state: s,
    key: {
      x: keyX,
      y: keyY,
      z: keyZ,
      color: kelvinToKeyHex(s.warmth),
      intensity: keyIntensity,
    },
    fill: {
      x: fillX,
      y: fillY,
      z: fillZ,
      color: kelvinToFillHex(s.warmth),
      intensity: fillIntensity,
    },
    ambient: {
      color: kelvinToAmbientHex(s.warmth, s.contrast),
      intensity: ambientIntensity,
    },
    environment: {
      intensity: envIntensity,
    },
    post: {
      exposure,
      bloomStrength,
    },
    gobo: {
      pattern: s.goboPattern,
      enabled: goboEnabled,
      opacity: goboEnabled ? s.goboOpacity : 0,
      downOpacity: goboEnabled && isFlora ? clamp(s.goboOpacity * 0.68, 0, 0.85) : 0,
      soft: s.goboSoft,
      sway: isFlora ? s.goboSway : 0,
      speed: isFlora ? (s.goboSway > 0 ? 0.1 + s.goboSway * 0.09 : 0) : 0,
      color: kelvinToGoboHex(s.warmth, s.contrast, s.goboPattern),
      clouds: s.clouds,
      cloudDepth: s.clouds ? clamp(0.46 + (1.1 - s.brightness) * 0.22, 0.36, 0.68) : 0.52,
    },
    dust: {
      enabled: s.dustEnabled,
      opacity: dustOpacity,
      color: kelvinToDustHex(s.warmth),
      speed: s.goboSway > 0.5 ? 0.11 : 0.08,
    },
  };
}

function readStoredLighting(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return resolveLightingState(parsed);
  } catch {
    return null;
  }
}

export function syncLastLighting(state) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      LAST_LIGHTING_KEY,
      JSON.stringify(resolveLightingState(state)),
    );
  } catch {}
}

export function loadLastLighting() {
  return readStoredLighting(LAST_LIGHTING_KEY) ?? { ...DEFAULT_LIGHTING_STATE };
}

export function loadSavedLighting(campaignId) {
  if (campaignId) {
    const saved = readStoredLighting(`${ROOM_LIGHTING_PREFIX}${campaignId}`);
    if (saved) {
      syncLastLighting(saved);
      return saved;
    }
  }
  return loadLastLighting();
}

export function saveLighting(campaignId, state) {
  try {
    if (typeof localStorage === "undefined") return;
    const encoded = JSON.stringify(resolveLightingState(state));
    if (campaignId) {
      localStorage.setItem(`${ROOM_LIGHTING_PREFIX}${campaignId}`, encoded);
    }
    localStorage.setItem(LAST_LIGHTING_KEY, encoded);
  } catch {}
}
