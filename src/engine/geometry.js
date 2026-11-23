import { Box3, Matrix3, Matrix4, Quaternion, Sphere, Vector2, Vector3, Vector4 } from "./math.js";
let geometryId = 0;
export const StaticDrawUsage = 35044;
export const DynamicDrawUsage = 35048;
export class BufferAttribute {
  constructor(array, itemSize, normalized = false) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array !== undefined ? array.length / itemSize : 0;
    this.normalized = normalized;
    this.usage = StaticDrawUsage;
    this.version = 0;
    this.updateRanges = [];
  }
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
    }
  }
  setUsage(usage) {
    this.usage = usage;
    return this;
  }
  getComponent(index, component) {
    return this.array[index * this.itemSize + component];
  }
  setComponent(index, component, value) {
    this.array[index * this.itemSize + component] = value;
  }
  getX(index) {
    return this.array[index * this.itemSize];
  }
  getY(index) {
    return this.array[index * this.itemSize + 1];
  }
  getZ(index) {
    return this.array[index * this.itemSize + 2];
  }
  getW(index) {
    return this.array[index * this.itemSize + 3];
  }
  setX(index, x) {
    this.array[index * this.itemSize] = x;
    return this;
  }
  setY(index, y) {
    this.array[index * this.itemSize + 1] = y;
    return this;
  }
  setZ(index, z) {
    this.array[index * this.itemSize + 2] = z;
    return this;
  }
  setW(index, w) {
    this.array[index * this.itemSize + 3] = w;
    return this;
  }
  setXY(index, x, y) {
    index *= this.itemSize;
    this.array[index] = x;
    this.array[index + 1] = y;
    return this;
  }
  setXYZ(index, x, y, z) {
    index *= this.itemSize;
    this.array[index] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    return this;
  }
  setXYZW(index, x, y, z, w) {
    index *= this.itemSize;
    this.array[index] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    this.array[index + 3] = w;
    return this;
  }
  set(value, offset = 0) {
    this.array.set(value, offset);
    return this;
  }
  copyArray(array) {
    this.array.set(array);
    return this;
  }
  applyMatrix3(m) {
    for (let i = 0; i < this.count; i++) {
      _v.fromBufferAttribute(this, i).applyMatrix3(m);
      this.setXYZ(i, _v.x, _v.y, _v.z);
    }
    return this;
  }
  applyMatrix4(m) {
    for (let i = 0; i < this.count; i++) {
      _v.fromBufferAttribute(this, i).applyMatrix4(m);
      this.setXYZ(i, _v.x, _v.y, _v.z);
    }
    return this;
  }
  applyNormalMatrix(m) {
    for (let i = 0; i < this.count; i++) {
      _v.fromBufferAttribute(this, i).applyNormalMatrix(m);
      this.setXYZ(i, _v.x, _v.y, _v.z);
    }
    return this;
  }
  transformDirection(m) {
    for (let i = 0; i < this.count; i++) {
      _v.fromBufferAttribute(this, i).transformDirection(m);
      this.setXYZ(i, _v.x, _v.y, _v.z);
    }
    return this;
  }
  clone() {
    const attribute = new BufferAttribute(this.array.slice(), this.itemSize, this.normalized);
    attribute.usage = this.usage;
    return attribute;
  }
}
BufferAttribute.prototype.isBufferAttribute = true;
export class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Float32Array(array), itemSize, normalized);
  }
}
export class Uint16BufferAttribute extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Uint16Array(array), itemSize, normalized);
  }
}
export class Uint32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(new Uint32Array(array), itemSize, normalized);
  }
}
export class InstancedBufferAttribute extends BufferAttribute {
  constructor(array, itemSize, normalized, meshPerAttribute = 1) {
    super(array, itemSize, normalized);
    this.meshPerAttribute = meshPerAttribute;
  }
}
InstancedBufferAttribute.prototype.isInstancedBufferAttribute = true;
const _v = new Vector3();
const _m = new Matrix4();
const _offset = new Vector3();
const _box = new Box3();
const _boxMorph = new Box3();
export class BufferGeometry {
  constructor() {
    this.id = geometryId++;
    this.type = `BufferGeometry`;
    this.index = null;
    this.attributes = {};
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    this.drawRange = {
      start: 0,
      count: Infinity,
    };
    this.userData = {};
    this.parameters = undefined;
    this._listeners = null;
  }
  getIndex() {
    return this.index;
  }
  setIndex(index) {
    if (Array.isArray(index)) {
      const max = index.reduce((m, v) => (v > m ? v : m), 0);
      this.index = new (max > 65535 ? Uint32BufferAttribute : Uint16BufferAttribute)(index, 1);
    } else {
      this.index = index;
    }
    return this;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }
  addGroup(start, count, materialIndex = 0) {
    this.groups.push({
      start,
      count,
      materialIndex,
    });
  }
  clearGroups() {
    this.groups = [];
  }
  setDrawRange(start, count) {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }
  applyMatrix4(matrix) {
    const position = this.attributes.position;
    if (position) {
      position.applyMatrix4(matrix);
      position.needsUpdate = true;
    }
    const normal = this.attributes.normal;
    if (normal) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      normal.applyNormalMatrix(normalMatrix);
      normal.needsUpdate = true;
    }
    const tangent = this.attributes.tangent;
    if (tangent) {
      for (let i = 0; i < tangent.count; i++) {
        _v.set(tangent.getX(i), tangent.getY(i), tangent.getZ(i)).transformDirection(matrix);
        tangent.setXYZ(i, _v.x, _v.y, _v.z);
      }
      tangent.needsUpdate = true;
    }
    if (this.boundingBox !== null) {
      this.computeBoundingBox();
    }
    if (this.boundingSphere !== null) {
      this.computeBoundingSphere();
    }
    return this;
  }
  applyQuaternion(q) {
    _m.makeRotationFromQuaternion(q);
    return this.applyMatrix4(_m);
  }
  rotateX(angle) {
    _m.makeRotationX(angle);
    return this.applyMatrix4(_m);
  }
  rotateY(angle) {
    _m.makeRotationY(angle);
    return this.applyMatrix4(_m);
  }
  rotateZ(angle) {
    _m.makeRotationZ(angle);
    return this.applyMatrix4(_m);
  }
  translate(x, y, z) {
    _m.makeTranslation(x, y, z);
    return this.applyMatrix4(_m);
  }
  scale(x, y, z) {
    _m.makeScale(x, y, z);
    return this.applyMatrix4(_m);
  }
  center() {
    this.computeBoundingBox();
    this.boundingBox.getCenter(_offset).negate();
    this.translate(_offset.x, _offset.y, _offset.z);
    return this;
  }
  setFromPoints(points) {
    const position = [];
    for (const p of points) {
      position.push(p.x, p.y, p.z ?? 0);
    }
    this.setAttribute(`position`, new Float32BufferAttribute(position, 3));
    return this;
  }
  computeBoundingBox() {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    const position = this.attributes.position;
    if (position) {
      this.boundingBox.setFromBufferAttribute(position);
    } else {
      this.boundingBox.makeEmpty();
    }
  }
  computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    const position = this.attributes.position;
    if (!position) {
      return;
    }
    const center = this.boundingSphere.center;
    _box.setFromBufferAttribute(position);
    _box.getCenter(center);
    let maxRadiusSq = 0;
    for (let i = 0, il = position.count; i < il; i++) {
      _v.fromBufferAttribute(position, i);
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_v));
    }
    this.boundingSphere.radius = Math.sqrt(maxRadiusSq);
    void _boxMorph;
  }
  computeTangents() {
    const index = this.index;
    const attributes = this.attributes;
    if (index === null || !attributes.position || !attributes.normal || !attributes.uv) {
      throw new Error(`computeTangents needs index, position, normal and uv`);
    }
    const positionAttribute = attributes.position;
    const normalAttribute = attributes.normal;
    const uvAttribute = attributes.uv;
    if (!this.hasAttribute(`tangent`)) {
      this.setAttribute(
        `tangent`,
        new BufferAttribute(new Float32Array(4 * positionAttribute.count), 4),
      );
    }
    const tangentAttribute = this.getAttribute(`tangent`);
    const tan1 = [];
    const tan2 = [];
    for (let i = 0; i < positionAttribute.count; i++) {
      tan1[i] = new Vector3();
      tan2[i] = new Vector3();
    }
    const vA = new Vector3(),
      vB = new Vector3(),
      vC = new Vector3();
    const uvA = new Vector2(),
      uvB = new Vector2(),
      uvC = new Vector2();
    const sdir = new Vector3(),
      tdir = new Vector3();
    function handleTriangle(a, b, c) {
      vA.fromBufferAttribute(positionAttribute, a);
      vB.fromBufferAttribute(positionAttribute, b);
      vC.fromBufferAttribute(positionAttribute, c);
      uvA.set(uvAttribute.getX(a), uvAttribute.getY(a));
      uvB.set(uvAttribute.getX(b), uvAttribute.getY(b));
      uvC.set(uvAttribute.getX(c), uvAttribute.getY(c));
      vB.sub(vA);
      vC.sub(vA);
      uvB.sub(uvA);
      uvC.sub(uvA);
      const r = 1 / (uvB.x * uvC.y - uvC.x * uvB.y);
      if (!Number.isFinite(r)) {
        return;
      }
      sdir.copy(vB).multiplyScalar(uvC.y).addScaledVector(vC, -uvB.y).multiplyScalar(r);
      tdir.copy(vC).multiplyScalar(uvB.x).addScaledVector(vB, -uvC.x).multiplyScalar(r);
      tan1[a].add(sdir);
      tan1[b].add(sdir);
      tan1[c].add(sdir);
      tan2[a].add(tdir);
      tan2[b].add(tdir);
      tan2[c].add(tdir);
    }
    let groups = this.groups;
    if (groups.length === 0) {
      groups = [
        {
          start: 0,
          count: index.count,
        },
      ];
    }
    for (const group of groups) {
      for (let j = group.start, jl = group.start + group.count; j < jl; j += 3) {
        handleTriangle(index.getX(j + 0), index.getX(j + 1), index.getX(j + 2));
      }
    }
    const tmp = new Vector3(),
      tmp2 = new Vector3();
    const n = new Vector3(),
      n2 = new Vector3();
    function handleVertex(v) {
      n.fromBufferAttribute(normalAttribute, v);
      n2.copy(n);
      const t = tan1[v];
      tmp.copy(t);
      tmp.sub(n.multiplyScalar(n.dot(t))).normalize();
      tmp2.crossVectors(n2, t);
      const test = tmp2.dot(tan2[v]);
      const w = test < 0 ? -1 : 1;
      tangentAttribute.setXYZW(v, tmp.x, tmp.y, tmp.z, w);
    }
    for (const group of groups) {
      for (let j = group.start, jl = group.start + group.count; j < jl; j += 3) {
        handleVertex(index.getX(j + 0));
        handleVertex(index.getX(j + 1));
        handleVertex(index.getX(j + 2));
      }
    }
  }
  computeVertexNormals() {
    const index = this.index;
    const positionAttribute = this.getAttribute(`position`);
    if (positionAttribute === undefined) {
      return;
    }
    let normalAttribute = this.getAttribute(`normal`);
    if (normalAttribute === undefined) {
      normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
      this.setAttribute(`normal`, normalAttribute);
    } else {
      normalAttribute.array.fill(0);
    }
    const pA = new Vector3(),
      pB = new Vector3(),
      pC = new Vector3();
    const nA = new Vector3(),
      nB = new Vector3(),
      nC = new Vector3();
    const cb = new Vector3(),
      ab = new Vector3();
    if (index) {
      for (let i = 0, il = index.count; i < il; i += 3) {
        const vA = index.getX(i + 0);
        const vB = index.getX(i + 1);
        const vC = index.getX(i + 2);
        pA.fromBufferAttribute(positionAttribute, vA);
        pB.fromBufferAttribute(positionAttribute, vB);
        pC.fromBufferAttribute(positionAttribute, vC);
        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab);
        nA.fromBufferAttribute(normalAttribute, vA);
        nB.fromBufferAttribute(normalAttribute, vB);
        nC.fromBufferAttribute(normalAttribute, vC);
        nA.add(cb);
        nB.add(cb);
        nC.add(cb);
        normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
        normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
        normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
      }
    } else {
      for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
        pA.fromBufferAttribute(positionAttribute, i + 0);
        pB.fromBufferAttribute(positionAttribute, i + 1);
        pC.fromBufferAttribute(positionAttribute, i + 2);
        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab);
        normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
        normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
        normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
      }
    }
    this.normalizeNormals();
    normalAttribute.needsUpdate = true;
  }
  normalizeNormals() {
    const normals = this.attributes.normal;
    for (let i = 0, il = normals.count; i < il; i++) {
      _v.fromBufferAttribute(normals, i);
      _v.normalize();
      normals.setXYZ(i, _v.x, _v.y, _v.z);
    }
  }
  toNonIndexed() {
    if (this.index === null) {
      return this;
    }
    const geometry = new BufferGeometry();
    const indices = this.index.array;
    for (const name of Object.keys(this.attributes)) {
      const attribute = this.attributes[name];
      const { array, itemSize, normalized } = attribute;
      const array2 = new array.constructor(indices.length * itemSize);
      let index = 0;
      let index2 = 0;
      for (let i = 0, l = indices.length; i < l; i++) {
        index = indices[i] * itemSize;
        for (let j = 0; j < itemSize; j++) {
          array2[index2++] = array[index++];
        }
      }
      geometry.setAttribute(name, new BufferAttribute(array2, itemSize, normalized));
    }
    for (const group of this.groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    return geometry;
  }
  clone() {
    const geometry = new BufferGeometry();
    if (this.index) {
      geometry.setIndex(this.index.clone());
    }
    for (const name of Object.keys(this.attributes)) {
      geometry.setAttribute(name, this.attributes[name].clone());
    }
    for (const group of this.groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    if (this.boundingBox) {
      geometry.boundingBox = this.boundingBox.clone();
    }
    if (this.boundingSphere) {
      geometry.boundingSphere = this.boundingSphere.clone();
    }
    geometry.drawRange.start = this.drawRange.start;
    geometry.drawRange.count = this.drawRange.count;
    geometry.userData = {
      ...this.userData,
    };
    return geometry;
  }
  addEventListener(type, listener) {
    (this._listeners ??= new Set()).add(listener);
  }
  removeEventListener(type, listener) {
    this._listeners?.delete(listener);
  }
  dispose() {
    if (this._listeners) {
      for (const listener of this._listeners) {
        listener({
          type: `dispose`,
          target: this,
        });
      }
    }
  }
}
BufferGeometry.prototype.isBufferGeometry = true;
export function mergeGeometries(geometries, useGroups = false) {
  const isIndexed = geometries[0].index !== null;
  const names = new Set(Object.keys(geometries[0].attributes));
  const attributes = {};
  const mergedGeometry = new BufferGeometry();
  let offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    const geometry = geometries[i];
    if (isIndexed !== (geometry.index !== null)) {
      return null;
    }
    for (const name in geometry.attributes) {
      if (!names.has(name)) {
        return null;
      }
      (attributes[name] ??= []).push(geometry.attributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) {
        count = geometry.index.count;
      } else if (geometry.attributes.position !== undefined) {
        count = geometry.attributes.position.count;
      } else {
        return null;
      }
      mergedGeometry.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndex = [];
    for (const geometry of geometries) {
      const index = geometry.index;
      for (let j = 0; j < index.count; ++j) {
        mergedIndex.push(index.getX(j) + indexOffset);
      }
      indexOffset += geometry.attributes.position.count;
    }
    mergedGeometry.setIndex(mergedIndex);
  }
  for (const name in attributes) {
    const list = attributes[name];
    const { itemSize, normalized } = list[0];
    const ArrayType = list[0].array.constructor;
    let length = 0;
    for (const attribute of list) {
      length += attribute.array.length;
    }
    const array = new ArrayType(length);
    let at = 0;
    for (const attribute of list) {
      array.set(attribute.array, at);
      at += attribute.array.length;
    }
    mergedGeometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
  }
  return mergedGeometry;
}
export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super();
    this.type = `PlaneGeometry`;
    this.parameters = {
      width,
      height,
      widthSegments,
      heightSegments,
    };
    const widthHalf = width / 2;
    const heightHalf = height / 2;
    const gridX = Math.floor(widthSegments);
    const gridY = Math.floor(heightSegments);
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
    const segmentWidth = width / gridX;
    const segmentHeight = height / gridY;
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf;
      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf;
        vertices.push(x, -y, 0);
        normals.push(0, 0, 1);
        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY);
      }
    }
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy;
        const b = ix + gridX1 * (iy + 1);
        const c = ix + 1 + gridX1 * (iy + 1);
        const d = ix + 1 + gridX1 * iy;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export class BoxGeometry extends BufferGeometry {
  constructor(
    width = 1,
    height = 1,
    depth = 1,
    widthSegments = 1,
    heightSegments = 1,
    depthSegments = 1,
  ) {
    super();
    this.type = `BoxGeometry`;
    this.parameters = {
      width,
      height,
      depth,
      widthSegments,
      heightSegments,
      depthSegments,
    };
    widthSegments = Math.floor(widthSegments);
    heightSegments = Math.floor(heightSegments);
    depthSegments = Math.floor(depthSegments);
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    let numberOfVertices = 0;
    let groupStart = 0;
    const buildPlane = (u, v, w, udir, vdir, w2, h2, depth2, gridX, gridY, materialIndex) => {
      const segmentWidth = w2 / gridX;
      const segmentHeight = h2 / gridY;
      const widthHalf = w2 / 2;
      const heightHalf = h2 / 2;
      const depthHalf = depth2 / 2;
      const gridX1 = gridX + 1;
      const gridY1 = gridY + 1;
      let vertexCounter = 0;
      let groupCount = 0;
      const vector = new Vector3();
      for (let iy = 0; iy < gridY1; iy++) {
        const y = iy * segmentHeight - heightHalf;
        for (let ix = 0; ix < gridX1; ix++) {
          const x = ix * segmentWidth - widthHalf;
          vector[u] = x * udir;
          vector[v] = y * vdir;
          vector[w] = depthHalf;
          vertices.push(vector.x, vector.y, vector.z);
          vector[u] = 0;
          vector[v] = 0;
          vector[w] = depth2 > 0 ? 1 : -1;
          normals.push(vector.x, vector.y, vector.z);
          uvs.push(ix / gridX);
          uvs.push(1 - iy / gridY);
          vertexCounter += 1;
        }
      }
      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = numberOfVertices + ix + gridX1 * iy;
          const b = numberOfVertices + ix + gridX1 * (iy + 1);
          const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
          const d = numberOfVertices + (ix + 1) + gridX1 * iy;
          indices.push(a, b, d);
          indices.push(b, c, d);
          groupCount += 6;
        }
      }
      this.addGroup(groupStart, groupCount, materialIndex);
      groupStart += groupCount;
      numberOfVertices += vertexCounter;
    };
    buildPlane(`z`, `y`, `x`, -1, -1, depth, height, width, depthSegments, heightSegments, 0);
    buildPlane(`z`, `y`, `x`, 1, -1, depth, height, -width, depthSegments, heightSegments, 1);
    buildPlane(`x`, `z`, `y`, 1, 1, width, depth, height, widthSegments, depthSegments, 2);
    buildPlane(`x`, `z`, `y`, 1, -1, width, depth, -height, widthSegments, depthSegments, 3);
    buildPlane(`x`, `y`, `z`, 1, -1, width, height, depth, widthSegments, heightSegments, 4);
    buildPlane(`x`, `y`, `z`, -1, -1, width, height, -depth, widthSegments, heightSegments, 5);
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export class CylinderGeometry extends BufferGeometry {
  constructor(
    radiusTop = 1,
    radiusBottom = 1,
    height = 1,
    radialSegments = 32,
    heightSegments = 1,
    openEnded = false,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ) {
    super();
    this.type = `CylinderGeometry`;
    this.parameters = {
      radiusTop,
      radiusBottom,
      height,
      radialSegments,
      heightSegments,
      openEnded,
      thetaStart,
      thetaLength,
    };
    radialSegments = Math.floor(radialSegments);
    heightSegments = Math.floor(heightSegments);
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    let index = 0;
    const indexArray = [];
    const halfHeight = height / 2;
    let groupStart = 0;
    const generateTorso = () => {
      const normal = new Vector3();
      const vertex = new Vector3();
      let groupCount = 0;
      const slope = (radiusBottom - radiusTop) / height;
      for (let y = 0; y <= heightSegments; y++) {
        const indexRow = [];
        const v = y / heightSegments;
        const radius = v * (radiusBottom - radiusTop) + radiusTop;
        for (let x = 0; x <= radialSegments; x++) {
          const u = x / radialSegments;
          const theta = u * thetaLength + thetaStart;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);
          vertex.x = radius * sinTheta;
          vertex.y = -v * height + halfHeight;
          vertex.z = radius * cosTheta;
          vertices.push(vertex.x, vertex.y, vertex.z);
          normal.set(sinTheta, slope, cosTheta).normalize();
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(u, 1 - v);
          indexRow.push(index++);
        }
        indexArray.push(indexRow);
      }
      for (let x = 0; x < radialSegments; x++) {
        for (let y = 0; y < heightSegments; y++) {
          const a = indexArray[y][x];
          const b = indexArray[y + 1][x];
          const c = indexArray[y + 1][x + 1];
          const d = indexArray[y][x + 1];
          if (radiusTop > 0 || y !== 0) {
            indices.push(a, b, d);
            groupCount += 3;
          }
          if (radiusBottom > 0 || y !== heightSegments - 1) {
            indices.push(b, c, d);
            groupCount += 3;
          }
        }
      }
      this.addGroup(groupStart, groupCount, 0);
      groupStart += groupCount;
    };
    const generateCap = (top) => {
      const centerIndexStart = index;
      const uv = new Vector2();
      const vertex = new Vector3();
      let groupCount = 0;
      const radius = top === true ? radiusTop : radiusBottom;
      const sign = top === true ? 1 : -1;
      for (let x = 1; x <= radialSegments; x++) {
        vertices.push(0, halfHeight * sign, 0);
        normals.push(0, sign, 0);
        uvs.push(0.5, 0.5);
        index++;
      }
      const centerIndexEnd = index;
      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * thetaLength + thetaStart;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        vertex.x = radius * sinTheta;
        vertex.y = halfHeight * sign;
        vertex.z = radius * cosTheta;
        vertices.push(vertex.x, vertex.y, vertex.z);
        normals.push(0, sign, 0);
        uv.x = cosTheta * 0.5 + 0.5;
        uv.y = sinTheta * 0.5 * sign + 0.5;
        uvs.push(uv.x, uv.y);
        index++;
      }
      for (let x = 0; x < radialSegments; x++) {
        const c = centerIndexStart + x;
        const i = centerIndexEnd + x;
        if (top === true) {
          indices.push(i, i + 1, c);
        } else {
          indices.push(i + 1, i, c);
        }
        groupCount += 3;
      }
      this.addGroup(groupStart, groupCount, top === true ? 1 : 2);
      groupStart += groupCount;
    };
    generateTorso();
    if (openEnded === false) {
      if (radiusTop > 0) {
        generateCap(true);
      }
      if (radiusBottom > 0) {
        generateCap(false);
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export class SphereGeometry extends BufferGeometry {
  constructor(
    radius = 1,
    widthSegments = 32,
    heightSegments = 16,
    phiStart = 0,
    phiLength = Math.PI * 2,
    thetaStart = 0,
    thetaLength = Math.PI,
  ) {
    super();
    this.type = `SphereGeometry`;
    this.parameters = {
      radius,
      widthSegments,
      heightSegments,
      phiStart,
      phiLength,
      thetaStart,
      thetaLength,
    };
    widthSegments = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));
    const thetaEnd = Math.min(thetaStart + thetaLength, Math.PI);
    let index = 0;
    const grid = [];
    const vertex = new Vector3();
    const normal = new Vector3();
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    for (let iy = 0; iy <= heightSegments; iy++) {
      const verticesRow = [];
      const v = iy / heightSegments;
      let uOffset = 0;
      if (iy === 0 && thetaStart === 0) {
        uOffset = 0.5 / widthSegments;
      } else if (iy === heightSegments && thetaEnd === Math.PI) {
        uOffset = -0.5 / widthSegments;
      }
      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        vertex.x =
          -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        vertex.y = radius * Math.cos(thetaStart + v * thetaLength);
        vertex.z =
          radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        vertices.push(vertex.x, vertex.y, vertex.z);
        normal.copy(vertex).normalize();
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(u + uOffset, 1 - v);
        verticesRow.push(index++);
      }
      grid.push(verticesRow);
    }
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];
        if (iy !== 0 || thetaStart > 0) {
          indices.push(a, b, d);
        }
        if (iy !== heightSegments - 1 || thetaEnd < Math.PI) {
          indices.push(b, c, d);
        }
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export class RingGeometry extends BufferGeometry {
  constructor(
    innerRadius = 0.5,
    outerRadius = 1,
    thetaSegments = 32,
    phiSegments = 1,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ) {
    super();
    this.type = `RingGeometry`;
    this.parameters = {
      innerRadius,
      outerRadius,
      thetaSegments,
      phiSegments,
      thetaStart,
      thetaLength,
    };
    thetaSegments = Math.max(3, thetaSegments);
    phiSegments = Math.max(1, phiSegments);
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];
    let radius = innerRadius;
    const radiusStep = (outerRadius - innerRadius) / phiSegments;
    const vertex = new Vector3();
    const uv = new Vector2();
    for (let j = 0; j <= phiSegments; j++) {
      for (let i = 0; i <= thetaSegments; i++) {
        const segment = thetaStart + (i / thetaSegments) * thetaLength;
        vertex.x = radius * Math.cos(segment);
        vertex.y = radius * Math.sin(segment);
        vertices.push(vertex.x, vertex.y, vertex.z);
        normals.push(0, 0, 1);
        uv.x = (vertex.x / outerRadius + 1) / 2;
        uv.y = (vertex.y / outerRadius + 1) / 2;
        uvs.push(uv.x, uv.y);
      }
      radius += radiusStep;
    }
    for (let j = 0; j < phiSegments; j++) {
      const thetaSegmentLevel = j * (thetaSegments + 1);
      for (let i = 0; i < thetaSegments; i++) {
        const segment = i + thetaSegmentLevel;
        const a = segment;
        const b = segment + thetaSegments + 1;
        const c = segment + thetaSegments + 2;
        const d = segment + 1;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export class CircleGeometry extends BufferGeometry {
  constructor(radius = 1, segments = 32, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    this.type = `CircleGeometry`;
    this.parameters = {
      radius,
      segments,
      thetaStart,
      thetaLength,
    };
    segments = Math.max(3, segments);
    const indices = [];
    const vertices = [0, 0, 0];
    const normals = [0, 0, 1];
    const uvs = [0.5, 0.5];
    for (let s = 0, i = 3; s <= segments; s++, i += 3) {
      const segment = thetaStart + (s / segments) * thetaLength;
      const x = radius * Math.cos(segment);
      const y = radius * Math.sin(segment);
      vertices.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push((x / radius + 1) / 2, (y / radius + 1) / 2);
    }
    for (let i = 1; i <= segments; i++) {
      indices.push(i, i + 1, 0);
    }
    this.setIndex(indices);
    this.setAttribute(`position`, new Float32BufferAttribute(vertices, 3));
    this.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
    this.setAttribute(`uv`, new Float32BufferAttribute(uvs, 2));
  }
}
export { Vector4, Quaternion };
