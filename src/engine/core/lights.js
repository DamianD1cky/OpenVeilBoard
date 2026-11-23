import { Color, Matrix4, Vector2, Vector3 } from "../math.js";
import { _target, _position } from "./internals.js";
import { Object3D } from "./objects.js";
import { OrthographicCamera } from "./cameras.js";
export class Light extends Object3D {
  constructor(color, intensity = 1) {
    super();
    this.type = `Light`;
    this.color = new Color(color ?? 16777215);
    this.intensity = intensity;
  }
}
Light.prototype.isLight = true;
export class AmbientLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = `AmbientLight`;
  }
}
AmbientLight.prototype.isAmbientLight = true;
export class DirectionalLightShadow {
  constructor() {
    this.camera = new OrthographicCamera(-5, 5, 5, -5, 0.5, 500);
    this.mapSize = new Vector2(512, 512);
    this.bias = 0;
    this.normalBias = 0;
    this.radius = 1;
    this.blurSamples = 8;
    this.intensity = 1;
    this.matrix = new Matrix4();
    this.autoUpdate = true;
    this.needsUpdate = false;
  }
  updateMatrices(light) {
    const camera = this.camera;
    _position.setFromMatrixPosition(light.matrixWorld);
    camera.position.copy(_position);
    _target.setFromMatrixPosition(light.target.matrixWorld);
    camera.lookAt(_target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
    this.matrix.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  }
}
export class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = `DirectionalLight`;
    this.position.copy(new Vector3(0, 1, 0));
    this.updateMatrix();
    this.target = new Object3D();
    this.shadow = new DirectionalLightShadow();
  }
}
DirectionalLight.prototype.isDirectionalLight = true;
export class PointLight extends Light {
  constructor(color, intensity, distance = 0, decay = 2) {
    super(color, intensity);
    this.type = `PointLight`;
    this.distance = distance;
    this.decay = decay;
  }
}
PointLight.prototype.isPointLight = true;
