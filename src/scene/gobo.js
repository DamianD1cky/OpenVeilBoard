import { Color, Vector2, Vector3, Vector4 } from "../engine/index.js";
import { UniformBlock, UniformLayout } from "../engine/uniforms.js";
import { CanvasTexture, loadImageBitmap } from "../engine/texture.js";
import { getViewportWorldSize } from "../shared/counterGeometry.js";
import { blurMask } from "../shared/maskBlur.js";
import { GOBO_TEXTURE_URL } from "../shared/sceneAssets.js";

const LAYOUT = new UniformLayout(`Gobo`, [
  [`origin`, `vec3f`],
  [`soft`, `f32`],
  [`u`, `vec3f`],
  [`opacity`, `f32`],
  [`v`, `vec3f`],
  [`enabled`, `f32`],
  [`dir`, `vec3f`],
  [`soft2`, `f32`],
  [`size`, `vec2f`],
  [`size2`, `vec2f`],
  [`origin2`, `vec3f`],
  [`opacity2`, `f32`],
  [`u2`, `vec3f`],
  [`enabled2`, `f32`],
  [`v2`, `vec3f`],
  [`_pad`, `f32`],
  [`color`, `vec3f`],
  [`_pad2`, `f32`],
  [`wind`, `vec4f`],
  [`wind2`, `vec4f`],
  [`cloud`, `vec4f`],
  [`cloudShape`, `vec4f`],
]);

export const GOBO_WGSL = `
${LAYOUT.wgsl()}
@group(3) @binding(0) var<uniform> gobo: Gobo;
@group(3) @binding(1) var goboMap: texture_2d<f32>;
@group(3) @binding(2) var goboSampler: sampler;

fn goboProjectUv(positionWorld: vec3f, origin: vec3f, u: vec3f, v: vec3f, size: vec2f) -> vec2f {
  let rel = positionWorld - origin;
  return vec2f(dot(rel, u) / size.x + 0.5, dot(rel, v) / size.y + 0.5);
}

fn goboMask(uv: vec2f, soft: f32, wind: vec4f) -> f32 {
  let branch = sin(uv.y * 22.0 + uv.x * 11.0);
  let leaf = sin(uv.y * 83.0 - uv.x * 57.0);
  let breeze = vec2f(branch * wind.x + leaf * wind.z, branch * wind.y + leaf * wind.w);
  return textureSampleLevel(goboMap, goboSampler, uv + breeze, soft).y;
}

fn goboFade(uv: vec2f) -> f32 {
  return smoothstep(0.0, 0.06, uv.x) * (1.0 - smoothstep(0.94, 1.0, uv.x))
    * (smoothstep(0.0, 0.06, uv.y) * (1.0 - smoothstep(0.94, 1.0, uv.y)));
}

fn goboVeil(positionWorld: vec3f) -> f32 {
  let uv1 = goboProjectUv(positionWorld, gobo.origin, gobo.u, gobo.v, gobo.size);
  let primary = goboMask(uv1, gobo.soft, gobo.wind) * goboFade(uv1) * gobo.opacity * gobo.enabled;
  let uv2 = goboProjectUv(positionWorld, gobo.origin2, gobo.u2, gobo.v2, gobo.size2);
  let down = goboMask(uv2, gobo.soft2, gobo.wind2) * goboFade(uv2) * gobo.opacity2 * gobo.enabled2;
  let leaves = max(primary, down);
  // Rare moments: a cloud's soft band where the leaves dissolve into shade.
  let floor = positionWorld.xz - (gobo.dir.xz / vec2f(gobo.dir.y)) * vec2f(positionWorld.y);
  let along = dot(floor, gobo.cloud.xy);
  let across = floor.y * gobo.cloud.x - floor.x * gobo.cloud.y;
  let soft = gobo.cloudShape.x;
  let edge = along + sin(across * 1.3 + gobo.cloudShape.y) * soft * 0.45 + sin(across * 3.1 - gobo.cloudShape.y * 1.7) * soft * 0.2;
  let cover = (1.0 - smoothstep(gobo.cloud.z - soft, gobo.cloud.z + soft, edge)) * smoothstep(gobo.cloud.w - soft, gobo.cloud.w + soft, edge);
  return mix(leaves, gobo.cloudShape.w * gobo.enabled, cover * gobo.cloudShape.z);
}

fn goboTint(positionWorld: vec3f) -> vec3f {
  return mix(vec3f(1.0), gobo.color, clamp(goboVeil(positionWorld), 0.0, 1.0));
}
`;

function supportsCanvasFilter() {
  return (
    typeof CanvasRenderingContext2D !== `undefined` &&
    `filter` in CanvasRenderingContext2D.prototype
  );
}

function finalizeGoboTexture(canvas, name) {
  const texture = new CanvasTexture(canvas);
  texture.name = name;
  texture.wrapS = `clamp-to-edge`;
  texture.wrapT = `clamp-to-edge`;
  texture.generateMipmaps = true;
  texture.minFilter = `linear-mipmap-linear`;
  texture.magFilter = `linear`;
  texture.colorSpace = ``;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function blurCanvas(source, size, blur) {
  const canvas = document.createElement(`canvas`);
  canvas.width = canvas.height = size;
  const soft = canvas.getContext(`2d`);
  soft.fillStyle = `#000000`;
  soft.fillRect(0, 0, size, size);
  const radius = Math.max(0, Math.min(18, blur));
  if (radius <= 0.01) {
    soft.drawImage(source, 0, 0);
    return canvas;
  }
  if (supportsCanvasFilter()) {
    soft.filter = `blur(${radius}px)`;
    soft.drawImage(source, 0, 0);
  } else {
    soft.drawImage(source, 0, 0);
    const imageData = soft.getImageData(0, 0, size, size);
    const pixels = imageData.data;
    const mask = new Float32Array(size * size);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = pixels[i * 4 + 1];
    }
    blurMask(mask, size, radius);
    for (let i = 0; i < mask.length; i++) {
      const value = Math.round(mask[i]);
      pixels[i * 4] = value;
      pixels[i * 4 + 1] = value;
      pixels[i * 4 + 2] = value;
      pixels[i * 4 + 3] = 255;
    }
    soft.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function renderGoboCanvas(image, { size = 1024, blur = 1.3 } = {}) {
  const source = document.createElement(`canvas`);
  source.width = source.height = size;
  const context = source.getContext(`2d`);
  context.fillStyle = `#ffffff`;
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  context.globalCompositeOperation = `difference`;
  context.fillRect(0, 0, size, size);
  return blurCanvas(source, size, blur);
}

/**
 * Procedural 1024x1024 gobo masks.
 * Convention matching goboTint(): white (#fff) = shadow, black (#000) = lit aperture.
 */
function renderProceduralGoboCanvas(pattern, size = 1024) {
  const source = document.createElement(`canvas`);
  source.width = source.height = size;
  const ctx = source.getContext(`2d`);

  if (pattern === `blinds`) {
    // Film-noir Venetian blinds inside a soft framed window opening
    ctx.fillStyle = `#f2f2f2`;
    ctx.fillRect(0, 0, size, size);
    const left = size * 0.17;
    const top = size * 0.16;
    const w = size * 0.66;
    const h = size * 0.68;
    const slats = 11;
    const pitch = h / slats;
    const litHeight = pitch * 0.44;
    ctx.fillStyle = `#000000`;
    for (let i = 0; i < slats; i++) {
      const y = top + i * pitch + pitch * 0.28;
      ctx.fillRect(left, y, w, litHeight);
    }
    // Two delicate vertical ladder cords
    ctx.fillStyle = `#d6d6d6`;
    ctx.fillRect(left + w * 0.22, top, size * 0.008, h);
    ctx.fillRect(left + w * 0.78, top, size * 0.008, h);
    // Subtle center mullion bar
    ctx.fillStyle = `#e8e8e8`;
    ctx.fillRect(left + w * 0.49, top, size * 0.02, h);
    return blurCanvas(source, size, 3.2);
  }

  if (pattern === `window`) {
    // Victorian arched study window with 3x2 mullioned glass panes
    ctx.fillStyle = `#f4f4f4`;
    ctx.fillRect(0, 0, size, size);

    const frameX = size * 0.22;
    const frameY = size * 0.18;
    const frameW = size * 0.56;
    const frameH = size * 0.64;
    const archR = frameW * 0.5;
    const archCenterX = frameX + archR;
    const archCenterY = frameY + archR * 0.44;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(frameX, frameY + frameH);
    ctx.lineTo(frameX, archCenterY);
    ctx.ellipse(
      archCenterX,
      archCenterY,
      archR,
      archR * 0.44,
      0,
      Math.PI,
      0,
      false,
    );
    ctx.lineTo(frameX + frameW, frameY + frameH);
    ctx.closePath();
    ctx.fillStyle = `#000000`;
    ctx.fill();
    ctx.restore();

    // Mullions (vertical + horizontal crossbars)
    const bar = size * 0.024;
    const thin = size * 0.014;
    ctx.fillStyle = `#f4f4f4`;
    // Vertical dividers (3 columns)
    ctx.fillRect(frameX + frameW / 3 - thin / 2, frameY, thin, frameH);
    ctx.fillRect(frameX + (frameW * 2) / 3 - thin / 2, frameY, thin, frameH);
    // Horizontal transom & mid rail
    ctx.fillRect(frameX, frameY + frameH * 0.31 - bar / 2, frameW, bar);
    ctx.fillRect(frameX, frameY + frameH * 0.65 - thin / 2, frameW, thin);

    return blurCanvas(source, size, 4.0);
  }

  if (pattern === `lamp`) {
    // Warm overhead / desk lamp pool: bright center, soft falloff into deep dark edges
    ctx.fillStyle = `#ffffff`;
    ctx.fillRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, size * 0.03, cx, cy, size * 0.27);
    grad.addColorStop(0.0, `rgba(0, 0, 0, 1)`);
    grad.addColorStop(0.32, `rgba(0, 0, 0, 0.94)`);
    grad.addColorStop(0.64, `rgba(0, 0, 0, 0.36)`);
    grad.addColorStop(0.9, `rgba(0, 0, 0, 0.04)`);
    grad.addColorStop(1.0, `rgba(0, 0, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return blurCanvas(source, size, 2.0);
  }

  // Fallback empty (no shadow)
  ctx.fillStyle = `#000000`;
  ctx.fillRect(0, 0, size, size);
  return source;
}

function writeProjector(target, { angle, x, y, z, width, height, light }) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dir = target.dir.set(light.x, Math.max(light.y, 0.1), light.z).normalize();
  const dx = dir.x / dir.y;
  const dz = dir.z / dir.y;
  target.u.set(c, -c * dx - s * dz, s);
  target.v.set(-s, s * dx - c * dz, c);
  target.origin.set(x, y, z);
  target.size.set(width, height);
}

function writeBreeze(target, time, amount) {
  const gust = 0.72 + Math.sin(time * 0.37) * 0.18 + Math.sin(time * 0.61) * 0.1;
  target.set(
    Math.sin(time * 1.13) * amount * gust * 0.006,
    Math.sin(time * 0.87 + 0.8) * amount * gust * 0.0035,
    Math.sin(time * 3.7 + 1.4) * amount * gust * 0.0015,
    Math.sin(time * 2.9 + 0.4) * amount * gust * 0.001,
  );
}

const projector = () => ({
  origin: new Vector3(),
  u: new Vector3(1, 0, 0),
  v: new Vector3(0, 0, 1),
  dir: new Vector3(0, 1, 0),
  size: new Vector2(1, 1),
});

export class Gobo {
  constructor(renderer) {
    this.renderer = renderer;
    this.block = new UniformBlock(LAYOUT);
    this.primary = projector();
    this.secondary = projector();
    this.color = new Color();
    this.pattern = `flora`;
    this.opacity = 0;
    this.opacity2 = 0;
    this.enabled = 1;
    this.enabled2 = 1;
    this.soft = 0;
    this.soft2 = 3.4;
    this.wind = new Vector4();
    this.wind2 = new Vector4();
    this.cloud = new Vector4(0.84, 0.54, -1e4, -1e4);
    this.cloudShape = new Vector4(1.35, 0, 0, 0.52);
    this.cloudsEnabled = false;
    this.cloudDepth = 0.52;
    this.cloudClock = 0;
    this.cloudPhase = 0;
    this.cloudStrength = 0;
    this.windTime = 0;
    this.span = 6.58;
    this.map = null;
    this.patternCache = new Map();
    this.layout = renderer.device.createBindGroupLayout({
      label: `gobo`,
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: {
            type: `uniform`,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: `float`,
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: `filtering`,
          },
        },
      ],
    });
    this.bindGroup = null;
    this.view = null;
  }

  async load(blur) {
    const image = await loadImageBitmap(GOBO_TEXTURE_URL, {
      flipY: false,
    });
    this.setSource(image, blur);
  }

  setSource(image, blur) {
    this.source = image;
    const texture = finalizeGoboTexture(
      renderGoboCanvas(image, { blur }),
      `Flora 11 gobo mask`,
    );
    this.patternCache.get(`flora`)?.dispose?.();
    this.patternCache.set(`flora`, texture);
    if (this.pattern === `flora`) {
      this.map = texture;
    }
  }

  getPatternTexture(pattern) {
    if (pattern === `none`) return null;
    if (this.patternCache.has(pattern)) {
      return this.patternCache.get(pattern);
    }
    if (pattern === `flora`) {
      return this.patternCache.get(`flora`) ?? null;
    }
    const canvas = renderProceduralGoboCanvas(pattern, 1024);
    const texture = finalizeGoboTexture(canvas, `Gobo ${pattern}`);
    this.patternCache.set(pattern, texture);
    return texture;
  }

  setPattern(pattern) {
    const next =
      pattern === `blinds` ||
      pattern === `window` ||
      pattern === `lamp` ||
      pattern === `none`
        ? pattern
        : `flora`;
    if (next === this.pattern && (next === `none` || this.map)) return;
    this.pattern = next;
    this.map = this.getPatternTexture(next);
  }

  setClouds(enabled, depth = 0.52) {
    const next = Boolean(enabled);
    const turnedOn = next && !this.cloudsEnabled;
    this.cloudsEnabled = next;
    this.cloudDepth = Math.max(0.15, Math.min(0.88, depth));
    if (turnedOn) {
      // Trigger a gentle opening cloud pass shortly after enabling so the effect is visible right away.
      this.cloudClock = 0.8;
    }
  }

  configure(controls, size) {
    const { gobo, camera: cam, key: light } = controls;
    this.controls = gobo;
    this.light = light;
    if (gobo.pattern) {
      this.setPattern(gobo.pattern);
    }
    const isFlora = this.pattern === `flora`;
    const isNone = this.pattern === `none`;
    const wantsMask = !isNone && Boolean(gobo.enabled);

    this.color.set(gobo.color);
    this.opacity = wantsMask ? gobo.opacity : 0;
    this.opacity2 = wantsMask && isFlora ? gobo.downOpacity : 0;
    // Keep gobo.enabled = 1 when clouds are active so the shader's cloud shade still applies.
    this.enabled = wantsMask || this.cloudsEnabled ? 1 : 0;
    this.enabled2 = wantsMask && isFlora && gobo.down ? 1 : 0;

    const baseSoft = Math.max(0, Math.min(4.5, gobo.soft ?? 0));
    this.soft = baseSoft;
    this.soft2 = Math.min(5.2, Math.max(2.2, baseSoft + 3.2));

    const view = getViewportWorldSize(size.width, size.height, cam.height, cam.fov);
    const span = Math.max(view.width, view.height);
    this.span = span;
    this.shadowScale = Math.max(0.1, gobo.shadowScale ?? 1);
    this.width = span * gobo.coverage * this.shadowScale;
    this.width2 = span * gobo.downCoverage * this.shadowScale;
    this.compositionScale = (span / 6.58) * this.shadowScale;
    this.updateProjectors(this.windTime);
  }

  updateProjectors(time) {
    const gobo = this.controls;
    if (!gobo || !this.light) {
      return;
    }

    if (this.pattern === `flora`) {
      const wind = gobo.sway;
      const shadowScale = this.shadowScale;
      const driftX = Math.sin(time * 0.7) * wind * 0.08 * shadowScale;
      const driftZ = Math.sin(time * 0.43) * wind * 0.05 * shadowScale;
      const rotation = Math.sin(time * 0.31) * wind * 0.01;
      writeBreeze(this.wind, time, wind);
      writeBreeze(this.wind2, time * 0.83 + 2.4, wind * 0.7);
      writeProjector(this.primary, {
        angle: gobo.angle + rotation,
        x: gobo.x * this.compositionScale + driftX,
        y: gobo.height * shadowScale,
        z: gobo.z * this.compositionScale + driftZ,
        width: this.width,
        height: this.width,
        light: this.light,
      });
      writeProjector(this.secondary, {
        angle: gobo.downAngle + rotation * 0.7,
        x: gobo.downX * this.compositionScale + driftX * 0.7,
        y: gobo.downHeight * shadowScale,
        z: gobo.downZ * this.compositionScale + driftZ * 0.7,
        width: this.width2,
        height: this.width2,
        light: this.light,
      });
      return;
    }

    // Architectural & lamp masks stay rigid (zero breeze wobble) and track the key light angle cleanly.
    this.wind.set(0, 0, 0, 0);
    this.wind2.set(0, 0, 0, 0);

    const span = this.span;
    const lx = this.light.x ?? 3.4;
    const ly = Math.max(this.light.y ?? 6, 1.2);
    const lz = this.light.z ?? -4.5;
    const az = Math.atan2(lx, -lz); // 0 = top (-z), +PI/2 = right (+x)

    if (this.pattern === `lamp`) {
      // Shift the lamp pool subtly toward the key light side so dragging the dome slides the pool of light.
      const shiftScale = span * 0.14;
      const ox = (lx / Math.max(ly, 2.5)) * shiftScale;
      const oz = (lz / Math.max(ly, 2.5)) * shiftScale;
      const lampSpan = span * 2.45;
      writeProjector(this.primary, {
        angle: 0,
        x: ox,
        y: 0,
        z: oz,
        width: lampSpan,
        height: lampSpan,
        light: this.light,
      });
    } else if (this.pattern === `blinds`) {
      const blindsSpan = span * 2.25;
      writeProjector(this.primary, {
        angle: az * 0.55 - 0.18,
        x: (lx / ly) * span * 0.06,
        y: 0,
        z: (lz / ly) * span * 0.06,
        width: blindsSpan,
        height: blindsSpan,
        light: this.light,
      });
    } else if (this.pattern === `window`) {
      const windowSpan = span * 2.35;
      writeProjector(this.primary, {
        angle: az * 0.42 - 0.12,
        x: (lx / ly) * span * 0.08,
        y: 0,
        z: (lz / ly) * span * 0.08,
        width: windowSpan,
        height: windowSpan,
        light: this.light,
      });
    }
  }

  frame(delta, reducedMotion) {
    const dt = Math.min(delta, 0.05);
    const gobo = this.controls;
    if (
      gobo &&
      gobo.enabled &&
      this.pattern === `flora` &&
      !reducedMotion &&
      gobo.sway > 0
    ) {
      this.windTime += dt * gobo.speed * 2.4;
      this.updateProjectors(this.windTime);
    }

    // Smooth cloud-band passing animation (uses built-in GOBO_WGSL cloud uniforms)
    const targetStrength = this.cloudsEnabled ? 1 : 0;
    this.cloudStrength +=
      (targetStrength - this.cloudStrength) * (1 - Math.exp(-3.5 * dt));

    if (this.cloudStrength > 0.002) {
      if (!reducedMotion) {
        this.cloudClock += dt;
        this.cloudPhase += dt * 0.28;
      }
      const cycle = 22.0;
      const t = (this.cloudClock % cycle) / cycle; // 0..1
      const travel = this.span * 2.8;
      const bandWidth = this.span * 0.78;
      const center = (t - 0.5) * travel;
      const lead = center + bandWidth * 0.5;
      const trail = center - bandWidth * 0.5;
      const soft = Math.max(0.85, this.span * 0.24);
      // Fade gently in/out near wrap points
      const env = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      this.cloud.set(0.84, 0.54, lead, trail);
      this.cloudShape.set(
        soft,
        this.cloudPhase,
        this.cloudStrength * Math.min(1, env * 1.4),
        this.cloudDepth,
      );
    } else {
      this.cloudShape.z = 0;
    }
  }

  hook() {
    const b = this.block;
    const p = this.primary;
    const s = this.secondary;
    b.set(`origin`, p.origin);
    b.set(`u`, p.u);
    b.set(`v`, p.v);
    b.set(`dir`, p.dir);
    b.set(`size`, p.size);
    b.set(`origin2`, s.origin);
    b.set(`u2`, s.u);
    b.set(`v2`, s.v);
    b.set(`size2`, s.size);
    b.set(`soft`, this.soft);
    b.set(`soft2`, this.soft2);
    b.set(`opacity`, this.opacity);
    b.set(`opacity2`, this.opacity2);
    b.set(`enabled`, this.enabled);
    b.set(`enabled2`, this.enabled2);
    b.set(`color`, this.color);
    b.set(`wind`, this.wind);
    b.set(`wind2`, this.wind2);
    b.set(`cloud`, this.cloud);
    b.set(`cloudShape`, this.cloudShape);
    const buffer = b.upload(this.renderer.device, `gobo`);
    const texture = this.map ?? this.renderer.defaults.black;
    const view = this.renderer.textureView(texture);
    if (!this.bindGroup || view !== this.view || buffer !== this.buffer) {
      this.bindGroup = this.renderer.device.createBindGroup({
        label: `gobo`,
        layout: this.layout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer,
            },
          },
          {
            binding: 1,
            resource: view,
          },
          {
            binding: 2,
            resource: this.renderer.sampler(texture),
          },
        ],
      });
      this.view = view;
      this.buffer = buffer;
    }
    return {
      wgsl: GOBO_WGSL,
      layout: this.layout,
      bindGroup: this.bindGroup,
    };
  }

  dispose() {
    for (const tex of this.patternCache.values()) {
      tex?.dispose?.();
    }
    this.patternCache.clear();
    this.map = null;
    this.bindGroup = null;
    this.view = null;
    this.buffer = null;
  }
}
