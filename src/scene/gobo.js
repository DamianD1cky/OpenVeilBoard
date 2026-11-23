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
function renderGoboCanvas(image, { size = 1024, blur = 1.3 } = {}) {
  const source = document.createElement(`canvas`);
  source.width = source.height = size;
  const context = source.getContext(`2d`);
  context.fillStyle = `#ffffff`;
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  context.globalCompositeOperation = `difference`;
  context.fillRect(0, 0, size, size);
  const canvas = document.createElement(`canvas`);
  canvas.width = canvas.height = size;
  const soft = canvas.getContext(`2d`);
  soft.fillStyle = `#000000`;
  soft.fillRect(0, 0, size, size);
  const radius = Math.max(0, Math.min(12, blur));
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
    this.opacity = 0;
    this.opacity2 = 0;
    this.enabled = 1;
    this.enabled2 = 1;
    this.soft = 0;
    this.soft2 = 3.4;
    this.wind = new Vector4();
    this.wind2 = new Vector4();
    this.cloud = new Vector4(1, 0, -1e4, -1e4);
    this.cloudShape = new Vector4(1, 0, 0, 0);
    this.windTime = 0;
    this.map = null;
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
    const texture = new CanvasTexture(
      renderGoboCanvas(image, {
        blur,
      }),
    );
    texture.name = `Flora 11 gobo mask`;
    texture.wrapS = `clamp-to-edge`;
    texture.wrapT = `clamp-to-edge`;
    texture.generateMipmaps = true;
    texture.minFilter = `linear-mipmap-linear`;
    texture.magFilter = `linear`;
    texture.colorSpace = ``;
    texture.flipY = false;
    texture.needsUpdate = true;
    this.map?.dispose();
    this.map = texture;
  }
  configure(controls, size) {
    const { gobo, camera: cam, key: light } = controls;
    this.controls = gobo;
    this.light = light;
    this.color.set(gobo.color);
    this.opacity = gobo.opacity;
    this.opacity2 = gobo.downOpacity;
    this.enabled = gobo.enabled ? 1 : 0;
    this.enabled2 = gobo.enabled && gobo.down ? 1 : 0;
    const view = getViewportWorldSize(size.width, size.height, cam.height, cam.fov);
    const span = Math.max(view.width, view.height);
    this.shadowScale = Math.max(0.1, gobo.shadowScale ?? 1);
    this.width = span * gobo.coverage * this.shadowScale;
    this.width2 = span * gobo.downCoverage * this.shadowScale;
    this.compositionScale = (span / 6.58) * this.shadowScale;
    this.updateProjectors(this.windTime);
  }
  updateProjectors(time) {
    const gobo = this.controls;
    if (!gobo) {
      return;
    }
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
  }
  frame(delta, reducedMotion) {
    const gobo = this.controls;
    if (gobo && gobo.enabled && !reducedMotion && gobo.sway > 0) {
      this.windTime += Math.min(delta, 0.05) * gobo.speed * 2.4;
      this.updateProjectors(this.windTime);
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
    this.map?.dispose?.();
    this.map = null;
    this.bindGroup = null;
    this.view = null;
    this.buffer = null;
  }
}
