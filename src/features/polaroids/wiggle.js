import { Object3D, Quaternion, Vector3 } from "../../engine/index.js";
const defaultOptions = {
  velocity: 0.1,
  maxStretch: 0.1,
};
const goalPosition = new Vector3();
const v1 = new Vector3();
function createHelper() {
  const helper = new Object3D();
  const child = new Object3D();
  child.position.y = -0.1;
  helper.add(child);
  return helper;
}
function cloneBone(bone) {
  const copy = new bone.constructor();
  copy.name = bone.name;
  copy.up.copy(bone.up);
  copy.position.copy(bone.position);
  copy.rotation.order = bone.rotation.order;
  copy.quaternion.copy(bone.quaternion);
  copy.scale.copy(bone.scale);
  copy.matrix.copy(bone.matrix);
  copy.matrixWorld.copy(bone.matrixWorld);
  copy.matrixAutoUpdate = bone.matrixAutoUpdate;
  copy.visible = bone.visible;
  copy.userData = JSON.parse(JSON.stringify(bone.userData));
  return copy;
}
export class WiggleBone {
  constructor(target, options = {}) {
    this.options = {
      ...defaultOptions,
      ...options,
    };
    const wrapper = cloneBone(target);
    target.parent.add(wrapper);
    wrapper.add(target);
    this.target = target;
    this.targetHelper = createHelper();
    this.currentHelper = createHelper();
    this._isFirstStep = true;
    this.originPosition = target.position.clone();
    this.originRotation = target.rotation.clone();
    this.oldBoneWorldPosition = new Vector3();
    this.oldBoneWorldRotation = new Quaternion();
    this.target.position.set(0, 0, 0);
    this.target.updateMatrixWorld(true);
    this.oldBoneWorldPosition.copy(this.originPosition);
    this.target.parent.localToWorld(this.oldBoneWorldPosition);
    this.target.getWorldQuaternion(this.oldBoneWorldRotation);
    this.restLength = this.target.parent.position.length();
  }
  reset() {
    this._isFirstStep = true;
    this.target.position.set(0, 0, 0);
    this.target.rotation.copy(this.originRotation);
    this.target.updateMatrixWorld(true);
    this.oldBoneWorldPosition.copy(this.originPosition);
    this.target.parent.localToWorld(this.oldBoneWorldPosition);
  }
  dispose() {
    this.reset();
    const wrapper = this.target.parent;
    const parent = wrapper.parent;
    parent.remove(wrapper);
    this.target.position.copy(this.originPosition);
    parent.add(this.target);
  }
  update(dt = null) {
    if (dt === null || dt === undefined) {
      if (this.ms) {
        const ms = performance.now();
        dt = (ms - this.ms) / 1e3;
        this.ms = ms;
      } else {
        this.ms = performance.now();
        dt = 1 / 60;
      }
    }
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }
    this.step(Math.min(dt, 0.1));
  }
  step(dt) {
    this.target.parent.updateMatrixWorld(true);
    this.targetHelper.position.copy(this.originPosition);
    this.target.parent.localToWorld(this.targetHelper.position);
    if (this._isFirstStep) {
      this._isFirstStep = false;
      this.oldBoneWorldPosition.copy(this.targetHelper.position);
    }
    const response = Math.min(this.options.velocity * 0.85, 0.99999);
    const alpha = 1 - Math.pow(1 - response, dt * 120);
    goalPosition
      .copy(this.oldBoneWorldPosition)
      .lerp(this.targetHelper.position, alpha);
    this.target.position.copy(goalPosition);
    this.target.parent.worldToLocal(this.target.position);
    this.oldBoneWorldPosition.copy(goalPosition);
    const parentPosition = this.target.parent.getWorldPosition(v1);
    this.currentHelper.position.copy(goalPosition);
    this.currentHelper.updateMatrixWorld(true);
    this.currentHelper.lookAt(parentPosition);
    const unit = this.target.position.clone();
    unit.normalize();
    this.target.up.set(0, 1, 0);
    this.target.quaternion.setFromUnitVectors(this.target.up, unit);
    this.target.position.set(0, 0, 0);
    this.target.updateMatrix();
  }
}
export class WiggleRig {
  constructor(skeleton, { multiplier = 1 } = {}) {
    this.wiggleBones = [];
    skeleton.bones.forEach((bone) => {
      if (bone.userData.wiggleVelocity) {
        this.wiggleBones.push(
          new WiggleBone(bone, {
            velocity: bone.userData.wiggleVelocity * multiplier,
          }),
        );
      }
    });
  }
  reset() {
    this.wiggleBones.forEach((wb) => wb.reset());
  }
  dispose() {
    this.wiggleBones.forEach((wb) => wb.dispose());
    this.wiggleBones = [];
  }
  update(dt) {
    if (!dt) {
      if (this.ms) {
        const ms = performance.now();
        dt = ms - this.ms;
        dt /= 1e3;
        this.ms = ms;
      } else {
        this.ms = performance.now();
        dt = 16 / 1e3;
      }
    }
    this.wiggleBones.forEach((bone) => bone.update(dt));
  }
}
