import { RenderTarget } from "../renderer.js";
import { UniformBlock, UniformLayout } from "../uniforms.js";
const KERNELS = [6, 10, 14, 18, 22];
const FACTORS = [1, 0.8, 0.6, 0.4, 0.2];
const LINEAR = {
  wrapS: `clamp-to-edge`,
  wrapT: `clamp-to-edge`,
  magFilter: `linear`,
  minFilter: `linear`,
  anisotropy: 1,
};
const highPass = (input) => `
struct HighPass { threshold: f32, smoothWidth: f32 };
@group(0) @binding(0) var<uniform> u: HighPass;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  let color = ${input};
  let luma = dot(color.xyz, vec3f(0.2126, 0.7152, 0.0722));
  return mix(vec4f(0.0), color, smoothstep(u.threshold, u.threshold + u.smoothWidth, luma));
}`;
const blur = (kernel) => {
  const sigma = kernel / 3;
  const coefficients = [];
  for (let i = 0; i < kernel; i++) {
    coefficients.push((0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma);
  }
  return `
struct Blur { invSize: vec2f, direction: vec2f };
@group(0) @binding(0) var<uniform> u: Blur;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
const KERNEL = array<f32, ${kernel}>(${coefficients.map((c) => c.toPrecision(17)).join(`, `)});
@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  var sum = textureSample(source, sourceSampler, in.uv).xyz * vec3f(KERNEL[0]);
  for (var i: i32 = 1; i < ${kernel}; i++) {
    let offset = (u.invSize * u.direction) * vec2f(f32(i));
    let a = textureSample(source, sourceSampler, in.uv + offset);
    let b = textureSample(source, sourceSampler, in.uv - offset);
    sum = sum + (a.xyz + b.xyz) * vec3f(KERNEL[i]);
  }
  return vec4f(sum, 1.0);
}`;
};
const COMPOSITE = `
struct Composite { strength: f32, radius: f32 };
@group(0) @binding(0) var<uniform> u: Composite;
@group(0) @binding(1) var blur0: texture_2d<f32>;
@group(0) @binding(2) var blur1: texture_2d<f32>;
@group(0) @binding(3) var blur2: texture_2d<f32>;
@group(0) @binding(4) var blur3: texture_2d<f32>;
@group(0) @binding(5) var blur4: texture_2d<f32>;
@group(0) @binding(6) var linearSampler: sampler;
fn lerpBloomFactor(factor: f32, radius: f32) -> f32 { return mix(factor, 1.2 - factor, radius); }
@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  let c0 = vec4f(lerpBloomFactor(${FACTORS[0].toFixed(1)}, u.radius)) * textureSample(blur0, linearSampler, in.uv);
  let c1 = vec4f(lerpBloomFactor(${FACTORS[1].toFixed(1)}, u.radius)) * textureSample(blur1, linearSampler, in.uv);
  let c2 = vec4f(lerpBloomFactor(${FACTORS[2].toFixed(1)}, u.radius)) * textureSample(blur2, linearSampler, in.uv);
  let c3 = vec4f(lerpBloomFactor(${FACTORS[3].toFixed(1)}, u.radius)) * textureSample(blur3, linearSampler, in.uv);
  let c4 = vec4f(lerpBloomFactor(${FACTORS[4].toFixed(1)}, u.radius)) * textureSample(blur4, linearSampler, in.uv);
  return (c0 + c1 + c2 + c3 + c4) * vec4f(u.strength);
}`;
export class BloomEffect {
  constructor(
    renderer,
    {
      id = `bloom`,
      input = `textureSample(source, sourceSampler, in.uv)`,
      strength = 1,
      radius = 0,
      threshold = 0,
      smoothWidth = 0.01,
    } = {},
  ) {
    this.renderer = renderer;
    this.id = id;
    this.input = input;
    this.strength = strength;
    this.radius = radius;
    this.threshold = threshold;
    this.smoothWidth = smoothWidth;
    this.resolutionScale = 0.5;
    const target = (label) =>
      new RenderTarget(1, 1, {
        colors: [
          {
            format: `rgba16float`,
          },
        ],
        depth: null,
        label,
      });
    this.bright = target(`${id}.bright`);
    this.horizontal = KERNELS.map((_, i) => target(`${id}.h${i}`));
    this.vertical = KERNELS.map((_, i) => target(`${id}.v${i}`));
    this.highBlock = new UniformBlock(
      new UniformLayout(`HighPass`, [
        [`threshold`, `f32`],
        [`smoothWidth`, `f32`],
      ]),
    );
    this.blurBlocks = KERNELS.map(() =>
      [0, 1].map(
        () =>
          new UniformBlock(
            new UniformLayout(`Blur`, [
              [`invSize`, `vec2f`],
              [`direction`, `vec2f`],
            ]),
          ),
      ),
    );
    this.compositeBlock = new UniformBlock(
      new UniformLayout(`Composite`, [
        [`strength`, `f32`],
        [`radius`, `f32`],
      ]),
    );
  }
  get texture() {
    return this.horizontal[0].texture;
  }
  setSize(width, height) {
    let x = Math.floor(width * this.resolutionScale);
    let y = Math.floor(height * this.resolutionScale);
    this.bright.setSize(x, y);
    for (let i = 0; i < KERNELS.length; i++) {
      this.horizontal[i].setSize(x, y);
      this.vertical[i].setSize(x, y);
      this.blurBlocks[i][0].set(`invSize`, [1 / x, 1 / y]);
      this.blurBlocks[i][1].set(`invSize`, [1 / x, 1 / y]);
      this.blurBlocks[i][0].set(`direction`, [1, 0]);
      this.blurBlocks[i][1].set(`direction`, [0, 1]);
      x = Math.floor(x / 2);
      y = Math.floor(y / 2);
    }
  }
  render(source) {
    const r = this.renderer;
    this.highBlock.set(`threshold`, this.threshold);
    this.highBlock.set(`smoothWidth`, this.smoothWidth);
    r.fullscreen(this.bright, {
      id: `${this.id}:high`,
      fragment: highPass(this.input),
      bindings: [
        this.highBlock,
        source,
        {
          isSampler: true,
          texture: LINEAR,
        },
      ],
    });
    let input = this.bright;
    for (let i = 0; i < KERNELS.length; i++) {
      r.fullscreen(this.horizontal[i], {
        id: `${this.id}:blur${i}`,
        fragment: blur(KERNELS[i]),
        bindings: [
          this.blurBlocks[i][0],
          input.texture,
          {
            isSampler: true,
            texture: LINEAR,
          },
        ],
      });
      r.fullscreen(this.vertical[i], {
        id: `${this.id}:blur${i}`,
        fragment: blur(KERNELS[i]),
        bindings: [
          this.blurBlocks[i][1],
          this.horizontal[i].texture,
          {
            isSampler: true,
            texture: LINEAR,
          },
        ],
      });
      input = this.vertical[i];
    }
    this.compositeBlock.set(`strength`, this.strength);
    this.compositeBlock.set(`radius`, this.radius);
    r.fullscreen(this.horizontal[0], {
      id: `${this.id}:composite`,
      fragment: COMPOSITE,
      bindings: [
        this.compositeBlock,
        ...this.vertical.map((t) => t.texture),
        {
          isSampler: true,
          texture: LINEAR,
        },
      ],
    });
  }
}
