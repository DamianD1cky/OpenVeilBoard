import { RenderTarget } from "../engine/index.js";
import { UniformBlock, UniformLayout } from "../engine/uniforms.js";
import { COMMON } from "../engine/wgsl.js";
import { GTAOEffect } from "../engine/post/gtao.js";
import { BloomEffect } from "../engine/post/bloom.js";
export const BEAUTY_WRITE = `
  let surfaceTint = mix(goboTint(positionWorld), vec3f(1.0), object.custom0.z);
  out.output = vec4f(outputColor.rgb * surfaceTint, outputColor.a);
  out.emissive = vec4f(emissive * surfaceTint, outputColor.a);
  out.mediaMask = vec4f(object.custom0.x, object.custom0.y, 0.0, outputColor.a);
`;
export const LAB_WRITE = `
  out.output = outputColor;
  out.inspectMask = vec4f(object.custom1.x, object.custom1.y, 0.0, outputColor.a);
`;
const PREPASS_WRITE = `  out.output = vec4f(packNormalToRGB(normalView), 1.0);
`;
export function objectData(object) {
  const u = object.userData;
  let inspect = 0;
  for (let parent = object; parent; parent = parent.parent) {
    if (parent.userData.labInspect) {
      inspect = 1;
      break;
    }
  }
  return [
    u.projectMediaClean ?? 0,
    u.projectMediaCoverage ?? 0,
    u.projectMediaGoboRelease ?? 0,
    0,
    u.labGlow ?? 0,
    inspect,
    0,
    0,
  ];
}
const COMPOSITE = `
${COMMON}
struct Composite { exposure: f32, viewerProgress: f32, blurRadius: vec2f, resolution: vec2f };
@group(0) @binding(0) var<uniform> u: Composite;
@group(0) @binding(1) var beauty: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var mediaMask: texture_2d<f32>;
@group(0) @binding(4) var linearSampler: sampler;

fn unpremultiply(c: vec4f) -> vec4f { return select(vec4f(c.xyz / vec3f(c.w), c.w), vec4f(0.0), c.w == 0.0); }
fn premultiply(c: vec4f) -> vec4f { return vec4f(c.xyz * vec3f(c.w), c.w); }
fn renderOutput(c: vec4f) -> vec4f {
  let u0 = unpremultiply(vec4f(c.xyz, clamp(c.w, 0.0, 1.0)));
  return premultiply(vec4f(sRGBTransferOETF(acesFilmicToneMapping(u0.xyz, u.exposure)), u0.w));
}
fn renderOutputLinear(c: vec4f) -> vec4f {
  let u0 = unpremultiply(vec4f(c.xyz, clamp(c.w, 0.0, 1.0)));
  return premultiply(vec4f(sRGBTransferOETF(u0.xyz), u0.w));
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  let raw = textureSample(beauty, linearSampler, in.uv);
  let glow = textureSample(bloom, linearSampler, in.uv);
  let mask = textureSample(mediaMask, linearSampler, in.uv);
  let lit = raw + glow * vec4f(1.0 - mask.x);
  var result = mix(renderOutput(lit), renderOutputLinear(raw), mask.x);
  // Backdrop blur behind the media viewer (projectBackdropBlur).
  let coverage = smoothstep(0.0, 0.01, mask.y);
  if (u.viewerProgress > 0.0 && coverage < 0.999) {
    var color = vec3f(0.0);
    var total = 0.0;
    let stepSize = u.blurRadius * vec2f(u.viewerProgress);
    for (var index = 0; index < 48; index++) {
      let coord = clamp(in.clip.xy / u.resolution + BLUR_OFFSETS[index] * stepSize, vec2f(0.0), vec2f(1.0));
      let weight = 1.0 - smoothstep(0.0, 0.01, textureSample(mediaMask, linearSampler, coord).y);
      color = color + textureSample(beauty, linearSampler, coord).xyz * vec3f(weight);
      total = total + weight;
    }
    if (total > 0.0001) {
      let blurred = renderOutput(vec4f(color / vec3f(total), 1.0));
      result = mix(result, blurred, u.viewerProgress * (1.0 - coverage));
    }
  }
  return result;
}
`;
function blurOffsets() {
  const values = [];
  for (let index = 0; index < 48; index += 1) {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const distance = Math.sqrt(-0.5 * Math.log(1 - ((index + 0.5) / 48) * (1 - Math.exp(-2))));
    values.push(`vec2f(${Math.cos(angle) * distance}, ${Math.sin(angle) * distance})`);
  }
  return `const BLUR_OFFSETS = array<vec2f, 48>(${values.join(`, `)});`;
}
const LINEAR = {
  wrapS: `clamp-to-edge`,
  wrapT: `clamp-to-edge`,
  magFilter: `linear`,
  minFilter: `linear`,
  anisotropy: 1,
};
export class ScenePost {
  constructor(renderer, { gobo, gtao, bloom, samples = 4 }) {
    this.renderer = renderer;
    this.gobo = gobo;
    this.gtaoSettings = gtao;
    this.samples = samples;
    this.prepass = new RenderTarget(1, 1, {
      colors: [
        {
          format: `rgba16float`,
        },
      ],
      depth: `depth24plus`,
      label: `GTAO Pre-Pass`,
    });
    this.beauty = new RenderTarget(1, 1, {
      colors: [
        {
          format: `rgba16float`,
          name: `output`,
        },
        {
          format: `rgba8unorm`,
          name: `emissive`,
        },
        {
          format: `rgba8unorm`,
          name: `mediaMask`,
        },
      ],
      depth: `depth24plus`,
      samples,
      label: `beauty`,
    });
    this.gtao = new GTAOEffect(renderer);
    Object.assign(this.gtao.params, {
      samples: gtao.samples,
      radius: gtao.radius,
      distanceExponent: gtao.distanceExponent,
      thickness: gtao.thickness,
      distanceFallOff: gtao.distanceFallOff,
      scale: gtao.scale,
    });
    this.bloom = new BloomEffect(renderer, {
      id: `UnrealBloomPass`,
      ...bloom,
    });
    this.compositeBlock = new UniformBlock(
      new UniformLayout(`Composite`, [
        [`exposure`, `f32`],
        [`viewerProgress`, `f32`],
        [`blurRadius`, `vec2f`],
        [`resolution`, `vec2f`],
      ]),
    );
    this.compositeFragment = COMPOSITE.replace(`@fragment`, `${blurOffsets()}\n@fragment`);
    this.viewerProgress = 0;
    this.width = 0;
    this.height = 0;
  }
  setSize(width, height, cssWidth, cssHeight) {
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    const scale = this.gtaoSettings.resolutionScale;
    this.prepass.setSize(Math.round(width * scale), Math.round(height * scale));
    this.gtao.setSize(Math.round(width * scale), Math.round(height * scale));
    this.beauty.setSize(width, height);
    this.bloom.setSize(width, height);
  }
  passes() {
    const hook = this.gobo.hook();
    const debug = this.debugWrite;
    return {
      prepass: {
        id: `gtao-prepass`,
        kind: `color`,
        outputs: [
          {
            name: `output`,
            type: `vec4f`,
          },
        ],
        write: PREPASS_WRITE,
        transparent: false,
      },
      beauty: {
        id: `beauty`,
        kind: `color`,
        sceneHook: hook,
        ao: this.gtaoSettings.enabled !== false ? this.gtao.texture : null,
        outputs: [
          {
            name: `output`,
            type: `vec4f`,
          },
          {
            name: `emissive`,
            type: `vec4f`,
          },
          {
            name: `mediaMask`,
            type: `vec4f`,
          },
        ],
        blends: [`material`, `normal`, `normal`],
        write: debug ?? BEAUTY_WRITE,
      },
    };
  }
  render(scene, camera, target = null, options = {}) {
    const r = this.renderer;
    const { prepass, beauty } = this.passes();
    if (this.gtaoSettings.enabled !== false) {
      r.render(scene, camera, this.prepass, prepass, {
        clear: [0, 0, 0, 0],
        ...options,
      });
      this.gtao.render(camera, this.prepass);
    }
    r.render(scene, camera, this.beauty, beauty, {
      shadows: true,
      ...options,
    });
    this.bloom.render(this.beauty.textures[1]);
    const b = this.compositeBlock;
    b.set(`exposure`, r.exposure);
    b.set(`viewerProgress`, this.viewerProgress);
    b.set(`blurRadius`, [12 / Math.max(this.cssWidth, 1), 12 / Math.max(this.cssHeight, 1)]);
    b.set(`resolution`, [this.width, this.height]);
    r.fullscreen(target, {
      id: `composite`,
      fragment: this.compositeFragment,
      bindings: [
        b,
        this.beauty.textures[0],
        this.bloom.texture,
        this.beauty.textures[2],
        {
          isSampler: true,
          texture: LINEAR,
        },
      ],
    });
  }
  dispose() {
    this.prepass?.dispose?.();
    this.beauty?.dispose?.();
    this.gtao?.dispose?.();
    this.bloom?.dispose?.();
  }
}
