import { duration } from "../shared/motionConfig.js";
import { placementDefaults } from "../features/polaroids/polaroidLayout.js";
import { RENDER_DPR_MIN } from "../shared/renderBudget.js";
export const STORAGE_KEY = `folio-2026:scene-defaults`;
export const FOLDERS = {
  camera: `Camera`,
  parallax: `Parallax`,
  intro: `Intro`,
  scene: `Scene`,
  environment: `Environment`,
  ambient: `Lights / Ambient`,
  key: `Lights / Key`,
  fill: `Lights / Fill`,
  counter: `Counter`,
  bevel: `Bevel`,
  material: `Material`,
  wear: `Plaster wear`,
  sceneTransition: `Scene transition`,
  labMetal: `Lab / Brushed metal`,
  labMat: `Lab / ESD mat`,
  shadows: `Shadows`,
  gtao: `GTAO`,
  gobo: `Gobo`,
  dust: `Dust`,
  moments: `Moments`,
  polaroids: `Polaroids`,
  polaroidWind: `Polaroid wind`,
  polaroidDesktop: `Polaroid placement / Desktop`,
  polaroidTablet: `Polaroid placement / Tablet`,
  polaroidMobile: `Polaroid placement / Mobile`,
  galleryTitle: `Gallery title`,
  inspect: `Inspect`,
  hud: `HUD`,
  meta: `Meta`,
  scrollIndicator: `Scroll indicator`,
  projection: `Projection`,
  media: `Media`,
};
export const FACTORY_DEFAULTS = {
  camera: {
    height: 6.4,
    fov: 32,
    x: 0,
    z: 0.12,
    near: 0.1,
    far: 40,
    lookAtX: 0,
    lookAtY: 0,
    lookAtZ: 0,
  },
  parallax: {
    enabled: true,
    amount: 0.2,
    look: 0.28,
    duration: duration.parallax,
    ease: `power3.out`,
  },
  intro: {
    enabled: true,
    preview: false,
    progress: 0,
    zoom: 0.65,
    slotX: 0,
    slotZ: 0,
  },
  scene: {
    background: `#141311`,
    shadows: true,
    antialias: true,
    dprMin: RENDER_DPR_MIN,
    dprMax: 2,
    adaptiveDpr: true,
  },
  environment: {
    enabled: true,
    preset: `night`,
    intensity: 0.55,
  },
  ambient: {
    intensity: 1.7,
    color: `#eee5dc`,
  },
  key: {
    intensity: 3.0700000000000003,
    color: `#fff1df`,
    x: 3.4,
    y: 6,
    z: -4.5,
    castShadow: true,
    shadowMapSize: 2048,
    shadowFar: 23.5,
    shadowExtent: 6.5,
    shadowNear: 0.82,
    shadowBias: 53e-5,
    shadowNormalBias: 0.03,
    shadowRadius: 0.85,
    shadowBlurSamples: 4,
    shadowIntensity: 0.86,
  },
  fill: {
    intensity: 0.22,
    color: `#e5ebf5`,
    x: -4.2,
    y: 5.5,
    z: -3.1,
  },
  counter: {
    frame: 0.039999999999999994,
    overscan: 1.81,
    thickness: 0.015,
    indentDepth: 0.016,
    indentRadius: 0.031,
    minIndent: 0.23,
  },
  bevel: {
    enabled: true,
    size: 0.004,
    thickness: 0.011,
    offset: 0.004,
    segments: 6,
    curveSegments: 9,
  },
  material: {
    useTextures: true,
    repeat: 2.45,
    bumpScale: 0.16,
    normalScale: 0.39,
    roughness: 1,
    metalness: 0,
    anisotropy: 11,
    color: `#bebcb8`,
    floorColor: `#d8d2c8`,
  },
  wear: {
    enabled: true,
    chips: 0.32,
    chipReach: 0.08,
    chipDepth: 1,
    chipLift: 1.75,
    chipTint: `#fff4e8`,
    bite: 0.09,
    cracks: 0.72,
    recessDepth: 1.3,
    stains: 0.16,
    grime: 0.25,
    grimeReach: 0.09,
    bump: 1.1,
    text: 0.5,
  },
  sceneTransition: {
    duration: duration.wipe,
    ease: `thomas`,
    cameraX: 1.08,
    cameraY: 0.44,
    cameraZ: 0.32,
    cameraRoll: 0.14,
    cameraYaw: 0.07,
    soft: 0.16,
    overshoot: 0.1,
    glowWidth: 0.12,
    glow: 0.18,
    glowBloom: 0.22,
    glowColor: `#fff4dc`,
  },
  labMetal: {
    color: `#c3c9d1`,
    roughness: 1,
    metalness: 0.91,
    aoIntensity: 1.26,
    normalScale: 0.24,
    envMapIntensity: 2.4000000000000004,
    repeat: 0.25,
    anisotropy: 13,
  },
  labMat: {
    color: `#ffffff`,
    roughness: 0.49999999999999994,
    metalness: 0,
    envMapIntensity: 0.85,
  },
  shadows: {
    enabled: true,
    opacity: 0.46,
    blur: 4.4,
    far: 1.08,
    resolution: 1024,
    color: `#1a1814`,
    scale: 0.6,
  },
  gtao: {
    enabled: true,
    samples: 16,
    distanceExponent: 1,
    distanceFallOff: 1,
    radius: 0.25,
    scale: 0.5,
    thickness: 1,
    resolutionScale: 0.5,
    temporal: false,
    aoOnly: false,
  },
  gobo: {
    enabled: true,
    shadowScale: 1.88,
    opacity: 0.75,
    color: `#444444`,
    blur: 1.2,
    speed: 0.14,
    sway: 0.42999999999999994,
    x: 10.43,
    z: 1.32,
    height: 0,
    coverage: 4.6499999999999995,
    angle: -0.341,
    down: true,
    downX: -1.84,
    downZ: -7.02,
    downAngle: -0.030000000000000027,
    downHeight: 0.435,
    downCoverage: 4.12,
    downOpacity: 0.51,
  },
  dust: {
    enabled: true,
    count: 240,
    size: 0.005999999999999998,
    sizeJitter: 2.4,
    opacity: 0.4,
    color: `#f0e6d8`,
    speed: 0.08,
    drift: 0.2,
    rise: 0.035,
    twinkle: 0.38,
    softness: 1.85,
    width: 9,
    height: 5,
    depth: 9,
    x: 0,
    y: 2.55,
    z: 0,
    near: 0.55,
    far: 14,
    additive: true,
    seed: 1,
  },
  moments: {
    enabled: true,
    first: 28,
    interval: 60,
    cloudChance: 0.35,
    cloudDepth: 0.52,
    cloudShadows: 0.7,
  },
  polaroids: {
    enabled: true,
    count: 6,
    width: 0.58,
    lift: 0.6,
    velocity: 0.59,
    maxStretch: 0.6,
    scatter: 1,
    variation: 0,
    seed: 3295753007,
    minDistance: 1.02,
    maxDistance: 2.85,
    fontSize: 0.072,
  },
  polaroidWind: {
    enabled: true,
    strength: 6.26,
    dragStrength: 0.3,
    radius: 160,
    minSpeed: 1e3,
    maxSpeed: 12e3,
    speedCurve: 2,
    strokePause: 220,
    impulse: 0.08,
    drift: 1,
    mass: 0.7,
    friction: 2.75,
    spin: 1.55,
    lift: 0.8,
    tilt: 1.4,
    response: 11.5,
    decay: 1.25,
    variation: 0.76,
    returnEnabled: true,
    returnDelay: 5,
    returnCooldown: 18,
    returnEdge: 0.8,
    returnStrength: 1,
    returnDuration: 1.8,
    returnStagger: 0.18,
  },
  polaroidDesktop: placementDefaults(`desktop`),
  polaroidTablet: placementDefaults(`tablet`),
  polaroidMobile: placementDefaults(`mobile`),
  galleryTitle: {
    preview: true,
    size: 0.53,
    x: 0,
    y: -0.006,
    z: -0.635,
    letterSpacing: -0.05,
    opacity: 1,
    rise: 0.2,
  },
  inspect: {
    enabled: true,
    preview: false,
    previewArmed: false,
    widthScale: 1.49,
    heightScale: 1.53,
    indentLimit: 0.61,
    inset: 0.124,
    radiusScale: 0.52,
    wellDepth: 0.09,
    color: `#f7e9da`,
    opacity: 0.45,
    fill: 1,
    fillArmed: 0.52,
    rim: 1.5,
    rimArmed: 0.39,
    glow: 0.12,
    glowArmed: 0.44,
    edge: 0.031,
    pad: 0.2,
    breathe: 0.14,
    breatheSpeed: 1.7,
    sweep: 0.73,
    sweepSpeed: 2.95,
    helperText: `Drop here to inspect`,
    helperSize: 0.22,
    loopScan: false,
    scanFalloff: 0.02,
    scanIntensity: 1.5,
    bloomStrength: 8,
    bloomRadius: 1,
    bloomThreshold: 0,
    bloomSmooth: 0.096,
  },
  hud: {
    fontSize: 0.08,
    y: 0.012,
    pad: 0.16,
    nameLineHeight: 0.93,
    navLineHeight: 1.15,
    heroLineHeight: 0.77,
    tagLineHeight: 1.17,
  },
  meta: {
    fontSize: 0.07,
    lineHeight: 1.2,
    tagSize: 0.039,
    outline: 0.002,
    tagPad: 0.03,
    tagGap: 0.022,
    textGap: 0.07,
  },
  scrollIndicator: {
    enabled: true,
    x: -0.5700000000000001,
    z: 0,
    fontSize: 0.052,
    labelGap: 0.034,
    lineWidth: 0.006,
    opacity: 0.78,
    roughness: 0.82,
    drawDuration: 1.4,
    drawDelay: 0.18,
    floorLift: 0.012,
    surfaceLift: 0.014,
    climbSpan: 1,
    pulseInterval: 3.8,
    pulseDuration: 1.5,
    pulseSize: 0.018,
    pulseIntensity: 5,
  },
  projection: {
    preview: false,
    feather: 0.075,
    opacity: 1,
    wash: 0.14,
    washColor: `#e8dcc8`,
    brightness: 1.4,
    x: 0,
    z: 0,
    y: 0,
    scale: 1,
    inset: 0,
    titleGap: 1,
    wellGap: 0.65,
    expandDuration: duration.expand,
  },
  media: {
    height: 0.21,
    radius: 0.082,
    y: 0.0014,
    filmInset: 0,
    bevel: true,
    bevelSize: 0.024,
    bevelThickness: 0.034,
    bevelOffset: 0,
    bevelSegments: 4,
    curveSegments: 20,
    opacity: 0.86,
    wash: 0,
    washColor: `#ffffff`,
    brightness: 1,
    feather: 0,
  },
};
function mergeFolder(factory, saved) {
  if (!saved) {
    return {
      ...factory,
    };
  }
  const next = {
    ...factory,
  };
  for (const key of Object.keys(factory)) {
    if (saved[key] !== undefined) {
      next[key] = saved[key];
    }
  }
  return next;
}
export function readSavedRecord() {
  if (typeof window === `undefined`) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function getSavedDefaults() {
  return readSavedRecord()?.values ?? null;
}
export function getInitialDefaults() {
  const saved = getSavedDefaults();
  if (!saved) {
    return FACTORY_DEFAULTS;
  }
  const legacyLighting = saved.gobo && saved.gobo.downAngle === undefined;
  const lightingFolders = [`gobo`, `environment`, `ambient`, `key`, `fill`];
  return Object.fromEntries(
    Object.entries(FACTORY_DEFAULTS).map(([folder, values]) => [
      folder,
      mergeFolder(
        values,
        legacyLighting && lightingFolders.includes(folder) ? null : saved[folder],
      ),
    ]),
  );
}
export function formatSavedAt(iso) {
  if (!iso) {
    return `none`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return `none`;
  }
  return date.toLocaleString();
}
export function getControlPath(folderKey, key) {
  return `${FOLDERS[folderKey]}.${key}`;
}
export function clearSavedDefaults() {
  window.localStorage.removeItem(STORAGE_KEY);
}
