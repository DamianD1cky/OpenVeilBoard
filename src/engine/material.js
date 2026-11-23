import { Color, Vector2 } from "./math.js";
import { FrontSide, BackSide, DoubleSide } from "./core.js";
export { FrontSide, BackSide, DoubleSide };
export const NoBlending = 0;
export const NormalBlending = 1;
export const AdditiveBlending = 2;
export const SubtractiveBlending = 3;
export const MultiplyBlending = 4;
export const CustomBlending = 5;
let materialId = 0;
export class Material {
  constructor() {
    this.id = materialId++;
    this.name = ``;
    this.type = `Material`;
    this.visible = true;
    this.transparent = false;
    this.opacity = 1;
    this.alphaTest = 0;
    this.blending = NormalBlending;
    this.blend = null;
    this.premultipliedAlpha = false;
    this.side = FrontSide;
    this.shadowSide = null;
    this.depthTest = true;
    this.depthWrite = true;
    this.depthCompare = `less-equal`;
    this.colorWrite = true;
    this.polygonOffset = false;
    this.polygonOffsetFactor = 0;
    this.polygonOffsetUnits = 0;
    this.toneMapped = true;
    this.forceSinglePass = false;
    this.fog = false;
    this.hooks = null;
    this.userData = {};
    this.version = 0;
    this._listeners = null;
  }
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
    }
  }
  get shaderKey() {
    return ``;
  }
  setValues(values) {
    if (!values) {
      return this;
    }
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }
      const current = this[key];
      if (current && current.isColor) {
        current.set(value);
      } else if (current && current.isVector2 && value.isVector2) {
        current.copy(value);
      } else if (current && current.isVector2 && Array.isArray(value)) {
        current.set(value[0], value[1]);
      } else {
        this[key] = value;
      }
    }
    return this;
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
Material.prototype.isMaterial = true;
const textureKey = (texture) => (texture ? `${texture.format ?? ``}${texture.colorSpace}` : `-`);
export class MeshBasicMaterial extends Material {
  constructor(values) {
    super();
    this.type = `MeshBasicMaterial`;
    this.color = new Color(16777215);
    this.map = null;
    this.alphaMap = null;
    this.setValues(values);
  }
  get shaderKey() {
    return `basic|${textureKey(this.map)}|${textureKey(this.alphaMap)}`;
  }
}
MeshBasicMaterial.prototype.isMeshBasicMaterial = true;
export class MeshStandardMaterial extends Material {
  constructor(values) {
    super();
    this.type = `MeshStandardMaterial`;
    this.color = new Color(16777215);
    this.roughness = 1;
    this.metalness = 0;
    this.map = null;
    this.alphaMap = null;
    this.roughnessMap = null;
    this.metalnessMap = null;
    this.normalMap = null;
    this.normalScale = new Vector2(1, 1);
    this.bumpMap = null;
    this.bumpScale = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.emissive = new Color(0);
    this.emissiveIntensity = 1;
    this.emissiveMap = null;
    this.envMapIntensity = 1;
    this.envMap = null;
    this.flatShading = false;
    this.setValues(values);
  }
  get lightingModel() {
    return `standard`;
  }
  get shaderKey() {
    return [
      this.lightingModel,
      textureKey(this.map),
      textureKey(this.alphaMap),
      textureKey(this.roughnessMap),
      textureKey(this.metalnessMap),
      textureKey(this.normalMap),
      textureKey(this.bumpMap),
      textureKey(this.aoMap),
      textureKey(this.emissiveMap),
      this.flatShading ? `flat` : ``,
      this.envMap ? `envM` : ``,
    ].join(`|`);
  }
}
MeshStandardMaterial.prototype.isMeshStandardMaterial = true;
export class MeshPhysicalMaterial extends MeshStandardMaterial {
  constructor(values) {
    super();
    this.type = `MeshPhysicalMaterial`;
    this.clearcoat = 0;
    this.clearcoatRoughness = 0;
    this.sheen = 0;
    this.sheenColor = new Color(0);
    this.sheenRoughness = 1;
    this.specularIntensity = 1;
    this.specularColor = new Color(1, 1, 1);
    this.ior = 1.5;
    this.anisotropy = 0;
    this.anisotropyRotation = 0;
    this.setValues(values);
  }
  get lightingModel() {
    return `physical`;
  }
  get shaderKey() {
    return `${super.shaderKey}|cc${this.clearcoat > 0 ? 1 : 0}|sh${this.sheen > 0 ? 1 : 0}|an${this.anisotropy > 0 ? 1 : 0}`;
  }
}
MeshPhysicalMaterial.prototype.isMeshPhysicalMaterial = true;
export class PassMaterial extends Material {
  constructor({ fragment, uniforms = {}, textures = {}, functions = ``, key = `` } = {}) {
    super();
    this.type = `PassMaterial`;
    this.depthTest = false;
    this.depthWrite = false;
    this.hooks = {
      fragment,
      uniforms,
      textures,
      functions,
      key,
    };
  }
}
