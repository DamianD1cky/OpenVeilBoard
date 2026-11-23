import { Color, Matrix3, Matrix4, Vector2, Vector3, Vector4 } from "./math.js";
export class Uniform {
  constructor(value, type = inferType(value)) {
    this.value = value;
    this.type = type;
    this.update = null;
  }
  onUpdate(callback) {
    this.update = callback;
    return this;
  }
}
export function uniform(value, type) {
  return new Uniform(value, type);
}
export function inferType(value) {
  if (typeof value === `number` || typeof value === `boolean`) {
    return `f32`;
  }
  if (value instanceof Color || value instanceof Vector3) {
    return `vec3f`;
  }
  if (value instanceof Vector2) {
    return `vec2f`;
  }
  if (value instanceof Vector4) {
    return `vec4f`;
  }
  if (value instanceof Matrix3) {
    return `mat3x3f`;
  }
  if (value instanceof Matrix4) {
    return `mat4x4f`;
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const n = value.length;
    if (n === 2) {
      return `vec2f`;
    }
    if (n === 3) {
      return `vec3f`;
    }
    if (n === 4) {
      return `vec4f`;
    }
    if (n === 16) {
      return `mat4x4f`;
    }
  }
  throw new Error(`uniform(): cannot infer a WGSL type for ${value}`);
}
const LAYOUT = {
  f32: {
    align: 4,
    size: 4,
  },
  i32: {
    align: 4,
    size: 4,
  },
  u32: {
    align: 4,
    size: 4,
  },
  vec2f: {
    align: 8,
    size: 8,
  },
  vec3f: {
    align: 16,
    size: 12,
  },
  vec4f: {
    align: 16,
    size: 16,
  },
  mat3x3f: {
    align: 16,
    size: 48,
  },
  mat4x4f: {
    align: 16,
    size: 64,
  },
};
export class UniformLayout {
  constructor(name, fields) {
    this.name = name;
    this.fields = [];
    let offset = 0;
    for (const [field, type] of fields) {
      const rule = LAYOUT[type];
      if (!rule) {
        throw new Error(`Unsupported uniform type ${type}`);
      }
      offset = Math.ceil(offset / rule.align) * rule.align;
      this.fields.push({
        name: field,
        type,
        offset,
      });
      offset += rule.size;
    }
    this.size = Math.max(16, Math.ceil(offset / 16) * 16);
    this.byName = new Map(this.fields.map((field) => [field.name, field]));
  }
  wgsl() {
    if (this.fields.length === 0) {
      return `struct ${this.name} { _pad: vec4f };`;
    }
    return `struct ${this.name} {\n${this.fields.map((f) => `  ${f.name}: ${f.type},`).join(`
`)}\n};`;
  }
}
export function writeValue(target, byteOffset, type, value) {
  const o = byteOffset >> 2;
  switch (type) {
    case `f32`:
      target[o] = typeof value === `boolean` ? Number(value) : value;
      return;
    case `u32`:
    case `i32`:
      new (type === `u32` ? Uint32Array : Int32Array)(target.buffer, target.byteOffset)[o] = value;
      return;
    case `vec2f`:
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        target[o] = value[0];
        target[o + 1] = value[1];
      } else {
        target[o] = value.x;
        target[o + 1] = value.y;
      }
      return;
    case `vec3f`:
      if (value.isColor) {
        target[o] = value.r;
        target[o + 1] = value.g;
        target[o + 2] = value.b;
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        target[o] = value[0];
        target[o + 1] = value[1];
        target[o + 2] = value[2];
      } else {
        target[o] = value.x;
        target[o + 1] = value.y;
        target[o + 2] = value.z;
      }
      return;
    case `vec4f`:
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        target[o] = value[0];
        target[o + 1] = value[1];
        target[o + 2] = value[2];
        target[o + 3] = value[3];
      } else {
        target[o] = value.x;
        target[o + 1] = value.y;
        target[o + 2] = value.z;
        target[o + 3] = value.w;
      }
      return;
    case `mat3x3f`: {
      const e = value.elements;
      target[o] = e[0];
      target[o + 1] = e[1];
      target[o + 2] = e[2];
      target[o + 4] = e[3];
      target[o + 5] = e[4];
      target[o + 6] = e[5];
      target[o + 8] = e[6];
      target[o + 9] = e[7];
      target[o + 10] = e[8];
      return;
    }
    case `mat4x4f`: {
      const e = value.elements ?? value;
      for (let i = 0; i < 16; i++) {
        target[o + i] = e[i];
      }
      return;
    }
    default:
      throw new Error(`Unsupported uniform type ${type}`);
  }
}
export class UniformBlock {
  constructor(layout) {
    this.layout = layout;
    this.data = new Float32Array(layout.size / 4);
    this.buffer = null;
  }
  set(name, value) {
    const field = this.layout.byName.get(name);
    if (field) {
      writeValue(this.data, field.offset, field.type, value);
    }
  }
  upload(device, label) {
    if (!this.buffer) {
      this.buffer = device.createBuffer({
        label,
        size: this.layout.size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(this.buffer, 0, this.data);
    return this.buffer;
  }
  destroy() {
    this.buffer?.destroy();
    this.buffer = null;
  }
}
