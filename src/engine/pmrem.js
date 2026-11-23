import { Matrix4 } from "./math.js";
import { RenderTarget } from "./renderer.js";
import { loadImageBitmap, loadJSON, Texture } from "./texture.js";
const LOD_MIN = 4;
const EXTRA_LOD_SIGMA = [0.125, 0.215, 0.35, 0.446, 0.526, 0.582];
const GGX_SAMPLES = 512;
const FACE_LIB = [3, 1, 5, 0, 4, 2];
const DIRECTION = `
fn getDirection(uvIn: vec2f, face: f32) -> vec3f {
  let uv = 2.0 * uvIn - vec2f(1.0);
  var d = vec3f(uv, 1.0);
  if (face == 0.0) {
    d = d.zyx;
  } else if (face == 1.0) {
    d = d.xzy;
    let t = d.xz * vec2f(-1.0);
    d.x = t.x; d.z = t.y;
  } else if (face == 2.0) {
    d.x = d.x * -1.0;
  } else if (face == 3.0) {
    d = d.zyx;
    let t = d.xz * vec2f(-1.0);
    d.x = t.x; d.z = t.y;
  } else if (face == 4.0) {
    d = d.xzy;
    let t = d.xy * vec2f(-1.0);
    d.x = t.x; d.y = t.y;
  } else if (face == 5.0) {
    d.z = d.z * -1.0;
  }
  return d;
}

fn cubeUVGetFace(direction: vec3f) -> f32 {
  let a = abs(direction);
  if (a.x > a.z) {
    if (a.x > a.y) { return select(3.0, 0.0, direction.x > 0.0); }
    return select(4.0, 1.0, direction.y > 0.0);
  }
  if (a.z > a.y) { return select(5.0, 2.0, direction.z > 0.0); }
  return select(4.0, 1.0, direction.y > 0.0);
}

fn cubeUVGetUV(direction: vec3f, face: f32) -> vec2f {
  var uv = vec2f(0.0);
  if (face == 0.0) { uv = vec2f(direction.z, direction.y) / abs(direction.x); }
  else if (face == 1.0) { uv = vec2f(-direction.x, -direction.z) / abs(direction.y); }
  else if (face == 2.0) { uv = vec2f(-direction.x, direction.y) / abs(direction.z); }
  else if (face == 3.0) { uv = vec2f(-direction.z, direction.y) / abs(direction.x); }
  else if (face == 4.0) { uv = vec2f(-direction.x, direction.z) / abs(direction.y); }
  else { uv = vec2f(direction.x, direction.y) / abs(direction.z); }
  return 0.5 * (uv + vec2f(1.0));
}
`;
const PLANE_VERTEX = `
struct PlaneOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) face: f32,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) uv: vec2f, @location(2) face: f32) -> PlaneOut {
  var out: PlaneOut;
  // Orthographic (-1, 1, 1, -1, 0, 1) with an identity view: z from 0 → depth 0.
  out.clip = vec4f(position.xy, 0.0, 1.0);
  out.uv = uv;
  out.face = face;
  return out;
}
`;
const EQUIRECT_FRAGMENT = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;

@fragment
fn fs(in: PlaneOut) -> @location(0) vec4f {
  let d = normalize(getDirection(in.uv, in.face));
  let uv = vec2f(atan2(d.z, d.x) * 0.15915494309189535 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5);
  return textureSampleLevel(source, sourceSampler, uv, 0.0);
}
`;
const GGX_FRAGMENT = (texelWidth, texelHeight, maxMip) => `
struct GGXUniforms { roughness: f32, mipInt: f32, _a: f32, _b: f32 };
@group(0) @binding(0) var<uniform> params: GGXUniforms;
@group(0) @binding(1) var envMap: texture_2d<f32>;
@group(0) @binding(2) var envSampler: sampler;

fn sampleLevel(direction: vec3f, mipIn: f32) -> vec3f {
  var face = cubeUVGetFace(direction);
  let filterInt = max(4.0 - mipIn, 0.0);
  let mip = max(mipIn, 4.0);
  let faceSize = exp2(mip);
  var uv = cubeUVGetUV(direction, face) * vec2f(faceSize - 2.0) + vec2f(1.0);
  if (face > 2.0) {
    uv.y = uv.y + faceSize;
    face = face - 3.0;
  }
  uv.x = uv.x + face * faceSize;
  uv.x = uv.x + filterInt * (3.0 * 16.0);
  uv.y = uv.y + 4.0 * (exp2(${maxMip.toFixed(1)}) - faceSize);
  uv.x = uv.x * ${texelWidth};
  uv.y = uv.y * ${texelHeight};
  return textureSampleGrad(envMap, envSampler, uv, vec2f(0.0), vec2f(0.0)).xyz;
}

@fragment
fn fs(in: PlaneOut) -> @location(0) vec4f {
  let N = normalize(getDirection(in.uv, in.face));
  var prefiltered = vec3f(0.0);
  var totalWeight = 0.0;
  if (params.roughness < 0.001) {
    prefiltered = sampleLevel(N, params.mipInt);
  } else {
    let up = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(N.z) < 0.999);
    let tangent = normalize(cross(up, N));
    let bitangent = cross(N, tangent);
    for (var i: i32 = 0; i < ${GGX_SAMPLES}; i++) {
      let alpha = params.roughness * params.roughness;
      let T1 = vec3f(1.0, 0.0, 0.0);
      let T2 = cross(vec3f(0.0, 0.0, 1.0), T1);
      var bits = u32(i);
      bits = (bits << 16u) | (bits >> 16u);
      bits = ((bits & 1431655765u) << 1u) | ((bits & 2863311530u) >> 1u);
      bits = ((bits & 858993459u) << 2u) | ((bits & 3435973836u) >> 2u);
      bits = ((bits & 252645135u) << 4u) | ((bits & 4042322160u) >> 4u);
      bits = ((bits & 16711935u) << 8u) | ((bits & 4278255360u) >> 8u);
      let Xi = vec2f(f32(i) / ${GGX_SAMPLES}.0, f32(bits) * 2.3283064365386963e-10);
      let r = sqrt(Xi.x);
      let phi = (2.0 * 3.14159265359) * Xi.y;
      let t1 = r * cos(phi);
      var t2 = r * sin(phi);
      let s = 0.5 * (vec3f(0.0, 0.0, 1.0).z + 1.0);
      t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
      let Nh = T1 * vec3f(t1) + T2 * vec3f(t2) + vec3f(0.0, 0.0, 1.0) * vec3f(sqrt(max(0.0, 1.0 - (t1 * t1 + t2 * t2))));
      let Ne = normalize(vec3f(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
      let H = normalize(tangent * vec3f(Ne.x) + bitangent * vec3f(Ne.y) + N * vec3f(Ne.z));
      let L = normalize(H * vec3f(dot(N, H) * 2.0) - N);
      let NdotL = max(dot(N, L), 0.0);
      if (NdotL > 0.0) {
        prefiltered = (vec4f(prefiltered, 1.0) + vec4f(sampleLevel(L, params.mipInt), 1.0) * vec4f(NdotL)).xyz;
        totalWeight = totalWeight + NdotL;
      }
    }
    if (totalWeight > 0.0) { prefiltered = prefiltered / vec3f(totalWeight); }
  }
  return vec4f(prefiltered, 1.0);
}
`;
function createPlanes(lodMax) {
  const sizeLods = [];
  const planes = [];
  let lod = lodMax;
  const totalLods = lodMax - LOD_MIN + 1 + EXTRA_LOD_SIGMA.length;
  for (let i = 0; i < totalLods; i++) {
    const sizeLod = 2 ** lod;
    sizeLods.push(sizeLod);
    const texelSize = 1 / (sizeLod - 2);
    const min = -texelSize;
    const max = 1 + texelSize;
    const uv1 = [min, min, max, min, max, max, min, min, max, max, min, max];
    const data = new Float32Array(6 * 6 * 6);
    for (let face = 0; face < 6; face++) {
      const x = ((face % 3) * 2) / 3 - 1;
      const y = face > 2 ? 0 : -1;
      const coordinates = [
        x,
        y,
        0,
        x + 2 / 3,
        y,
        0,
        x + 2 / 3,
        y + 1,
        0,
        x,
        y,
        0,
        x + 2 / 3,
        y + 1,
        0,
        x,
        y + 1,
        0,
      ];
      const faceIdx = FACE_LIB[face];
      for (let v = 0; v < 6; v++) {
        const o = (faceIdx * 6 + v) * 6;
        data[o] = coordinates[v * 3];
        data[o + 1] = coordinates[v * 3 + 1];
        data[o + 2] = coordinates[v * 3 + 2];
        data[o + 3] = uv1[v * 2];
        data[o + 4] = uv1[v * 2 + 1];
        data[o + 5] = faceIdx;
      }
    }
    planes.push(data);
    if (lod > LOD_MIN) {
      lod--;
    }
  }
  return {
    sizeLods,
    planes,
  };
}
export function createPMREM(renderer, equirect) {
  const { device } = renderer;
  const cubeSize = 2 ** Math.floor(Math.log2(equirect.width / 4));
  const lodMax = Math.log2(cubeSize);
  const width = 3 * Math.max(cubeSize, 16 * 7);
  const height = 4 * cubeSize;
  const target = new RenderTarget(width, height, {
    colors: [
      {
        format: `rgba16float`,
      },
    ],
    depth: null,
    label: `PMREM.cubeUv`,
  });
  const pingPong = new RenderTarget(width, height, {
    colors: [
      {
        format: `rgba16float`,
      },
    ],
    depth: null,
    label: `PMREM.pingPong`,
  });
  const targetGPU = renderer.ensureTarget(target);
  const pingPongGPU = renderer.ensureTarget(pingPong);
  const { sizeLods, planes } = createPlanes(lodMax);
  const vertexBuffers = planes.map((data) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  });
  const vertexLayout = [
    {
      arrayStride: 24,
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: `float32x3`,
        },
        {
          shaderLocation: 1,
          offset: 12,
          format: `float32x2`,
        },
        {
          shaderLocation: 2,
          offset: 20,
          format: `float32`,
        },
      ],
    },
  ];
  const linear = device.createSampler({
    magFilter: `linear`,
    minFilter: `linear`,
  });
  const equirectModule = renderer.module(
    `${DIRECTION}${PLANE_VERTEX}${EQUIRECT_FRAGMENT}`,
    `pmrem-equirect`,
  );
  const equirectPipeline = device.createRenderPipeline({
    label: `PMREM equirect`,
    layout: `auto`,
    vertex: {
      module: equirectModule,
      entryPoint: `vs`,
      buffers: vertexLayout,
    },
    fragment: {
      module: equirectModule,
      entryPoint: `fs`,
      targets: [
        {
          format: `rgba16float`,
        },
      ],
    },
    primitive: {
      topology: `triangle-list`,
    },
  });
  const ggxModule = renderer.module(
    `${DIRECTION}${PLANE_VERTEX}${GGX_FRAGMENT(1 / width, 1 / height, lodMax)}`,
    `pmrem-ggx`,
  );
  const ggxPipeline = device.createRenderPipeline({
    label: `PMREM ggx`,
    layout: `auto`,
    vertex: {
      module: ggxModule,
      entryPoint: `vs`,
      buffers: vertexLayout,
    },
    fragment: {
      module: ggxModule,
      entryPoint: `fs`,
      targets: [
        {
          format: `rgba16float`,
        },
      ],
    },
    primitive: {
      topology: `triangle-list`,
    },
  });
  const encoder = device.createCommandEncoder({
    label: `PMREM`,
  });
  {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetGPU.colorViews[0],
          loadOp: `clear`,
          storeOp: `store`,
          clearValue: [0, 0, 0, 0],
        },
      ],
    });
    pass.setPipeline(equirectPipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout: equirectPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: renderer.textureView(equirect),
          },
          {
            binding: 1,
            resource: linear,
          },
        ],
      }),
    );
    pass.setViewport(0, 0, 3 * cubeSize, 2 * cubeSize, 0, 1);
    pass.setScissorRect(0, 0, 3 * cubeSize, 2 * cubeSize);
    pass.setVertexBuffer(0, vertexBuffers[0]);
    pass.draw(36);
    pass.end();
  }
  const n = planes.length;
  const uniformBuffers = [];
  for (let i = 1; i < n; i++) {
    const lodIn = i - 1;
    const lodOut = i;
    const targetRoughness = lodOut / (n - 1);
    const sourceRoughness = lodIn / (n - 1);
    const incremental = Math.sqrt(
      targetRoughness * targetRoughness - sourceRoughness * sourceRoughness,
    );
    const adjusted = incremental * (0 + targetRoughness * 1.25);
    const outputSize = sizeLods[lodOut];
    const x = 3 * outputSize * (lodOut > lodMax - LOD_MIN ? lodOut - lodMax + LOD_MIN : 0);
    const y = 4 * (cubeSize - outputSize);
    const stages = [
      {
        roughness: adjusted,
        mipInt: lodMax - lodIn,
        source: targetGPU,
        destination: pingPongGPU,
      },
      {
        roughness: 0,
        mipInt: lodMax - lodOut,
        source: pingPongGPU,
        destination: targetGPU,
      },
    ];
    for (const stage of stages) {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(buffer, 0, new Float32Array([stage.roughness, stage.mipInt, 0, 0]));
      uniformBuffers.push(buffer);
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: stage.destination.colorViews[0],
            loadOp: `load`,
            storeOp: `store`,
          },
        ],
      });
      pass.setPipeline(ggxPipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: ggxPipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer,
              },
            },
            {
              binding: 1,
              resource: stage.source.colorViews[0],
            },
            {
              binding: 2,
              resource: linear,
            },
          ],
        }),
      );
      pass.setViewport(x, y, 3 * outputSize, 2 * outputSize, 0, 1);
      pass.setScissorRect(x, y, 3 * outputSize, 2 * outputSize);
      pass.setVertexBuffer(0, vertexBuffers[lodOut]);
      pass.draw(36);
      pass.end();
    }
  }
  device.queue.submit([encoder.finish()]);
  device.queue.onSubmittedWorkDone().then(() => {
    for (const buffer of [...vertexBuffers, ...uniformBuffers]) {
      buffer.destroy();
    }
    pingPong.dispose();
  });
  return {
    texture: target.texture,
    target,
    maxMip: lodMax,
    texelWidth: 1 / width,
    texelHeight: 1 / height,
    rotation: new Matrix4(),
  };
}
const GAINMAP_FRAGMENT = `
struct GainMapUniforms {
  offsetSdr: vec3f, weight: f32,
  gainMapMin: vec3f, _a: f32,
  gainMapMax: vec3f, _b: f32,
  gamma: vec3f, _c: f32,
  offsetHdr: vec3f, _d: f32,
};
@group(0) @binding(0) var<uniform> params: GainMapUniforms;
@group(0) @binding(1) var sdr: texture_2d<f32>;
@group(0) @binding(2) var gain: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4f {
  let s = textureSample(sdr, linearSampler, in.uv);
  let g = textureSample(gain, linearSampler, in.uv);
  let recovery = pow(g.xyz, params.gamma);
  let logBoost = params.gainMapMin * (vec3f(1.0) - recovery) + params.gainMapMax * recovery;
  let hdr = (s.xyz + params.offsetSdr) * exp2(logBoost * vec3f(params.weight)) - params.offsetHdr;
  return max(vec4f(max(vec3f(-65504.0), min(vec3f(65504.0), hdr)), 1.0), vec4f(0.0));
}
`;
export async function loadGainMap(renderer, [sdrUrl, gainUrl, metaUrl], { flipY = false } = {}) {
  const [sdrImage, gainImage, meta] = await Promise.all([
    loadImageBitmap(sdrUrl, {
      flipY,
    }),
    loadImageBitmap(gainUrl, {
      flipY,
    }),
    loadJSON(metaUrl),
  ]);
  const sdr = new Texture(sdrImage);
  sdr.colorSpace = `srgb`;
  sdr.flipY = false;
  sdr.generateMipmaps = false;
  sdr.minFilter = `linear`;
  sdr.needsUpdate = true;
  const gain = new Texture(gainImage);
  gain.flipY = false;
  gain.generateMipmaps = false;
  gain.minFilter = `linear`;
  gain.needsUpdate = true;
  const target = new RenderTarget(sdrImage.width, sdrImage.height, {
    colors: [
      {
        format: `rgba16float`,
      },
    ],
    depth: null,
    label: `gainmap`,
  });
  const maxDisplayBoost = 2 ** meta.hdrCapacityMax;
  const weight = Math.min(
    1,
    Math.max(
      0,
      (Math.log2(maxDisplayBoost) - meta.hdrCapacityMin) /
        (meta.hdrCapacityMax - meta.hdrCapacityMin),
    ),
  );
  const params = new Float32Array(20);
  params.set(meta.offsetSdr, 0);
  params[3] = weight;
  params.set(meta.gainMapMin, 4);
  params.set(meta.gainMapMax, 8);
  params.set(
    meta.gamma.map((g) => 1 / g),
    12,
  );
  params.set(meta.offsetHdr, 16);
  const { UniformBlock, UniformLayout } = await import(`./uniforms.js`);
  const block = new UniformBlock(
    new UniformLayout(`GainMap`, [
      [`data`, `mat4x4f`],
      [`tail`, `vec4f`],
    ]),
  );
  block.data.set(params);
  renderer.fullscreen(target, {
    id: `gainmap-decode`,
    fragment: GAINMAP_FRAGMENT,
    bindings: [
      block,
      sdr,
      gain,
      {
        isSampler: true,
        texture: {
          wrapS: `clamp-to-edge`,
          wrapT: `clamp-to-edge`,
          magFilter: `linear`,
          minFilter: `linear`,
          anisotropy: 1,
        },
      },
    ],
  });
  return target;
}
