import { Euler, Matrix4, Quaternion, Vector3 } from "../math.js";
import { _target, _position } from "./internals.js";
let objectId = 0;
const _m1 = new Matrix4();
const _q1 = new Quaternion();
const _xAxis = new Vector3(1, 0, 0);
const _yAxis = new Vector3(0, 1, 0);
const _zAxis = new Vector3(0, 0, 1);
export class Object3D {
  constructor() {
    this.id = objectId++;
    this.name = ``;
    this.type = `Object3D`;
    this.parent = null;
    this.children = [];
    this.up = new Vector3(0, 1, 0);
    const position = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    rotation._onChangeCallback(() => quaternion.setFromEuler(rotation, false));
    quaternion._onChangeCallback(() => rotation.setFromQuaternion(quaternion, undefined, false));
    this.position = position;
    this.rotation = rotation;
    this.quaternion = quaternion;
    this.scale = scale;
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = true;
    this.matrixWorldAutoUpdate = true;
    this.matrixWorldNeedsUpdate = false;
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.userData = {};
    this.handlers = null;
  }
  on(type, handler) {
    (this.handlers ??= {})[type] = handler;
    return this;
  }
  off(type) {
    if (this.handlers) {
      delete this.handlers[type];
    }
    return this;
  }
  applyMatrix4(matrix) {
    if (this.matrixAutoUpdate) {
      this.updateMatrix();
    }
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }
  applyQuaternion(q) {
    this.quaternion.premultiply(q);
    return this;
  }
  setRotationFromAxisAngle(axis, angle) {
    this.quaternion.setFromAxisAngle(axis, angle);
  }
  setRotationFromEuler(euler) {
    this.quaternion.setFromEuler(euler, true);
  }
  setRotationFromQuaternion(q) {
    this.quaternion.copy(q);
  }
  rotateOnAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }
  rotateOnWorldAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }
  rotateX(angle) {
    return this.rotateOnAxis(_xAxis, angle);
  }
  rotateY(angle) {
    return this.rotateOnAxis(_yAxis, angle);
  }
  rotateZ(angle) {
    return this.rotateOnAxis(_zAxis, angle);
  }
  translateOnAxis(axis, distance) {
    _target.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_target.multiplyScalar(distance));
    return this;
  }
  translateX(distance) {
    return this.translateOnAxis(_xAxis, distance);
  }
  translateY(distance) {
    return this.translateOnAxis(_yAxis, distance);
  }
  translateZ(distance) {
    return this.translateOnAxis(_zAxis, distance);
  }
  localToWorld(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }
  worldToLocal(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1.copy(this.matrixWorld).invert());
  }
  lookAt(x, y, z) {
    if (x.isVector3) {
      _target.copy(x);
    } else {
      _target.set(x, y, z);
    }
    const parent = this.parent;
    this.updateWorldMatrix(true, false);
    _position.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) {
      _m1.lookAt(_position, _target, this.up);
    } else {
      _m1.lookAt(_target, _position, this.up);
    }
    this.quaternion.setFromRotationMatrix(_m1);
    if (parent) {
      _m1.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1);
      this.quaternion.premultiply(_q1.invert());
    }
  }
  add(...objects) {
    for (const object of objects) {
      if (object === this || !object) {
        continue;
      }
      if (object.parent) {
        object.parent.remove(object);
      }
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }
  remove(...objects) {
    for (const object of objects) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        object.parent = null;
        this.children.splice(index, 1);
      }
    }
    return this;
  }
  removeFromParent() {
    this.parent?.remove(this);
    return this;
  }
  clear() {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children.length = 0;
    return this;
  }
  attach(object) {
    this.updateWorldMatrix(true, false);
    _m1.copy(this.matrixWorld).invert();
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      _m1.multiply(object.parent.matrixWorld);
    }
    object.applyMatrix4(_m1);
    object.removeFromParent();
    object.parent = this;
    this.children.push(object);
    object.updateWorldMatrix(false, true);
    return this;
  }
  getObjectByName(name) {
    if (this.name === name) {
      return this;
    }
    for (const child of this.children) {
      const found = child.getObjectByName(name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }
  getWorldQuaternion(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position, target, _target);
    return target;
  }
  getWorldScale(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position, _q1, target);
    return target;
  }
  getWorldDirection(target) {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }
  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      children[i].traverse(callback);
    }
  }
  traverseVisible(callback) {
    if (!this.visible) {
      return;
    }
    callback(this);
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      children[i].traverseVisible(callback);
    }
  }
  traverseAncestors(callback) {
    if (this.parent) {
      callback(this.parent);
      this.parent.traverseAncestors(callback);
    }
  }
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) {
      this.updateMatrix();
    }
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate) {
        if (this.parent === null) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      children[i].updateMatrixWorld(force);
    }
  }
  updateWorldMatrix(updateParents, updateChildren) {
    if (updateParents && this.parent) {
      this.parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) {
      this.updateMatrix();
    }
    if (this.matrixWorldAutoUpdate) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
    }
    if (updateChildren) {
      for (const child of this.children) {
        child.updateWorldMatrix(false, true);
      }
    }
  }
  raycast() {}
}
Object3D.prototype.isObject3D = true;
export class Group extends Object3D {
  constructor() {
    super();
    this.type = `Group`;
  }
}
Group.prototype.isGroup = true;
export class Scene extends Object3D {
  constructor() {
    super();
    this.type = `Scene`;
    this.background = null;
    this.environment = null;
    this.environmentIntensity = 1;
    this.environmentRotation = new Euler();
    this.matrixAutoUpdate = true;
  }
}
Scene.prototype.isScene = true;
export { objectId, _m1, _q1, _xAxis, _yAxis, _zAxis };
