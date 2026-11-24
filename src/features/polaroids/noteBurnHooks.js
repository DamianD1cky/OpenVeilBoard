import { Vector2, uniform } from "../../engine/index.js";

export const DEFAULT_BURN_CONFIG = {
  mode: "none", // "none" | "scorched" | "burning"
  topology: "corner", // "corner" | "bottom" | "perimeter" | "point"
  progress: 0.24,
  origin: [0.88, 0.14],
  glowIntensity: 2.2,
  seed: 7,
};

const TOPO_INDEX = {
  corner: 0,
  bottom: 1,
  perimeter: 2,
  point: 3,
};

export function normalizeBurnConfig(raw, fallbackSeed = 7) {
  if (!raw || typeof raw !== "object" || raw.mode === "none" || !raw.mode) {
    return null;
  }
  const mode = raw.mode === "burning" ? "burning" : "scorched";
  const topology = raw.topology in TOPO_INDEX ? raw.topology : "corner";
  const progress = Math.max(
    0.04,
    Math.min(0.95, Number(raw.progress ?? DEFAULT_BURN_CONFIG.progress) || 0.24),
  );
  const ox = Array.isArray(raw.origin) ? Number(raw.origin[0]) : 0.88;
  const oy = Array.isArray(raw.origin) ? Number(raw.origin[1]) : 0.14;
  const origin = [
    Number.isFinite(ox) ? Math.max(0, Math.min(1, ox)) : 0.88,
    Number.isFinite(oy) ? Math.max(0, Math.min(1, oy)) : 0.14,
  ];
  const glowIntensity = Math.max(
    0.5,
    Math.min(4.0, Number(raw.glowIntensity ?? 2.2) || 2.2),
  );
  const seed = Number.isFinite(Number(raw.seed))
    ? Number(raw.seed)
    : fallbackSeed;
  return { mode, topology, progress, origin, glowIntensity, seed };
}

function hashSeed(str) {
  let h = 1;
  for (const ch of String(str ?? "")) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  }
  return ((h >>> 0) % 997) * 0.137 + 1.1;
}

const NOTE_BURN_WGSL = `
struct NoteBurnOut {
  color: vec3f,
  alpha: f32,
  emissive: vec3f,
  charAmt: f32,
};

fn nbHash(pIn: vec2f) -> f32 {
  var p = fract(pIn * vec2f(123.34, 456.21));
  p = p + vec2f(dot(p, p + vec2f(45.32)));
  return fract(p.x * p.y);
}

fn nbVnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f0 = fract(p);
  let f = f0 * f0 * (vec2f(3.0) - vec2f(2.0) * f0);
  return mix(
    mix(nbHash(i), nbHash(i + vec2f(1.0, 0.0)), f.x),
    mix(nbHash(i + vec2f(0.0, 1.0)), nbHash(i + vec2f(1.0, 1.0)), f.x),
    f.y
  );
}

fn nbFbm(pIn: vec2f) -> f32 {
  var p = pIn;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 5; i = i + 1) {
    v = v + a * nbVnoise(p);
    p = p * 2.03 + vec2f(17.3);
    a = a * 0.5;
  }
  return v;
}

fn nbRidge(p: vec2f) -> f32 {
  return 1.0 - abs(nbVnoise(p) * 2.0 - 1.0);
}

fn nbSignedDistance(uv: vec2f, n: f32, n2: f32) -> f32 {
  let noiseAmt = 0.42;
  let perturb = (n - 0.5) * noiseAmt + (n2 - 0.5) * noiseAmt * 0.35;
  let topo = material.uBurnTopo;
  let progress = clamp(material.uBurnProgress, 0.0, 1.05);
  let aspect = max(material.uBurnAspect, 0.4);

  if (topo > 0.5 && topo < 1.5) {
    // bottom: burns upward from bottom edge (uv.y == 0)
    let field = uv.y + perturb * 0.58;
    let front = mix(-0.10, 1.08, progress);
    return field - front;
  }
  if (topo >= 1.5 && topo < 2.5) {
    // perimeter: burns inward from all four edges
    let aspectScale = vec2f(min(aspect, 1.35), 1.0);
    let edgeDist = min(uv, vec2f(1.0) - uv) * aspectScale;
    let minEdge = min(edgeDist.x, edgeDist.y);
    let cornerDist = length(edgeDist) * 0.62;
    let baseField = mix(minEdge, cornerDist, 0.32);
    let field = baseField + perturb * 0.30;
    let front = mix(-0.06, 0.52, progress);
    return field - front;
  }
  // corner (0) or point (3): radial flame front from uBurnOrigin
  let p = vec2f(uv.x * aspect, uv.y);
  let o = vec2f(material.uBurnOrigin.x * aspect, material.uBurnOrigin.y);
  let field = length(p - o) + perturb;
  let d00 = length(vec2f(0.0, 0.0) - o);
  let d10 = length(vec2f(aspect, 0.0) - o);
  let d01 = length(vec2f(0.0, 1.0) - o);
  let d11 = length(vec2f(aspect, 1.0) - o);
  let maxCorner = max(max(d00, d10), max(d01, d11)) + noiseAmt * 0.55;
  let front = mix(-0.14, maxCorner, progress);
  return field - front;
}

fn evalNoteBurn(uv: vec2f, baseRgb: vec3f) -> NoteBurnOut {
  var out: NoteBurnOut;
  out.color = baseRgb;
  out.alpha = 1.0;
  out.emissive = vec3f(0.0);
  out.charAmt = 0.0;

  if (material.uBurnActive < 0.5 || material.uBurnProgress <= 0.001) {
    return out;
  }

  let seed = material.uBurnSeed;
  let n = nbFbm(uv * 5.2 + vec2f(seed));
  let n2 = nbFbm(uv * 14.0 - vec2f(seed * 1.7));
  let ashNoise = nbFbm(uv * 26.0 + vec2f(seed * 3.1));
  let d = nbSignedDistance(uv, n, n2);

  let spreadWidth = 0.20;
  let charWidth = 0.042;
  let ashWidth = 0.095;
  let emberWidth = 0.052;

  // Ragged ash cutout -> drives alphaTest discard in both beauty and shadow passes
  if (d < -ashWidth) {
    out.alpha = 0.0;
    return out;
  }
  if (d < -ashWidth * 0.45 && ashNoise < 0.42) {
    out.alpha = 0.0;
    return out;
  }
  if (d < 0.0 && ashNoise < 0.18 * smoothstep(0.0, -ashWidth, d)) {
    out.alpha = 0.0;
    return out;
  }

  if (d >= 0.0) {
    // Scorched paper transition in linear light space
    let scorch = smoothstep(spreadWidth, 0.0, d);
    let blotch = nbFbm(uv * 7.2 - vec2f(seed));
    let amt = scorch * (0.55 + 0.45 * blotch);
    var s = mix(baseRgb, vec3f(0.30, 0.11, 0.015), amt * 0.82);
    s = mix(s, vec3f(0.036, 0.008, 0.0018), pow(amt, 2.2) * 0.90);
    // Faint smoke halo ahead of scorch
    s = s * (1.0 - smoothstep(spreadWidth * 1.65, spreadWidth * 0.55, d) * 0.24 * (0.4 + 0.6 * blotch));
    // Crisp dark curled lip right at flame edge + subtle warm ridge
    s = s * (1.0 - 0.34 * exp(-d * 40.0));
    s = s * (1.0 + 0.12 * exp(-abs(d - 0.042) * 62.0));
    out.color = s;
    out.charAmt = amt * 0.65;
  } else {
    let behind = -d;
    let crack = pow(nbRidge(uv * 34.0 + vec2f(seed)), 6.0) * 0.7
              + pow(nbRidge(uv * 13.0 - vec2f(seed)), 4.0) * 0.3;
    let charCol = vec3f(0.006, 0.0045, 0.004) * (0.6 + 0.8 * ashNoise) + vec3f(crack * 0.018);
    var ashCol = mix(
      vec3f(0.018, 0.016, 0.015),
      vec3f(0.20, 0.185, 0.165),
      smoothstep(charWidth, ashWidth, behind) * (0.35 + 0.65 * ashNoise)
    );
    ashCol = ashCol * (1.0 - crack * 0.45);
    out.color = mix(charCol, ashCol, smoothstep(charWidth * 0.65, ashWidth, behind));
    out.charAmt = 1.0;

    // Live flickering HDR embers routed into global Bloom pass when mode == "burning"
    if (material.uBurnActive > 1.5) {
      let t = material.uBurnTime;
      let emberBand = smoothstep(emberWidth, 0.0, behind);
      let flicker = 0.72 + 0.28 * sin(t * 10.5 + n * 42.0 + sin(t * 21.0 + uv.x * 31.0));
      let sparks = smoothstep(0.58, 0.94, nbFbm(uv * 19.0 + vec2f(0.0, -t * 0.55) + vec2f(seed)));
      let emberHot = vec3f(2.4, 0.22, 0.01);
      let emberBright = vec3f(3.8, 1.35, 0.12);
      let glow = mix(emberHot, emberBright, sparks) * material.uBurnGlow * flicker * (0.55 + 0.75 * sparks) * emberBand;
      out.emissive = glow;
      out.color = out.color + glow * 0.28;
    }

    out.alpha = mix(1.0, 0.28 + 0.72 * ashNoise, smoothstep(charWidth, ashWidth, behind));
  }

  return out;
}
`;

export function createNoteBurnHooks(note, aspect = 0.8) {
  const seedFallback = hashSeed(note?.id);
  const cfg = normalizeBurnConfig(note?.burn, seedFallback);
  const uniforms = {
    uBurnActive: uniform(cfg ? (cfg.mode === "burning" ? 2 : 1) : 0),
    uBurnTopo: uniform(cfg ? TOPO_INDEX[cfg.topology] : 0),
    uBurnProgress: uniform(cfg ? cfg.progress : 0),
    uBurnOrigin: uniform(new Vector2(cfg ? cfg.origin[0] : 0.88, cfg ? cfg.origin[1] : 0.14)),
    uBurnAspect: uniform(aspect),
    uBurnGlow: uniform(cfg ? cfg.glowIntensity : 2.2),
    uBurnSeed: uniform(cfg ? cfg.seed : seedFallback),
    uBurnTime: uniform(0),
  };

  const hooks = {
    key: "note-paper-burn",
    uniforms,
    functions: NOTE_BURN_WGSL,
    color: `
  let noteBurn = evalNoteBurn(uv, diffuseColor.rgb);
  diffuseColor = vec4f(noteBurn.color, diffuseColor.a * noteBurn.alpha);
`,
    surface: `
  roughness = mix(roughness, 0.98, noteBurn.charAmt);
  emissive = emissive + noteBurn.emissive;
`,
  };

  return {
    uniforms,
    hooks,
    update(nextNote, nextAspect) {
      const next = normalizeBurnConfig(nextNote?.burn, hashSeed(nextNote?.id));
      uniforms.uBurnAspect.value = nextAspect;
      if (!next) {
        uniforms.uBurnActive.value = 0;
        uniforms.uBurnProgress.value = 0;
        return 0;
      }
      const active = next.mode === "burning" ? 2 : 1;
      uniforms.uBurnActive.value = active;
      uniforms.uBurnTopo.value = TOPO_INDEX[next.topology] ?? 0;
      uniforms.uBurnProgress.value = next.progress;
      uniforms.uBurnOrigin.value.set(next.origin[0], next.origin[1]);
      uniforms.uBurnGlow.value = next.glowIntensity;
      uniforms.uBurnSeed.value = next.seed;
      return active;
    },
  };
}
