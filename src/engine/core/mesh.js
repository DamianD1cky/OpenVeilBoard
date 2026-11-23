import { Matrix4, Ray, Sphere, Triangle, Vector2, Vector3 } from "../math.js";
import { Object3D } from "./objects.js";
const _inverseMatrix = new Matrix4();
const _ray = new Ray();
const _sphere = new Sphere();
const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _intersection = new Vector3();
const _intersectionWorld = new Vector3();
const _bary = new Vector3();
const _uvA = new Vector2();
const _uvB = new Vector2();
const _uvC = new Vector2();
export const FrontSide = 0;
export const BackSide = 1;
export const DoubleSide = 2;
export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.type = `Mesh`;
    this.geometry = geometry;
    this.material = material;
    this.uniforms = null;
  }
  getVertexPosition(index, target) {
    return target.fromBufferAttribute(this.geometry.attributes.position, index);
  }
  raycast(raycaster, intersects) {
    const geometry = this.geometry;
    const material = this.material;
    if (!geometry || !material) {
      return;
    }
    if (geometry.boundingSphere === null) {
      geometry.computeBoundingSphere();
    }
    _sphere.copy(geometry.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(_sphere)) {
      return;
    }
    _inverseMatrix.copy(this.matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix);
    if (geometry.boundingBox !== null && !_ray.intersectsBox(geometry.boundingBox)) {
      return;
    }
    const index = geometry.index;
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const side = Array.isArray(material) ? material[0].side : material.side;
    const range = geometry.drawRange;
    const test = (a, b, c) => {
      this.getVertexPosition(a, _vA);
      this.getVertexPosition(b, _vB);
      this.getVertexPosition(c, _vC);
      const hit =
        side === BackSide
          ? _ray.intersectTriangle(_vC, _vB, _vA, true, _intersection)
          : _ray.intersectTriangle(_vA, _vB, _vC, side === FrontSide, _intersection);
      if (hit === null) {
        return;
      }
      _intersectionWorld.copy(_intersection).applyMatrix4(this.matrixWorld);
      const distance = raycaster.ray.origin.distanceTo(_intersectionWorld);
      if (distance < raycaster.near || distance > raycaster.far) {
        return;
      }
      const result = {
        distance,
        point: _intersectionWorld.clone(),
        object: this,
        face: {
          a,
          b,
          c,
        },
      };
      if (uv) {
        Triangle.getBarycoord(_intersection, _vA, _vB, _vC, _bary);
        _uvA.fromArray([uv.getX(a), uv.getY(a)]);
        _uvB.fromArray([uv.getX(b), uv.getY(b)]);
        _uvC.fromArray([uv.getX(c), uv.getY(c)]);
        result.uv = new Vector2()
          .addScaledVector(_uvA, _bary.x)
          .addScaledVector(_uvB, _bary.y)
          .addScaledVector(_uvC, _bary.z);
      }
      intersects.push(result);
    };
    const start = Math.max(0, range.start);
    if (index) {
      const end = Math.min(index.count, range.start + range.count);
      for (let i = start; i < end; i += 3) {
        test(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      const end = Math.min(position.count, range.start + range.count);
      for (let i = start; i < end; i += 3) {
        test(i, i + 1, i + 2);
      }
    }
  }
}
Mesh.prototype.isMesh = true;
export class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.type = `InstancedMesh`;
    this.count = count;
  }
}
InstancedMesh.prototype.isInstancedMesh = true;
export {
  _inverseMatrix,
  _ray,
  _sphere,
  _vA,
  _vB,
  _vC,
  _intersection,
  _intersectionWorld,
  _bary,
  _uvA,
  _uvB,
  _uvC,
};
