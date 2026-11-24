import { Color, Matrix3, Matrix4, Sphere, Vector3, Vector4 } from "./math.js";
import { BackSide, DoubleSide, FrontSide } from "./core.js";
import { AdditiveBlending, CustomBlending, NoBlending, NormalBlending } from "./material.js";
import { UniformBlock, UniformLayout } from "./uniforms.js";
import { buildMeshShader, FRAME_FIELDS, FULLSCREEN_VERTEX } from "./wgsl.js";
import { DFG_LUT, DFG_LUT_SIZE } from "./dfg-lut.js";
import { DataTexture, RenderTargetTexture } from "./texture.js";
const FRAME_LAYOUT = new UniformLayout(`Frame`, FRAME_FIELDS);
class Frustum {
  constructor() {
    this.planes = Array.from(
      {
        length: 6,
      },
      () => new Vector4(),
    );
  }
  setFromProjectionMatrix(m) {
    const me = m.elements;
    const me0 = me[0],
      me1 = me[1],
      me2 = me[2],
      me3 = me[3];
    const me4 = me[4],
      me5 = me[5],
      me6 = me[6],
      me7 = me[7];
    const me8 = me[8],
      me9 = me[9],
      me10 = me[10],
      me11 = me[11];
    const me12 = me[12],
      me13 = me[13],
      me14 = me[14],
      me15 = me[15];
    const set = (p, x, y, z, w) => {
      const length = Math.hypot(x, y, z);
      p.set(x / length, y / length, z / length, w / length);
    };
    set(this.planes[0], me3 - me0, me7 - me4, me11 - me8, me15 - me12);
    set(this.planes[1], me3 + me0, me7 + me4, me11 + me8, me15 + me12);
    set(this.planes[2], me3 + me1, me7 + me5, me11 + me9, me15 + me13);
    set(this.planes[3], me3 - me1, me7 - me5, me11 - me9, me15 - me13);
    set(this.planes[4], me3 - me2, me7 - me6, me11 - me10, me15 - me14);
    set(this.planes[5], me2, me6, me10, me14);
    return this;
  }
  intersectsSphere(sphere) {
    const { center, radius } = sphere;
    for (const p of this.planes) {
      if (p.x * center.x + p.y * center.y + p.z * center.z + p.w < -radius) {
        return false;
      }
    }
    return true;
  }
}
const _projScreen = new Matrix4();
const _frustum = new Frustum();
const _sphere = new Sphere();
const _v4 = new Vector4();
const _v3 = new Vector3();
const _v3b = new Vector3();
const _normalMatrix = new Matrix3();
const _identity = new Matrix4();
const _color = new Color();
function painterSortStable(a, b) {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  }
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  }
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  return a.id - b.id;
}
function reversePainterSortStable(a, b) {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  }
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  }
  if (a.z !== b.z) {
    return b.z - a.z;
  }
  return a.id - b.id;
}
const BLEND = {
  normal: {
    color: {
      srcFactor: `src-alpha`,
      dstFactor: `one-minus-src-alpha`,
      operation: `add`,
    },
    alpha: {
      srcFactor: `one`,
      dstFactor: `one-minus-src-alpha`,
      operation: `add`,
    },
  },
  normalPremultiplied: {
    color: {
      srcFactor: `one`,
      dstFactor: `one-minus-src-alpha`,
      operation: `add`,
    },
    alpha: {
      srcFactor: `one`,
      dstFactor: `one-minus-src-alpha`,
      operation: `add`,
    },
  },
  additive: {
    color: {
      srcFactor: `src-alpha`,
      dstFactor: `one`,
      operation: `add`,
    },
    alpha: {
      srcFactor: `one`,
      dstFactor: `one`,
      operation: `add`,
    },
  },
  additivePremultiplied: {
    color: {
      srcFactor: `one`,
      dstFactor: `one`,
      operation: `add`,
    },
    alpha: {
      srcFactor: `one`,
      dstFactor: `one`,
      operation: `add`,
    },
  },
};
export const NORMAL_BLEND = BLEND.normal;
function materialBlend(material) {
  const blending = material.blending;
  if (blending === NoBlending) {
    return undefined;
  }
  if (blending === NormalBlending && !material.transparent) {
    return undefined;
  }
  if (blending === CustomBlending) {
    return material.blend ?? undefined;
  }
  if (blending === AdditiveBlending) {
    return material.premultipliedAlpha ? BLEND.additivePremultiplied : BLEND.additive;
  }
  return material.premultipliedAlpha ? BLEND.normalPremultiplied : BLEND.normal;
}
const MATERIAL_TEXTURE_SLOTS = [
  [`map`, `map`],
  [`alphaMap`, `alphaMap`],
  [`normalMap`, `normalMap`],
  [`bumpMap`, `bumpMap`],
  [`roughnessMap`, `roughnessMap`],
  [`metalnessMap`, `metalnessMap`],
  [`aoMap`, `aoMap_m`],
  [`emissiveMap`, `emissiveMap`],
];
const VERTEX_FORMATS = {
  Float32Array: [`float32`, `float32x2`, `float32x3`, `float32x4`],
  Uint16Array: [null, null, null, `uint16x4`],
  Uint32Array: [`uint32`, null, null, `uint32x4`],
  Uint8Array: [null, null, null, `uint8x4`],
};
export class RenderTarget {
  constructor(
    width,
    height,
    {
      colors = [
        {
          format: `rgba16float`,
        },
      ],
      depth = `depth24plus`,
      samples = 1,
      label = ``,
    } = {},
  ) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.colors = colors.map((c) => ({
      format: c.format,
      name: c.name ?? ``,
    }));
    this.depthFormat = depth;
    this.samples = samples;
    this.label = label;
    this.textures = this.colors.map((_, i) => new RenderTargetTexture(this, i));
    this.depthTexture = depth ? new RenderTargetTexture(this, -1) : null;
    this.version = 0;
    this.gpu = null;
  }
  get texture() {
    return this.textures[0];
  }
  setSize(width, height) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.version++;
  }
  dispose() {
    if (!this.gpu) {
      return;
    }
    for (const t of this.gpu.colors) {
      t.destroy();
    }
    for (const t of this.gpu.msaa) {
      t?.destroy();
    }
    this.gpu.depth?.destroy();
    this.gpu = null;
  }
}
export class Renderer {
  static async create(canvas, options = {}) {
    if (!navigator.gpu) {
      throw new Error(`WebGPU is not available`);
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: `high-performance`,
    });
    if (!adapter) {
      throw new Error(`No WebGPU adapter`);
    }
    const features = [];
    for (const feature of [`float32-filterable`, `rg11b10ufloat-renderable`, `timestamp-query`]) {
      if (adapter.features.has(feature)) {
        features.push(feature);
      }
    }
    const device = await adapter.requestDevice({
      requiredFeatures: features,
    });
    return new Renderer(canvas, device, adapter, options);
  }
  constructor(canvas, device, adapter, options) {
    this.canvas = canvas;
    this.device = device;
    this.adapter = adapter;
    this.context = canvas.getContext(`webgpu`);
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      alphaMode: options.alphaMode ?? `premultiplied`,
    });
    this.pixelRatio = 1;
    this.width = canvas.clientWidth || 1;
    this.height = canvas.clientHeight || 1;
    this.time = 0;
    this.exposure = 1;
    this.info = {
      drawCalls: 0,
      triangles: 0,
      frame: 0,
      pipelines: 0,
    };
    this.objectData = null;
    this.lost = false;
    this.geometries = new WeakMap();
    this.textures = new WeakMap();
    this.samplers = new Map();
    this.modules = new Map();
    this.pipelines = new Map();
    this.pendingPipelines = new Map();
    this.materialData = new WeakMap();
    this.objectBlocks = new WeakMap();
    this.targets = new WeakMap();
    this.shadowMaps = new WeakMap();
    this.passCache = new Map();
    this.frameBlocks = [];
    this.frameBlockIndex = 0;
    this.encoder = null;
    this.frameBindGroupCache = new Map();
    this.layouts = this.createLayouts();
    this.defaults = this.createDefaults();
    device.lost.then((info) => {
      this.lost = true;
      console.error(`WebGPU device lost:`, info.message);
    });
  }
  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    this.setSize(this.width, this.height);
  }
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.floor(width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * this.pixelRatio));
  }
  getDrawingBufferSize(
    target = {
      x: 0,
      y: 0,
    },
  ) {
    target.x = this.canvas.width;
    target.y = this.canvas.height;
    return target;
  }
  createLayouts() {
    const { device } = this;
    const fs = GPUShaderStage.FRAGMENT;
    const vf = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const frame = device.createBindGroupLayout({
      label: `frame`,
      entries: [
        {
          binding: 0,
          visibility: vf,
          buffer: {
            type: `uniform`,
          },
        },
        {
          binding: 1,
          visibility: fs,
          texture: {
            sampleType: `depth`,
          },
        },
        {
          binding: 2,
          visibility: fs,
          sampler: {
            type: `comparison`,
          },
        },
        {
          binding: 3,
          visibility: fs,
          texture: {
            sampleType: `float`,
          },
        },
        {
          binding: 4,
          visibility: fs,
          sampler: {
            type: `filtering`,
          },
        },
        {
          binding: 5,
          visibility: fs,
          texture: {
            sampleType: `float`,
          },
        },
        {
          binding: 6,
          visibility: fs,
          sampler: {
            type: `filtering`,
          },
        },
        {
          binding: 7,
          visibility: fs,
          texture: {
            sampleType: `float`,
          },
        },
        {
          binding: 8,
          visibility: fs,
          sampler: {
            type: `filtering`,
          },
        },
      ],
    });
    const objectPlain = device.createBindGroupLayout({
      label: `object`,
      entries: [
        {
          binding: 0,
          visibility: vf,
          buffer: {
            type: `uniform`,
          },
        },
      ],
    });
    const objectSkinned = device.createBindGroupLayout({
      label: `object-skinned`,
      entries: [
        {
          binding: 0,
          visibility: vf,
          buffer: {
            type: `uniform`,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: `read-only-storage`,
          },
        },
      ],
    });
    return {
      frame,
      objectPlain,
      objectSkinned,
      material: new Map(),
      pipeline: new Map(),
    };
  }
  createDefaults() {
    const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const black = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    const dfg = new DataTexture(DFG_LUT, DFG_LUT_SIZE, DFG_LUT_SIZE, `rg16float`);
    dfg.magFilter = `linear`;
    dfg.minFilter = `linear`;
    const shadow = this.device.createTexture({
      label: `default shadow`,
      size: [1, 1],
      format: `depth24plus`,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const comparison = this.device.createSampler({
      compare: `less`,
      magFilter: `linear`,
      minFilter: `linear`,
    });
    return {
      white,
      black,
      dfg,
      shadow,
      shadowView: shadow.createView(),
      comparison,
    };
  }
  materialLayout(textures) {
    const key = textures.map((t) => t.kind).join(`,`);
    let layout = this.layouts.material.get(key);
    if (layout) {
      return layout;
    }
    const vf = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const entries = [
      {
        binding: 0,
        visibility: vf,
        buffer: {
          type: `uniform`,
        },
      },
    ];
    textures.forEach(({ kind }, i) => {
      const sampleType =
        kind === `uint` ? `uint` : kind === `unfilterable` ? `unfilterable-float` : `float`;
      entries.push({
        binding: 1 + i * 2,
        visibility: vf,
        texture: {
          sampleType,
        },
      });
      entries.push({
        binding: 2 + i * 2,
        visibility: vf,
        sampler: {
          type: kind === `float` ? `filtering` : `non-filtering`,
        },
      });
    });
    layout = this.device.createBindGroupLayout({
      label: `material:${key}`,
      entries,
    });
    this.layouts.material.set(key, layout);
    return layout;
  }
  module(code, label) {
    let module = this.modules.get(code);
    if (!module) {
      module = this.device.createShaderModule({
        label,
        code,
      });
      if (this.debugShaders) {
        module.getCompilationInfo().then((info) => {
          for (const message of info.messages) {
            if (message.type === `error`) {
              console.error(`${label}:${message.lineNum}:${message.linePos} ${message.message}`);
            }
          }
        });
      }
      this.modules.set(code, module);
    }
    return module;
  }
  textureFormat(texture) {
    if (texture.format) {
      return texture.format;
    }
    return texture.colorSpace === `srgb` ? `rgba8unorm-srgb` : `rgba8unorm`;
  }
  textureKind(texture) {
    const format = texture.isRenderTargetTexture
      ? this.targetFormat(texture)
      : this.textureFormat(texture);
    if (/uint|sint/.test(format)) {
      return `uint`;
    }
    if (/32float/.test(format) && !this.device.features.has(`float32-filterable`)) {
      return `unfilterable`;
    }
    if (/^depth/.test(format)) {
      return `unfilterable`;
    }
    return `float`;
  }
  targetFormat(texture) {
    return texture.index < 0
      ? texture.target.depthFormat
      : texture.target.colors[texture.index].format;
  }
  sampler(texture, kind = `float`) {
    const linear = kind === `float`;
    const min = texture.minFilter;
    const mipmap = min.includes(`mipmap`);
    const minFilter = min.startsWith(`linear`) && linear ? `linear` : `nearest`;
    const magFilter = texture.magFilter === `linear` && linear ? `linear` : `nearest`;
    const mipmapFilter = mipmap && min.endsWith(`linear`) && linear ? `linear` : `nearest`;
    const anisotropy =
      minFilter === `linear` && magFilter === `linear` && mipmapFilter === `linear` && mipmap
        ? Math.min(16, Math.max(1, Math.floor(texture.anisotropy)))
        : 1;
    const key = `${texture.wrapS}|${texture.wrapT}|${magFilter}|${minFilter}|${mipmapFilter}|${anisotropy}`;
    let sampler = this.samplers.get(key);
    if (!sampler) {
      sampler = this.device.createSampler({
        addressModeU: texture.wrapS,
        addressModeV: texture.wrapT,
        magFilter,
        minFilter,
        mipmapFilter,
        maxAnisotropy: anisotropy,
      });
      this.samplers.set(key, sampler);
    }
    return sampler;
  }
  textureView(texture) {
    if (texture.isRenderTargetTexture) {
      const gpu = this.ensureTarget(texture.target);
      return texture.index < 0 ? gpu.depthView : gpu.colorViews[texture.index];
    }
    if (texture.isGPUTexture) {
      return texture.view;
    }
    if (texture.isVideoTexture) {
      texture.update();
    }
    let entry = this.textures.get(texture);
    const image = texture.image;
    const width = image?.videoWidth || image?.displayWidth || image?.width || 0;
    const height = image?.videoHeight || image?.displayHeight || image?.height || 0;
    if (!image || !width || !height) {
      return this.textureView(this.defaults.black);
    }
    const format = this.textureFormat(texture);
    const mipLevelCount =
      texture.generateMipmaps && texture.minFilter.includes(`mipmap`)
        ? Math.floor(Math.log2(Math.max(width, height))) + 1
        : 1;
    if (
      !entry ||
      entry.width !== width ||
      entry.height !== height ||
      entry.format !== format ||
      entry.mips !== mipLevelCount
    ) {
      entry?.gpu.destroy();
      const gpu = this.device.createTexture({
        label: texture.name || `texture`,
        size: [width, height],
        format,
        mipLevelCount,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      entry = {
        gpu,
        view: gpu.createView(),
        width,
        height,
        format,
        mips: mipLevelCount,
        version: -1,
      };
      this.textures.set(texture, entry);
      texture.addEventListener?.(`dispose`, () => {
        const current = this.textures.get(texture);
        if (current) {
          current.gpu.destroy();
          this.textures.delete(texture);
        }
      });
    }
    const frameless = texture.isVideoTexture && image.readyState < 2;
    if (entry.version !== texture.version && !frameless) {
      entry.version = texture.version;
      this.upload(texture, entry);
    }
    return entry.view;
  }
  upload(texture, entry) {
    const image = texture.image;
    if (image.data) {
      const bytes = bytesPerTexel(entry.format);
      const data = image.data;
      this.device.queue.writeTexture(
        {
          texture: entry.gpu,
        },
        data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data,
        {
          bytesPerRow: entry.width * bytes,
          rowsPerImage: entry.height,
        },
        [entry.width, entry.height],
      );
    } else {
      try {
        this.device.queue.copyExternalImageToTexture(
          {
            source: image,
            flipY: texture.flipY,
          },
          {
            texture: entry.gpu,
            premultipliedAlpha: texture.premultiplyAlpha,
          },
          [entry.width, entry.height],
        );
      } catch (error) {
        if (!texture.isVideoTexture) {
          console.warn(`Texture upload failed`, error);
        }
        return;
      }
    }
    if (entry.mips > 1) {
      this.generateMipmaps(entry);
    }
  }
  generateMipmaps(entry) {
    const { device } = this;
    const format = entry.format;
    let pipeline = this.passCache.get(`mip:${format}`);
    if (!pipeline) {
      const module = this.module(
        `${FULLSCREEN_VERTEX}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@fragment fn fs(in: FullscreenOut) -> @location(0) vec4f { return textureSample(src, srcSampler, in.uv); }`,
        `mipmap`,
      );
      pipeline = device.createRenderPipeline({
        label: `mipmap ${format}`,
        layout: `auto`,
        vertex: {
          module,
          entryPoint: `vs`,
        },
        fragment: {
          module,
          entryPoint: `fs`,
          targets: [
            {
              format,
            },
          ],
        },
        primitive: {
          topology: `triangle-list`,
        },
      });
      this.passCache.set(`mip:${format}`, pipeline);
    }
    const sampler =
      this.samplers.get(`mip`) ??
      device.createSampler({
        minFilter: `linear`,
        magFilter: `linear`,
      });
    this.samplers.set(`mip`, sampler);
    const encoder = device.createCommandEncoder({
      label: `mipmaps`,
    });
    for (let level = 1; level < entry.mips; level++) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: entry.gpu.createView({
              baseMipLevel: level - 1,
              mipLevelCount: 1,
            }),
          },
          {
            binding: 1,
            resource: sampler,
          },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: entry.gpu.createView({
              baseMipLevel: level,
              mipLevelCount: 1,
            }),
            loadOp: `clear`,
            storeOp: `store`,
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }
  initTexture(texture) {
    this.textureView(texture);
  }
  ensureTarget(target) {
    let gpu = target.gpu;
    if (gpu && gpu.version === target.version) {
      return gpu;
    }
    target.dispose();
    const { device } = this;
    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST;
    const size = [target.width, target.height];
    const colors = target.colors.map((c, i) =>
      device.createTexture({
        label: `${target.label}:${c.name || i}`,
        size,
        format: c.format,
        usage,
      }),
    );
    const msaa =
      target.samples > 1
        ? target.colors.map((c, i) =>
            device.createTexture({
              label: `${target.label}:${c.name || i}-msaa`,
              size,
              format: c.format,
              sampleCount: target.samples,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            }),
          )
        : target.colors.map(() => null);
    const depth = target.depthFormat
      ? device.createTexture({
          label: `${target.label}:depth`,
          size,
          format: target.depthFormat,
          sampleCount: target.samples,
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            (target.samples > 1 ? 0 : GPUTextureUsage.TEXTURE_BINDING),
        })
      : null;
    gpu = {
      version: target.version,
      colors,
      msaa,
      depth,
      colorViews: colors.map((t) => t.createView()),
      msaaViews: msaa.map((t) => t?.createView() ?? null),
      depthView: depth?.createView() ?? null,
    };
    target.gpu = gpu;
    return gpu;
  }
  geometryBuffers(geometry) {
    let entry = this.geometries.get(geometry);
    if (!entry) {
      entry = {
        attributes: new Map(),
        index: null,
      };
      this.geometries.set(geometry, entry);
      geometry.addEventListener?.(`dispose`, () => {
        const current = this.geometries.get(geometry);
        if (!current) {
          return;
        }
        for (const a of current.attributes.values()) {
          a.buffer.destroy();
        }
        current.index?.buffer.destroy();
        this.geometries.delete(geometry);
      });
    }
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      let buffer = entry.attributes.get(name);
      const array = attribute.array;
      if (!buffer || buffer.size < array.byteLength) {
        buffer?.buffer.destroy();
        buffer = {
          buffer: this.device.createBuffer({
            label: name,
            size: align4(array.byteLength),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          }),
          size: array.byteLength,
          version: -1,
          attribute,
        };
        entry.attributes.set(name, buffer);
      }
      if (buffer.version !== attribute.version || buffer.attribute !== attribute) {
        writeBuffer(this.device, buffer.buffer, array);
        buffer.version = attribute.version;
        buffer.attribute = attribute;
      }
    }
    if (geometry.index) {
      const array = geometry.index.array;
      if (!entry.index || entry.index.size < array.byteLength) {
        entry.index?.buffer.destroy();
        entry.index = {
          buffer: this.device.createBuffer({
            label: `index`,
            size: align4(array.byteLength),
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
          }),
          size: array.byteLength,
          version: -1,
        };
      }
      if (
        entry.index.version !== geometry.index.version ||
        entry.index.attribute !== geometry.index
      ) {
        writeBuffer(this.device, entry.index.buffer, array);
        entry.index.version = geometry.index.version;
        entry.index.attribute = geometry.index;
      }
    }
    return entry;
  }
  vertexLayout(geometry, material) {
    const hooks = material.hooks ?? {};
    const names = [
      `position`,
      `normal`,
      `uv`,
      `tangent`,
      `skinIndex`,
      `skinWeight`,
      ...Object.keys(hooks.attributes ?? {}),
    ];
    const attributes = [];
    let location = 0;
    for (const name of names) {
      const attribute = geometry.attributes[name];
      if (!attribute) {
        continue;
      }
      if (name === `tangent` && !material.normalMap) {
        continue;
      }
      const formats = VERTEX_FORMATS[attribute.array.constructor.name];
      let format = formats?.[attribute.itemSize - 1];
      if (name === `skinIndex` && attribute.array instanceof Float32Array) {
        format = `float32x4`;
      }
      if (!format) {
        throw new Error(`Unsupported vertex attribute ${name}`);
      }
      attributes.push({
        name,
        format,
        location: location++,
        instanced: Boolean(attribute.isInstancedBufferAttribute),
      });
    }
    return attributes;
  }
  materialTextures(material) {
    const list = [];
    for (const [prop, name] of MATERIAL_TEXTURE_SLOTS) {
      if (material[prop]) {
        list.push({
          name,
          texture: material[prop],
          prop,
        });
      }
    }
    if (material.envMap?.texture) {
      list.push({
        name: `envMapM`,
        texture: material.envMap.texture,
        hook: true,
      });
    }
    for (const [name, value] of Object.entries(material.hooks?.textures ?? {})) {
      const texture = value?.isTexture || value?.isGPUTexture ? value : value?.texture;
      const kind = value?.kind;
      list.push({
        name,
        texture,
        kindOverride: kind,
        hook: true,
      });
    }
    return list.map((t) => ({
      ...t,
      kind: t.kindOverride ?? (t.texture ? this.textureKind(t.texture) : `float`),
    }));
  }
  materialLayoutFields(material, textures) {
    const fields = [
      [`color`, `vec3f`],
      [`opacity`, `f32`],
      [`alphaTest`, `f32`],
    ];
    if (material.isMeshStandardMaterial) {
      fields.push(
        [`emissive`, `vec3f`],
        [`roughness`, `f32`],
        [`metalness`, `f32`],
        [`envMapIntensity`, `f32`],
        [`normalScale`, `vec2f`],
        [`bumpScale`, `f32`],
        [`aoMapIntensity`, `f32`],
      );
      if (material.isMeshPhysicalMaterial) {
        fields.push([`specularColor`, `vec3f`], [`specularIntensity`, `f32`], [`ior`, `f32`]);
        if (material.anisotropy > 0) {
          fields.push([`anisotropyVector`, `vec2f`]);
        }
        if (material.clearcoat > 0) {
          fields.push([`clearcoat`, `f32`], [`clearcoatRoughness`, `f32`]);
        }
      }
      if (material.envMap?.texture) {
        fields.push([`envRotationM`, `mat4x4f`], [`envTexelM`, `vec2f`], [`envMaxMipM`, `f32`]);
      }
    }
    const uvTransforms = [];
    for (const t of textures) {
      if (t.hook) {
        continue;
      }
      if (t.texture && !isIdentityTransform(t.texture)) {
        fields.push([`${t.name}Transform`, `mat3x3f`]);
        uvTransforms.push(t.name);
      }
    }
    for (const [name, value] of Object.entries(material.hooks?.uniforms ?? {})) {
      fields.push([name, value.type]);
    }
    return {
      fields,
      uvTransforms,
    };
  }
  materialState(material, object) {
    const textures = this.materialTextures(material);
    const { fields, uvTransforms } = this.materialLayoutFields(material, textures);
    const signature = `${fields.map((f) => f.join(`:`)).join(`,`)}|${textures.map((t) => `${t.name}:${t.kind}`).join(`,`)}`;
    const perObject = Object.values(material.hooks?.uniforms ?? {}).some((u) => u.update);
    let store = this.materialData.get(material);
    if (!store) {
      store = new Map();
      this.materialData.set(material, store);
      material.addEventListener?.(`dispose`, () => {
        const current = this.materialData.get(material);
        if (!current) {
          return;
        }
        for (const state of current.values()) {
          state.block.destroy();
        }
        this.materialData.delete(material);
      });
    }
    const key = perObject ? object.id : `shared`;
    let state = store.get(key);
    if (!state || state.signature !== signature) {
      state?.block.destroy();
      const layout = new UniformLayout(`MaterialUniforms`, fields);
      state = {
        signature,
        layout,
        block: new UniformBlock(layout),
        textures,
        uvTransforms,
        bindGroup: null,
        views: [],
        frame: -1,
      };
      store.set(key, state);
    } else {
      state.textures = textures;
    }
    if (state.frame !== this.info.frame || perObject) {
      state.frame = this.info.frame;
      this.writeMaterial(material, state, object);
    }
    return state;
  }
  writeMaterial(material, state, object) {
    const block = state.block;
    block.set(`color`, material.color ?? _color.setRGB(1, 1, 1));
    block.set(`opacity`, material.opacity);
    block.set(`alphaTest`, material.alphaTest);
    if (material.isMeshStandardMaterial) {
      block.set(
        `emissive`,
        _color.copy(material.emissive).multiplyScalar(material.emissiveIntensity),
      );
      block.set(`roughness`, material.roughness);
      block.set(`metalness`, material.metalness);
      block.set(`envMapIntensity`, material.envMapIntensity);
      block.set(`normalScale`, material.normalScale);
      block.set(`bumpScale`, material.bumpScale);
      block.set(`aoMapIntensity`, material.aoMapIntensity);
      if (material.isMeshPhysicalMaterial) {
        block.set(`specularColor`, material.specularColor);
        block.set(`specularIntensity`, material.specularIntensity);
        block.set(`ior`, material.ior);
        if (material.clearcoat > 0) {
          block.set(`clearcoat`, material.clearcoat);
          block.set(`clearcoatRoughness`, material.clearcoatRoughness);
        }
        if (material.anisotropy > 0) {
          block.set(`anisotropyVector`, [
            Math.cos(material.anisotropyRotation) * material.anisotropy,
            Math.sin(material.anisotropyRotation) * material.anisotropy,
          ]);
        }
      }
      const env = material.envMap;
      if (env?.texture) {
        block.set(`envRotationM`, env.rotation ?? _identity);
        block.set(`envTexelM`, [env.texelWidth, env.texelHeight]);
        block.set(`envMaxMipM`, env.maxMip);
      }
    }
    for (const name of state.uvTransforms) {
      const texture = state.textures.find((t) => t.name === name)?.texture;
      if (!texture) {
        continue;
      }
      if (texture.matrixAutoUpdate) {
        texture.updateMatrix();
      }
      block.set(`${name}Transform`, texture.matrix);
    }
    for (const [name, u] of Object.entries(material.hooks?.uniforms ?? {})) {
      if (u.update) {
        u.value = u.update(object) ?? u.value;
      }
      block.set(name, u.value);
    }
    block.upload(this.device, `material`);
    const views = state.textures.map((t) =>
      t.texture ? this.textureView(t.texture) : this.textureView(this.defaults.white),
    );
    const changed =
      !state.bindGroup ||
      views.some((v, i) => v !== state.views[i]) ||
      state.buffer !== block.buffer;
    if (changed) {
      const layout = this.materialLayout(state.textures);
      const entries = [
        {
          binding: 0,
          resource: {
            buffer: block.buffer,
          },
        },
      ];
      state.textures.forEach((t, i) => {
        entries.push({
          binding: 1 + i * 2,
          resource: views[i],
        });
        entries.push({
          binding: 2 + i * 2,
          resource: this.sampler(t.texture ?? this.defaults.white, t.kind),
        });
      });
      state.bindGroup = this.device.createBindGroup({
        label: `material`,
        layout,
        entries,
      });
      state.views = views;
      state.buffer = block.buffer;
    }
  }
  objectState(object) {
    let state = this.objectBlocks.get(object);
    const skinned = Boolean(object.isSkinnedMesh && object.skeleton);
    if (!state) {
      const buffer = this.device.createBuffer({
        label: `object ${object.name || object.id}`,
        size: OBJECT_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      state = {
        buffer,
        data: new Float32Array(OBJECT_SIZE / 4),
        frame: -1,
        bindGroup: null,
        bones: null,
      };
      this.objectBlocks.set(object, state);
    }
    if (state.frame !== this.info.frame) {
      state.frame = this.info.frame;
      const d = state.data;
      d.set(object.matrixWorld.elements, 0);
      _normalMatrix.getNormalMatrix(object.matrixWorld);
      const n = _normalMatrix.elements;
      d[16] = n[0];
      d[17] = n[1];
      d[18] = n[2];
      d[20] = n[3];
      d[21] = n[4];
      d[22] = n[5];
      d[24] = n[6];
      d[25] = n[7];
      d[26] = n[8];
      d.set((skinned ? object.bindMatrix : _identity).elements, 28);
      d.set((skinned ? object.bindMatrixInverse : _identity).elements, 44);
      const custom = this.objectData?.(object);
      if (custom) {
        for (let i = 0; i < 8; i++) {
          d[60 + i] = custom[i] ?? 0;
        }
      } else {
        d.fill(0, 60, 68);
      }
      this.device.queue.writeBuffer(state.buffer, 0, d);
      if (skinned) {
        const skeleton = object.skeleton;
        skeleton.update();
        const bytes = skeleton.boneMatrices.byteLength;
        if (!state.bones || state.bones.size < bytes) {
          state.bones?.destroy();
          state.bones = this.device.createBuffer({
            label: `bones`,
            size: bytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          });
          state.bindGroup = null;
        }
        this.device.queue.writeBuffer(state.bones, 0, skeleton.boneMatrices);
      }
    }
    if (!state.bindGroup) {
      state.bindGroup = this.device.createBindGroup({
        label: `object`,
        layout: skinned ? this.layouts.objectSkinned : this.layouts.objectPlain,
        entries: skinned
          ? [
              {
                binding: 0,
                resource: {
                  buffer: state.buffer,
                },
              },
              {
                binding: 1,
                resource: {
                  buffer: state.bones,
                },
              },
            ]
          : [
              {
                binding: 0,
                resource: {
                  buffer: state.buffer,
                },
              },
            ],
      });
    }
    return state;
  }
  frameState(scene, camera, lights, width, height, pass) {
    let entry = this.frameBlocks[this.frameBlockIndex++];
    if (!entry) {
      entry = {
        block: new UniformBlock(FRAME_LAYOUT),
        bindGroup: null,
        resources: [],
      };
      this.frameBlocks.push(entry);
    }
    const block = entry.block;
    block.set(`projection`, camera.projectionMatrix);
    block.set(`view`, camera.matrixWorldInverse);
    block.set(`cameraWorld`, camera.matrixWorld);
    block.set(`projectionInverse`, camera.projectionMatrixInverse);
    block.set(`cameraPosition`, _v3.setFromMatrixPosition(camera.matrixWorld));
    block.set(`time`, this.time);
    block.set(`resolution`, [width, height]);
    block.set(`near`, camera.near);
    block.set(`far`, camera.far);
    block.set(`exposure`, this.exposure);
    block.set(`ambient`, lights.ambient);
    block.set(`dirCount`, lights.directional.length);
    for (let i = 0; i < 3; i++) {
      const light = lights.directional[i];
      if (!light) {
        block.set(`dirColor${i}`, [0, 0, 0, 0]);
        continue;
      }
      light.updateWorldMatrix(true, false);
      light.target.updateWorldMatrix(true, false);
      _v3
        .setFromMatrixPosition(light.matrixWorld)
        .sub(_v3b.setFromMatrixPosition(light.target.matrixWorld));
      block.set(`dirDirection${i}`, [_v3.x, _v3.y, _v3.z, 0]);
      block.set(`dirColor${i}`, [
        light.color.r * light.intensity,
        light.color.g * light.intensity,
        light.color.b * light.intensity,
        0,
      ]);
    }
    const point = lights.point[0];
    block.set(`pointCount`, lights.point.length);
    if (point) {
      _v3.setFromMatrixPosition(point.matrixWorld);
      block.set(`pointPosition0`, [_v3.x, _v3.y, _v3.z, point.distance ?? 0]);
      block.set(`pointColor0`, [
        point.color.r * point.intensity,
        point.color.g * point.intensity,
        point.color.b * point.intensity,
        point.decay ?? 2,
      ]);
    }
    const env = scene.environment;
    block.set(`envEnabled`, env ? 1 : 0);
    block.set(`envIntensity`, scene.environmentIntensity ?? 1);
    if (env) {
      block.set(`envMaxMip`, env.maxMip);
      block.set(`envTexel`, [env.texelWidth, env.texelHeight]);
      block.set(`envRotation`, env.rotation ?? _identity);
    }
    const shadowLight = lights.shadowLight;
    block.set(`shadowEnabled`, shadowLight ? 1 : 0);
    if (shadowLight) {
      const shadow = shadowLight.shadow;
      block.set(`shadowMatrix`, shadow.matrix);
      block.set(`shadowMapSize`, [shadow.mapSize.x, shadow.mapSize.y]);
      block.set(`shadowBias`, shadow.bias);
      block.set(`shadowNormalBias`, shadow.normalBias);
      block.set(`shadowIntensity`, shadow.intensity);
    }
    block.set(`aoEnabled`, pass?.ao ? 1 : 0);
    block.upload(this.device, `frame`);
    const shadowView = shadowLight
      ? (this.shadowMaps.get(shadowLight)?.view ?? this.defaults.shadowView)
      : this.defaults.shadowView;
    const envView = env ? this.textureView(env.texture) : this.textureView(this.defaults.black);
    const dfgView = this.textureView(this.defaults.dfg);
    const aoView = pass?.ao ? this.textureView(pass.ao) : this.textureView(this.defaults.white);
    const resources = [block.buffer, shadowView, envView, dfgView, aoView];
    if (!entry.bindGroup || resources.some((r, i) => r !== entry.resources[i])) {
      const linear = this.sampler({
        wrapS: `clamp-to-edge`,
        wrapT: `clamp-to-edge`,
        magFilter: `linear`,
        minFilter: `linear`,
        anisotropy: 1,
      });
      entry.bindGroup = this.device.createBindGroup({
        label: `frame`,
        layout: this.layouts.frame,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: block.buffer,
            },
          },
          {
            binding: 1,
            resource: shadowView,
          },
          {
            binding: 2,
            resource: this.defaults.comparison,
          },
          {
            binding: 3,
            resource: envView,
          },
          {
            binding: 4,
            resource: linear,
          },
          {
            binding: 5,
            resource: dfgView,
          },
          {
            binding: 6,
            resource: linear,
          },
          {
            binding: 7,
            resource: aoView,
          },
          {
            binding: 8,
            resource: linear,
          },
        ],
      });
      entry.resources = resources;
    }
    return entry;
  }
  project(scene, camera, list, options = {}) {
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    const visit = (object, groupOrder) => {
      if (object.visible === false && !options.forceVisible) {
        return;
      }
      if (object.isGroup) {
        groupOrder = object.renderOrder;
      }
      if (object.isLight) {
        list.lights.push(object);
      } else if (object.isMesh && object.geometry && object.material) {
        const geometry = object.geometry;
        const material = object.material;
        let inFrustum = true;
        if (object.frustumCulled) {
          if (geometry.boundingSphere === null) {
            geometry.computeBoundingSphere();
          }
          _sphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
          inFrustum = _frustum.intersectsSphere(_sphere);
        }
        if (inFrustum && options.filter?.(object) !== false) {
          if (geometry.boundingSphere === null) {
            geometry.computeBoundingSphere();
          }
          _v4
            .set(
              geometry.boundingSphere.center.x,
              geometry.boundingSphere.center.y,
              geometry.boundingSphere.center.z,
              1,
            )
            .applyMatrix4(object.matrixWorld)
            .applyMatrix4(_projScreen);
          const push = (mat, group) => {
            if (!mat || (!mat.visible && !options.forceVisible)) {
              return;
            }
            const item = {
              id: object.id,
              object,
              geometry,
              material: mat,
              group,
              groupOrder,
              renderOrder: object.renderOrder,
              z: _v4.z,
            };
            if (mat.transparent) {
              list.transparent.push(item);
            } else {
              list.opaque.push(item);
            }
          };
          if (Array.isArray(material)) {
            for (const group of geometry.groups) {
              push(material[group.materialIndex], group);
            }
          } else {
            push(material, null);
          }
        }
      }
      const children = object.children;
      for (let i = 0; i < children.length; i++) {
        visit(children[i], groupOrder);
      }
    };
    visit(scene, 0);
    list.opaque.sort(painterSortStable);
    list.transparent.sort(reversePainterSortStable);
    return list;
  }
  gatherLights(lightsArray) {
    const ambient = new Color(0, 0, 0);
    const directional = [];
    const point = [];
    let shadowLight = null;
    for (const light of lightsArray) {
      if (light.isAmbientLight) {
        ambient.add(_color.copy(light.color).multiplyScalar(light.intensity));
      } else if (light.isDirectionalLight) {
        if (light.castShadow && !shadowLight) {
          shadowLight = light;
          directional.unshift(light);
        } else {
          directional.push(light);
        }
      } else if (light.isPointLight) {
        point.push(light);
      }
    }
    return {
      ambient,
      directional,
      point,
      shadowLight,
    };
  }
  pipeline(item, pass, lights, targetFormats, samples, depthFormat, side) {
    const { geometry, material, object } = item;
    const attributes = this.vertexLayout(geometry, material);
    const textures = this.materialState(material, object).textures;
    const { uvTransforms } = this.materialLayoutFields(material, textures);
    const skinned = Boolean(object.isSkinnedMesh && object.skeleton);
    const model = material.isMeshPhysicalMaterial
      ? `physical`
      : material.isMeshStandardMaterial
        ? `standard`
        : `basic`;
    const opaque = !material.transparent && material.blending === NormalBlending;
    const ao = Boolean(pass.ao) && !material.transparent;
    const hasTangents = Boolean(material.normalMap && geometry.attributes.tangent);
    const lightKey = `${lights.directional.length}${lights.shadowLight ? `s` : ``}${lights.point.length}${lights.env ? `e` : ``}`;
    const shaderKey = [
      material.shaderKey,
      material.hooks?.key ?? ``,
      model,
      attributes.map((a) => `${a.name}${a.format}`).join(`,`),
      skinned,
      lightKey,
      pass.id,
      opaque,
      ao,
      hasTangents,
      textures.map((t) => `${t.name}${t.kind}`).join(`,`),
      uvTransforms.join(`,`),
      material.alphaTest > 0,
      Object.keys(material.hooks?.uniforms ?? {}).join(`,`),
    ].join(`|`);
    const cull = side === DoubleSide ? `none` : side === BackSide ? `front` : `back`;
    const blend = pass.kind === `depth` ? null : materialBlend(material);
    const stateKey = [
      targetFormats.join(`,`),
      samples,
      depthFormat,
      cull,
      JSON.stringify(blend ?? null),
      material.depthTest,
      material.depthWrite,
      material.depthCompare,
      material.colorWrite,
      material.polygonOffset,
      material.polygonOffsetFactor,
      material.polygonOffsetUnits,
      pass.blends?.join(`,`) ?? ``,
    ].join(`|`);
    const key = `${shaderKey}#${stateKey}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline) {
      return pipeline;
    }
    if (this.pendingPipelines.has(key)) {
      return null;
    }
    const { fields } = this.materialLayoutFields(material, textures);
    const materialLayout = new UniformLayout(`MaterialUniforms`, fields);
    const code = buildMeshShader({
      material,
      pass,
      attributes,
      skinned,
      model,
      opaque,
      ao,
      hasTangents,
      lights: {
        directional: lights.directional.length,
        point: lights.point.length,
        shadow: Boolean(lights.shadowLight),
        env: Boolean(lights.env) || Boolean(material.envMap?.texture),
        materialEnv: Boolean(material.envMap?.texture),
      },
      anisotropy: Boolean(material.isMeshPhysicalMaterial && material.anisotropy > 0),
      frameLayout: FRAME_LAYOUT,
      materialLayout,
      textures,
      uvTransforms,
      sceneHook: pass.sceneHook,
    });
    const module = this.module(code, `${material.type}:${pass.id}`);
    const bindGroupLayouts = [
      this.layouts.frame,
      this.materialLayout(textures),
      skinned ? this.layouts.objectSkinned : this.layouts.objectPlain,
    ];
    if (pass.sceneHook?.layout) {
      bindGroupLayouts.push(pass.sceneHook.layout);
    }
    const layout = this.device.createPipelineLayout({
      bindGroupLayouts,
    });
    const writeMask = material.colorWrite ? GPUColorWrite.ALL : 0;
    const descriptor = {
      label: `${material.type}:${pass.id}`,
      layout,
      vertex: {
        module,
        entryPoint: `vs`,
        buffers: attributes.map((a) => ({
          arrayStride: formatSize(a.format),
          stepMode: a.instanced ? `instance` : `vertex`,
          attributes: [
            {
              shaderLocation: a.location,
              offset: 0,
              format: a.format,
            },
          ],
        })),
      },
      fragment: {
        module,
        entryPoint: `fs`,
        targets: targetFormats.map((format, i) => {
          const passBlend = pass.blends?.[i];
          const b =
            passBlend === `material` || passBlend === undefined
              ? blend
              : passBlend === `normal`
                ? BLEND.normal
                : passBlend === `none`
                  ? undefined
                  : passBlend;
          return {
            format,
            blend: b ?? undefined,
            writeMask,
          };
        }),
      },
      primitive: {
        topology: `triangle-list`,
        cullMode: cull,
        frontFace: `ccw`,
      },
      multisample: {
        count: samples,
      },
    };
    if (depthFormat) {
      descriptor.depthStencil = {
        format: depthFormat,
        depthWriteEnabled: material.depthWrite,
        depthCompare: material.depthTest ? material.depthCompare : `always`,
      };
      if (material.polygonOffset) {
        descriptor.depthStencil.depthBias = material.polygonOffsetUnits;
        descriptor.depthStencil.depthBiasSlopeScale = material.polygonOffsetFactor;
      }
    }
    if (pass.kind === `depth` && material.alphaTest <= 0) {
      delete descriptor.fragment;
    }
    if (this.asyncPipelines) {
      const pending = this.device.createRenderPipelineAsync(descriptor).then(
        (p) => {
          this.pipelines.set(key, p);
          this.pendingPipelines.delete(key);
          this.info.pipelines++;
          return p;
        },
        (error) => {
          console.error(error, code);
          this.pendingPipelines.delete(key);
        },
      );
      this.pendingPipelines.set(key, pending);
      return null;
    }
    pipeline = this.device.createRenderPipeline(descriptor);
    this.pipelines.set(key, pipeline);
    this.info.pipelines++;
    return pipeline;
  }
  beginFrame() {
    this.info.frame++;
    this.info.drawCalls = 0;
    this.info.triangles = 0;
    this.frameBlockIndex = 0;
    this.encoder = this.device.createCommandEncoder({
      label: `frame`,
    });
  }
  endFrame() {
    if (!this.encoder) {
      return;
    }
    this.device.queue.submit([this.encoder.finish()]);
    this.encoder = null;
  }
  render(scene, camera, target, pass, options = {}) {
    if (this.lost) {
      return;
    }
    const ownEncoder = !this.encoder;
    if (ownEncoder) {
      this.beginFrame();
    }
    if (scene.matrixAutoUpdate !== false) {
      scene.updateMatrixWorld();
    }
    if (camera.parent === null) {
      camera.updateMatrixWorld();
    }
    const list = this.project(
      scene,
      camera,
      {
        opaque: [],
        transparent: [],
        lights: [],
      },
      options,
    );
    const lights = this.gatherLights(list.lights);
    lights.env = Boolean(scene.environment);
    if (
      lights.shadowLight &&
      options.shadows !== false &&
      this.shadowMaps.get(lights.shadowLight)?.frame !== this.info.frame
    ) {
      this.renderShadow(scene, lights.shadowLight, options);
    } else if (lights.shadowLight && !this.shadowMaps.get(lights.shadowLight)) {
      lights.shadowLight = null;
    }
    const gpu = target ? this.ensureTarget(target) : null;
    const width = target ? target.width : this.canvas.width;
    const height = target ? target.height : this.canvas.height;
    const samples = target ? target.samples : 1;
    const formats = target ? target.colors.map((c) => c.format) : [this.format];
    const depthFormat = target ? target.depthFormat : null;
    const frame = this.frameState(scene, camera, lights, width, height, pass);
    const clear = options.clear !== undefined ? options.clear : pass.clear;
    const background = scene.background?.isColor
      ? [scene.background.r, scene.background.g, scene.background.b, 1]
      : [0, 0, 0, 0];
    const colorAttachments = formats.map((_, i) => {
      const resolve = gpu ? gpu.colorViews[i] : this.context.getCurrentTexture().createView();
      const msaa = gpu?.msaaViews[i];
      const clearValue = clear ?? (i === 0 ? background : [0, 0, 0, 0]);
      return {
        view: msaa ?? resolve,
        resolveTarget: msaa ? resolve : undefined,
        loadOp: clear === null ? `load` : `clear`,
        storeOp: msaa ? `discard` : `store`,
        clearValue: clear === undefined ? (i === 0 ? background : [0, 0, 0, 0]) : clearValue,
      };
    });
    const renderPass = this.encoder.beginRenderPass({
      label: pass.id,
      colorAttachments,
      depthStencilAttachment: gpu?.depthView
        ? {
            view: gpu.depthView,
            depthClearValue: 1,
            depthLoadOp: `clear`,
            depthStoreOp: `store`,
          }
        : undefined,
    });
    renderPass.setBindGroup(0, frame.bindGroup);
    if (pass.sceneHook?.bindGroup) {
      renderPass.setBindGroup(3, pass.sceneHook.bindGroup);
    }
    const draw = (item, side) => {
      const pipeline = this.pipeline(item, pass, lights, formats, samples, depthFormat, side);
      if (!pipeline) {
        return;
      }
      this.drawItem(renderPass, pipeline, item);
    };
    for (const item of list.opaque) {
      draw(item, item.material.side);
    }
    if (pass.transparent !== false) {
      for (const item of list.transparent) {
        const material = item.material;
        if (material.side === DoubleSide && !material.forceSinglePass) {
          draw(item, BackSide);
          draw(item, FrontSide);
        } else {
          draw(item, material.side);
        }
      }
    }
    renderPass.end();
    if (ownEncoder) {
      this.endFrame();
    }
  }
  drawItem(renderPass, pipeline, item) {
    const { geometry, material, object, group } = item;
    const buffers = this.geometryBuffers(geometry);
    const materialState = this.materialState(material, object);
    const objectState = this.objectState(object);
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(1, materialState.bindGroup);
    renderPass.setBindGroup(2, objectState.bindGroup);
    const attributes = this.vertexLayout(geometry, material);
    attributes.forEach((a, slot) =>
      renderPass.setVertexBuffer(slot, buffers.attributes.get(a.name).buffer),
    );
    const instances = object.isInstancedMesh ? object.count : 1;
    const range = geometry.drawRange;
    if (buffers.index) {
      const index = geometry.index;
      let start = Math.max(range.start, group ? group.start : 0);
      let end = Math.min(
        index.count,
        range.start + range.count,
        group ? group.start + group.count : Infinity,
      );
      if (end <= start) {
        return;
      }
      renderPass.setIndexBuffer(
        buffers.index.buffer,
        index.array instanceof Uint32Array ? `uint32` : `uint16`,
      );
      renderPass.drawIndexed(end - start, instances, start);
      this.info.triangles += ((end - start) / 3) * instances;
    } else {
      const count = geometry.attributes.position.count;
      const start = Math.max(range.start, group ? group.start : 0);
      const end = Math.min(
        count,
        range.start + range.count,
        group ? group.start + group.count : Infinity,
      );
      if (end <= start) {
        return;
      }
      renderPass.draw(end - start, instances, start);
      this.info.triangles += ((end - start) / 3) * instances;
    }
    this.info.drawCalls++;
  }
  renderShadow(scene, light, options) {
    let shadowMap = this.shadowMaps.get(light);
    const size = light.shadow.mapSize;
    if (!shadowMap || shadowMap.width !== size.x || shadowMap.height !== size.y) {
      shadowMap?.texture.destroy();
      const texture = this.device.createTexture({
        label: `shadow map`,
        size: [size.x, size.y],
        format: `depth24plus`,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      shadowMap = {
        texture,
        view: texture.createView(),
        width: size.x,
        height: size.y,
      };
      this.shadowMaps.set(light, shadowMap);
    }
    shadowMap.frame = this.info.frame;
    light.updateWorldMatrix(true, false);
    light.target.updateWorldMatrix(true, false);
    light.shadow.updateMatrices(light);
    const camera = light.shadow.camera;
    const list = this.project(
      scene,
      camera,
      {
        opaque: [],
        transparent: [],
        lights: [],
      },
      {
        ...options,
        filter: (object) => object.castShadow && (options.filter?.(object) ?? true),
      },
    );
    const lights = {
      ambient: new Color(0, 0, 0),
      directional: [],
      point: [],
      shadowLight: null,
      env: false,
    };
    const frame = this.frameState(scene, camera, lights, size.x, size.y, null);
    const renderPass = this.encoder.beginRenderPass({
      label: `shadow`,
      colorAttachments: [],
      depthStencilAttachment: {
        view: shadowMap.view,
        depthClearValue: 1,
        depthLoadOp: `clear`,
        depthStoreOp: `store`,
      },
    });
    renderPass.setBindGroup(0, frame.bindGroup);
    const pass = SHADOW_PASS;
    for (const item of [...list.opaque, ...list.transparent]) {
      const material = item.material;
      const side =
        material.shadowSide ??
        (material.side === FrontSide
          ? BackSide
          : material.side === BackSide
            ? FrontSide
            : DoubleSide);
      const pipeline = this.pipeline(item, pass, lights, [], 1, `depth24plus`, side);
      if (pipeline) {
        this.drawItem(renderPass, pipeline, item);
      }
    }
    renderPass.end();
  }
  fullscreen(target, { id, fragment, bindings = [], blend, clear = [0, 0, 0, 0], load = false }) {
    const gpu = target ? this.ensureTarget(target) : null;
    const formats = target ? target.colors.map((c) => c.format) : [this.format];
    const key = `fs:${id}:${formats.join(`,`)}:${JSON.stringify(blend ?? null)}`;
    let entry = this.passCache.get(key);
    if (!entry) {
      const module = this.module(
        `diagnostic(off, derivative_uniformity);\n${FULLSCREEN_VERTEX}\n${fragment}`,
        id,
      );
      const pipeline = this.device.createRenderPipeline({
        label: id,
        layout: `auto`,
        vertex: {
          module,
          entryPoint: `vs`,
        },
        fragment: {
          module,
          entryPoint: `fs`,
          targets: formats.map((format) => ({
            format,
            blend: blend ?? undefined,
          })),
        },
        primitive: {
          topology: `triangle-list`,
        },
      });
      entry = {
        pipeline,
        bindGroup: null,
        groups: [],
      };
      this.passCache.set(key, entry);
    }
    const resources = bindings.map((b) => {
      if (b instanceof UniformBlock) {
        return b.upload(this.device, id);
      }
      if (b?.isSampler) {
        return this.sampler(b.texture ?? b, b.kind ?? `float`);
      }
      if (b?.isTexture || b?.isRenderTargetTexture) {
        return this.textureView(b);
      }
      if (b?.isGPUTexture) {
        return b.view;
      }
      return b;
    });
    let group = entry.groups.find(
      (g) =>
        g.resources.length === resources.length && g.resources.every((r, i) => r === resources[i]),
    );
    if (!group) {
      group = {
        resources,
        bindGroup: resources.length
          ? this.device.createBindGroup({
              label: id,
              layout: entry.pipeline.getBindGroupLayout(0),
              entries: resources.map((resource, binding) => ({
                binding,
                resource:
                  resource instanceof GPUBuffer
                    ? {
                        buffer: resource,
                      }
                    : resource,
              })),
            })
          : null,
      };
      entry.groups.unshift(group);
      if (entry.groups.length > 16) {
        entry.groups.length = 16;
      }
    }
    entry.bindGroup = group.bindGroup;
    const ownEncoder = !this.encoder;
    if (ownEncoder) {
      this.beginFrame();
    }
    const view = gpu ? gpu.colorViews[0] : this.context.getCurrentTexture().createView();
    const pass = this.encoder.beginRenderPass({
      label: id,
      colorAttachments: (gpu ? gpu.colorViews : [view]).map((v) => ({
        view: v,
        loadOp: load ? `load` : `clear`,
        storeOp: `store`,
        clearValue: clear,
      })),
    });
    pass.setPipeline(entry.pipeline);
    if (entry.bindGroup) {
      pass.setBindGroup(0, entry.bindGroup);
    }
    pass.draw(3);
    pass.end();
    if (ownEncoder) {
      this.endFrame();
    }
  }
  copyTargetToTexture(target, destination) {
    const gpu = this.ensureTarget(target);
    this.encoder.copyTextureToTexture(
      {
        texture: gpu.colors[0],
      },
      {
        texture: destination,
      },
      [target.width, target.height],
    );
  }
  dispose() {
    this.device.destroy();
  }
}
const SHADOW_PASS = {
  id: `shadow`,
  kind: `depth`,
  outputs: [],
  write: ``,
};
const OBJECT_SIZE = 272;
function align4(n) {
  return Math.ceil(n / 4) * 4;
}
function writeBuffer(device, buffer, array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  if (bytes.byteLength % 4 === 0) {
    device.queue.writeBuffer(buffer, 0, bytes);
  } else {
    const padded = new Uint8Array(align4(bytes.byteLength));
    padded.set(bytes);
    device.queue.writeBuffer(buffer, 0, padded);
  }
}
function formatSize(format) {
  return {
    float32: 4,
    float32x2: 8,
    float32x3: 12,
    float32x4: 16,
    uint16x4: 8,
    uint32x4: 16,
    uint8x4: 4,
    unorm8x4: 4,
    uint32: 4,
  }[format];
}
function bytesPerTexel(format) {
  if (/^(rgba8|bgra8)/.test(format)) {
    return 4;
  }
  if (format === `r8unorm`) {
    return 1;
  }
  if (format === `rg8unorm`) {
    return 2;
  }
  if (format === `rgba16float`) {
    return 8;
  }
  if (format === `rg16float`) {
    return 4;
  }
  if (format === `r16float`) {
    return 2;
  }
  if (format === `rgba32float`) {
    return 16;
  }
  if (format === `rg32float` || format === `rg32uint`) {
    return 8;
  }
  if (format === `r32float` || format === `r32uint`) {
    return 4;
  }
  if (format === `rgba32uint`) {
    return 16;
  }
  throw new Error(`bytesPerTexel: ${format}`);
}
function isIdentityTransform(texture) {
  return (
    texture.offset.x === 0 &&
    texture.offset.y === 0 &&
    texture.repeat.x === 1 &&
    texture.repeat.y === 1 &&
    texture.rotation === 0
  );
}
export { Frustum };
