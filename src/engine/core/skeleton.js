import { Matrix4, Vector3 } from "../math.js";
import { Object3D } from "./objects.js";
import { Mesh } from "./mesh.js";
export class Bone extends Object3D {
  constructor() {
    super();
    this.type = `Bone`;
  }
}
Bone.prototype.isBone = true;
const _offsetMatrix = new Matrix4();
const _identity = new Matrix4();
export class Skeleton {
  constructor(bones = [], boneInverses = []) {
    this.bones = bones.slice();
    this.boneInverses = boneInverses;
    this.boneMatrices = new Float32Array(this.bones.length * 16);
    if (boneInverses.length === 0) {
      this.calculateInverses();
    }
  }
  calculateInverses() {
    this.boneInverses.length = 0;
    for (const bone of this.bones) {
      const inverse = new Matrix4();
      if (bone) {
        inverse.copy(bone.matrixWorld).invert();
      }
      this.boneInverses.push(inverse);
    }
  }
  pose() {
    this.bones.forEach((bone, i) => bone?.matrixWorld.copy(this.boneInverses[i]).invert());
    for (const bone of this.bones) {
      if (!bone) {
        continue;
      }
      if (bone.parent && bone.parent.isBone) {
        bone.matrix.copy(bone.parent.matrixWorld).invert();
        bone.matrix.multiply(bone.matrixWorld);
      } else {
        bone.matrix.copy(bone.matrixWorld);
      }
      bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    }
  }
  update() {
    const bones = this.bones;
    for (let i = 0; i < bones.length; i++) {
      const matrix = bones[i] ? bones[i].matrixWorld : _identity;
      _offsetMatrix.multiplyMatrices(matrix, this.boneInverses[i]);
      _offsetMatrix.toArray(this.boneMatrices, i * 16);
    }
  }
}
const _skinIndex = [0, 0, 0, 0];
const _skinWeight = [0, 0, 0, 0];
const _basePosition = new Vector3();
const _skinned = new Vector3();
const _boneMatrix = new Matrix4();
export class SkinnedMesh extends Mesh {
  constructor(geometry, material) {
    super(geometry, material);
    this.type = `SkinnedMesh`;
    this.bindMode = `attached`;
    this.bindMatrix = new Matrix4();
    this.bindMatrixInverse = new Matrix4();
    this.skeleton = null;
  }
  bind(skeleton, bindMatrix) {
    this.skeleton = skeleton;
    if (bindMatrix === undefined) {
      this.updateMatrixWorld(true);
      this.skeleton.calculateInverses();
      bindMatrix = this.matrixWorld;
    }
    this.bindMatrix.copy(bindMatrix);
    this.bindMatrixInverse.copy(bindMatrix).invert();
  }
  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    if (this.bindMode === `attached`) {
      this.bindMatrixInverse.copy(this.matrixWorld).invert();
    }
  }
  getVertexPosition(index, target) {
    const skeleton = this.skeleton;
    const geometry = this.geometry;
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    _basePosition
      .fromBufferAttribute(geometry.attributes.position, index)
      .applyMatrix4(this.bindMatrix);
    target.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      _skinIndex[i] = skinIndex.getComponent(index, i);
      _skinWeight[i] = skinWeight.getComponent(index, i);
    }
    for (let i = 0; i < 4; i++) {
      const weight = _skinWeight[i];
      if (weight === 0) {
        continue;
      }
      const boneIndex = _skinIndex[i];
      _boneMatrix.multiplyMatrices(
        skeleton.bones[boneIndex].matrixWorld,
        skeleton.boneInverses[boneIndex],
      );
      target.addScaledVector(_skinned.copy(_basePosition).applyMatrix4(_boneMatrix), weight);
    }
    return target.applyMatrix4(this.bindMatrixInverse);
  }
}
SkinnedMesh.prototype.isSkinnedMesh = true;
export { _offsetMatrix, _identity, _skinIndex, _skinWeight, _basePosition, _skinned, _boneMatrix };
