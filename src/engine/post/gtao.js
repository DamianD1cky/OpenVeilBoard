import { RenderTarget } from "../renderer.js";
import { UniformBlock, UniformLayout } from "../uniforms.js";
import { DataTexture } from "../texture.js";
function magicSquare(size) {
  const n = size % 2 === 0 ? size + 1 : size;
  const square = new Array(n * n).fill(0);
  let i = Math.floor(n / 2);
  let j = n - 1;
  for (let num = 1; num <= n * n;) {
    if (i === -1 && j === n) {
      j = n - 2;
      i = 0;
    } else {
      if (j === n) {
        j = 0;
      }
      if (i < 0) {
        i = n - 1;
      }
    }
    if (square[i * n + j] !== 0) {
      j -= 2;
      i++;
      continue;
    }
    square[i * n + j] = num++;
    j++;
    i--;
  }
  return square;
}
function magicSquareNoise(size = 5) {
  const square = magicSquare(size);
  const data = new Uint8Array(square.length * 4);
  for (let index = 0; index < square.length; index++) {
    const angle = (2 * Math.PI * square[index]) / square.length;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const length = Math.hypot(x, y);
    data[index * 4] = ((x / length) * 0.5 + 0.5) * 255;
    data[index * 4 + 1] = ((y / length) * 0.5 + 0.5) * 255;
    data[index * 4 + 2] = 127;
    data[index * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = `repeat`;
  texture.needsUpdate = true;
  return texture;
}
const FRAGMENT = `
struct GTAOUniforms {
  projectionInverse: mat4x4f,
  projection: mat4x4f,
  resolution: vec2f,
  samples: f32,
  temporalDirection: f32,
  radius: f32,
  distanceExponent: f32,
  thickness: f32,
  distanceFallOff: f32,
  scale: f32,
};
@group(0) @binding(0) var<uniform> u: GTAOUniforms;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var normalTexture: texture_2d<f32>;
@group(0) @binding(3) var normalSampler: sampler;
@group(0) @binding(4) var noiseTexture: texture_2d<f32>;

fn loadDepth(uv: vec2f) -> f32 {
  let size = textureDimensions(depthTexture, 0u);
  let texel = vec2u(clamp(floor(clamp(uv, vec2f(0.0), vec2f(1.0)) * vec2f(size)), vec2f(0.0), vec2f(size - vec2u(1u, 1u))));
  return textureLoad(depthTexture, texel, 0u);
}

fn viewPosition(uv: vec2f, depth: f32) -> vec3f {
  let clip = vec4f(vec2f(uv.x, 1.0 - uv.y) * 2.0 - vec2f(1.0), depth, 1.0);
  let view = u.projectionInverse * clip;
  return view.xyz / vec3f(view.w);
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  let uv = in.uv;
  let depth = loadDepth(uv);
  if (depth >= 1.0) { discard; }
  let viewPos = viewPosition(uv, depth);
  let viewNormal = normalize((textureSample(normalTexture, normalSampler, uv) * 2.0 - vec4f(1.0)).xyz);
  let directions = select(5.0, 3.0, u.samples < 30.0);
  let steps = (u.samples + (directions - 1.0)) / directions;
  var ao = 0.0;
  let noiseSize = textureDimensions(noiseTexture, 0u);
  for (var i: i32 = 0; i < i32(directions); i++) {
    let angle = (f32(i) / directions) * 3.141592653589793 + u.temporalDirection;
    let noiseUv = fract(vec2f(uv.x, 1.0 - uv.y) * (u.resolution / vec2f(textureDimensions(noiseTexture, 0))));
    let noiseTexel = vec2u(clamp(floor(noiseUv * vec2f(noiseSize)), vec2f(0.0), vec2f(noiseSize - vec2u(1u, 1u))));
    let noise = textureLoad(noiseTexture, noiseTexel, 0u);
    var sampleDir = vec4f(cos(angle), sin(angle), 0.0, 0.5 + 0.5 * noise.w);
    let randomVec = normalize(vec3f((noise.xyz * 2.0 - vec3f(1.0)).xy, 0.0));
    let rotated = normalize(mat3x3f(randomVec, vec3f(randomVec.y * -1.0, randomVec.x, 0.0), vec3f(0.0, 0.0, 1.0)) * sampleDir.xyz);
    sampleDir = vec4f(rotated, sampleDir.w);
    let viewDir = normalize(-viewPos);
    let sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
    let sliceTangent = cross(sliceBitangent, viewDir);
    let normalInSlice = viewNormal - sliceBitangent * vec3f(dot(viewNormal, sliceBitangent));
    let tangentToNormalInSlice = length(normalInSlice);
    let normalInSliceNormalized = normalInSlice / vec3f(max(tangentToNormalInSlice, 0.0001));
    let cosAngle = dot(normalInSliceNormalized, sliceTangent);
    let cosN = clamp(dot(normalInSliceNormalized, viewDir), 0.0, 1.0);
    let signN = select(-1.0, 1.0, cosAngle >= 0.0);
    let n = signN * acos(cosN);
    let crossN = cross(normalInSliceNormalized, sliceBitangent);
    var horizons = vec2f(dot(viewDir, crossN), dot(viewDir, -crossN));
    for (var j: i32 = 0; j < i32(steps); j++) {
      let offset = ((sampleDir.xyz * vec3f(u.radius)) * vec3f(sampleDir.w)) * vec3f(pow((f32(j) + 1.0) / steps, u.distanceExponent));
      let clipA = u.projection * vec4f(viewPos + offset, 1.0);
      let ndcA = (clipA.xy / vec2f(clipA.w)) * 0.5 + vec2f(0.5);
      let uvA = vec2f(ndcA.x, 1.0 - ndcA.y);
      let posA = viewPosition(uvA, loadDepth(uvA));
      let deltaA = posA - viewPos;
      if (abs(deltaA.z) < u.thickness) {
        horizons.x = horizons.x + max(0.0, (dot(viewDir, normalize(deltaA)) - horizons.x) * mix(1.0, 2.0 / (f32(j) + 2.0), u.distanceFallOff));
      }
      let clipB = u.projection * vec4f(viewPos - offset, 1.0);
      let ndcB = (clipB.xy / vec2f(clipB.w)) * 0.5 + vec2f(0.5);
      let uvB = vec2f(ndcB.x, 1.0 - ndcB.y);
      let posB = viewPosition(uvB, loadDepth(uvB));
      let deltaB = posB - viewPos;
      if (abs(deltaB.z) < u.thickness) {
        horizons.y = horizons.y + max(0.0, (dot(viewDir, normalize(deltaB)) - horizons.y) * mix(1.0, 2.0 / (f32(j) + 2.0), u.distanceFallOff));
      }
    }
    let h0 = acos(horizons.y);
    let h1 = -acos(horizons.x);
    ao = ao + tangentToNormalInSlice * (((-cos(h0 * 2.0 - n) + cosN + h0 * 2.0 * cosAngle) + (-cos(h1 * 2.0 - n) + cosN + h1 * 2.0 * cosAngle)) * 0.25);
  }
  ao = clamp(ao / directions, 0.0, 1.0);
  ao = pow(ao, u.scale);
  return vec4f(ao, 0.0, 0.0, 1.0);
}
`;
export class GTAOEffect {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new RenderTarget(1, 1, {
      colors: [
        {
          format: `r8unorm`,
        },
      ],
      depth: null,
      label: `GTAONode.AO`,
    });
    this.noise = magicSquareNoise(5);
    this.block = new UniformBlock(
      new UniformLayout(`GTAO`, [
        [`projectionInverse`, `mat4x4f`],
        [`projection`, `mat4x4f`],
        [`resolution`, `vec2f`],
        [`samples`, `f32`],
        [`temporalDirection`, `f32`],
        [`radius`, `f32`],
        [`distanceExponent`, `f32`],
        [`thickness`, `f32`],
        [`distanceFallOff`, `f32`],
        [`scale`, `f32`],
      ]),
    );
    this.params = {
      samples: 16,
      radius: 0.25,
      distanceExponent: 1,
      thickness: 1,
      distanceFallOff: 1,
      scale: 1,
    };
  }
  get texture() {
    return this.target.texture;
  }
  setSize(width, height) {
    this.target.setSize(width, height);
  }
  render(camera, prepass) {
    const b = this.block;
    const p = this.params;
    b.set(`projectionInverse`, camera.projectionMatrixInverse);
    b.set(`projection`, camera.projectionMatrix);
    b.set(`resolution`, [this.target.width, this.target.height]);
    b.set(`samples`, p.samples);
    b.set(`temporalDirection`, 0);
    b.set(`radius`, p.radius);
    b.set(`distanceExponent`, p.distanceExponent);
    b.set(`thickness`, p.thickness);
    b.set(`distanceFallOff`, p.distanceFallOff);
    b.set(`scale`, p.scale);
    this.renderer.fullscreen(this.target, {
      id: `GTAO`,
      fragment: FRAGMENT,
      bindings: [
        b,
        prepass.depthTexture,
        prepass.texture,
        {
          isSampler: true,
          texture: LINEAR,
        },
        this.noise,
      ],
      clear: [1, 1, 1, 1],
    });
  }
}
const LINEAR = {
  wrapS: `clamp-to-edge`,
  wrapT: `clamp-to-edge`,
  magFilter: `linear`,
  minFilter: `linear`,
  anisotropy: 1,
};
