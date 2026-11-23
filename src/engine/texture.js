import { Matrix3, Vector2 } from "./math.js";
import { loadWithRetries, LoadHttpError } from "../shared/loadRetry.js";
import { takeSceneFile } from "../shared/sceneFiles.js";
export const RepeatWrapping = `repeat`;
export const ClampToEdgeWrapping = `clamp-to-edge`;
export const MirroredRepeatWrapping = `mirror-repeat`;
export const NearestFilter = `nearest`;
export const LinearFilter = `linear`;
export const NearestMipmapNearestFilter = `nearest-mipmap-nearest`;
export const LinearMipmapNearestFilter = `linear-mipmap-nearest`;
export const NearestMipmapLinearFilter = `nearest-mipmap-linear`;
export const LinearMipmapLinearFilter = `linear-mipmap-linear`;
export { SRGBColorSpace, NoColorSpace, LinearSRGBColorSpace } from "./math.js";
let textureId = 0;
export class Texture {
  constructor(image = null) {
    this.id = textureId++;
    this.name = ``;
    this.image = image;
    this.wrapS = ClampToEdgeWrapping;
    this.wrapT = ClampToEdgeWrapping;
    this.magFilter = LinearFilter;
    this.minFilter = LinearMipmapLinearFilter;
    this.anisotropy = 1;
    this.colorSpace = ``;
    this.flipY = true;
    this.premultiplyAlpha = false;
    this.generateMipmaps = true;
    this.format = null;
    this.offset = new Vector2(0, 0);
    this.repeat = new Vector2(1, 1);
    this.center = new Vector2(0, 0);
    this.rotation = 0;
    this.matrix = new Matrix3();
    this.matrixAutoUpdate = true;
    this.version = 0;
    this.userData = {};
    this._listeners = null;
  }
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
    }
  }
  get width() {
    return this.image?.videoWidth || this.image?.width || 0;
  }
  get height() {
    return this.image?.videoHeight || this.image?.height || 0;
  }
  updateMatrix() {
    this.matrix.setUvTransform(
      this.offset.x,
      this.offset.y,
      this.repeat.x,
      this.repeat.y,
      this.rotation,
      this.center.x,
      this.center.y,
    );
  }
  clone() {
    const texture = new this.constructor(this.image);
    for (const key of [
      `wrapS`,
      `wrapT`,
      `magFilter`,
      `minFilter`,
      `anisotropy`,
      `colorSpace`,
      `flipY`,
      `premultiplyAlpha`,
      `generateMipmaps`,
      `format`,
      `rotation`,
      `name`,
    ]) {
      texture[key] = this[key];
    }
    texture.offset.copy(this.offset);
    texture.repeat.copy(this.repeat);
    texture.center.copy(this.center);
    texture.needsUpdate = true;
    return texture;
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
Texture.prototype.isTexture = true;
export class DataTexture extends Texture {
  constructor(data = null, width = 1, height = 1, format = `rgba8unorm`) {
    super({
      data,
      width,
      height,
    });
    this.format = format;
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.generateMipmaps = false;
    this.flipY = false;
  }
}
DataTexture.prototype.isDataTexture = true;
export class CanvasTexture extends Texture {
  constructor(canvas) {
    super(canvas);
    this.needsUpdate = true;
  }
}
CanvasTexture.prototype.isCanvasTexture = true;
export class VideoTexture extends Texture {
  constructor(video) {
    super(video);
    this.minFilter = LinearFilter;
    this.magFilter = LinearFilter;
    this.generateMipmaps = false;
    this._frameRequested = false;
    this._lastTime = -1;
    const schedule = () => {
      if (!(`requestVideoFrameCallback` in video)) {
        return;
      }
      video.requestVideoFrameCallback(() => {
        this.needsUpdate = true;
        schedule();
      });
    };
    schedule();
  }
  update() {
    const video = this.image;
    if (`requestVideoFrameCallback` in video) {
      return;
    }
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.currentTime !== this._lastTime) {
      this._lastTime = video.currentTime;
      this.needsUpdate = true;
    }
  }
}
VideoTexture.prototype.isVideoTexture = true;
export class RenderTargetTexture extends Texture {
  constructor(target, index = 0) {
    super(null);
    this.target = target;
    this.index = index;
    this.generateMipmaps = false;
    this.minFilter = LinearFilter;
    this.flipY = false;
  }
  get width() {
    return this.target.width;
  }
  get height() {
    return this.target.height;
  }
}
RenderTargetTexture.prototype.isRenderTargetTexture = true;
export class LoadingManager {
  constructor() {
    this.loading = 0;
    this.loaded = 0;
    this.total = 0;
    this.onStart = null;
    this.onProgress = null;
    this.onLoad = null;
    this.onError = null;
    this.abortController = new AbortController();
  }
  itemStart(url) {
    this.total++;
    if (this.loading === 0) {
      this.onStart?.(url, this.loaded, this.total);
    }
    this.loading++;
  }
  itemEnd(url) {
    this.loaded++;
    this.loading--;
    this.onProgress?.(url, this.loaded, this.total);
    if (this.loading === 0) {
      this.onLoad?.();
    }
  }
  itemError(url) {
    this.onError?.(url);
  }
  resolveURL(url) {
    return url;
  }
}
export const DefaultLoadingManager = new LoadingManager();
const bitmapCache = new Map();
export function loadImageBitmap(
  url,
  { flipY = true, manager = DefaultLoadingManager, cache = true } = {},
) {
  const key = `${url}|${flipY}`;
  if (cache && bitmapCache.has(key)) {
    return bitmapCache.get(key);
  }
  const promise = new Promise((resolve, reject) => {
    loadWithRetries({
      manager,
      items: [url],
      attempt: (done, fail) => {
        (
          takeSceneFile(url) ??
          fetch(url, {
            credentials: `same-origin`,
          }).then((response) => {
            if (!response.ok) {
              throw new LoadHttpError(url, response.status);
            }
            return response.blob();
          })
        )
          .then((blob) =>
            createImageBitmap(blob, {
              imageOrientation: flipY ? `flipY` : `from-image`,
              premultiplyAlpha: `none`,
              colorSpaceConversion: `none`,
            }),
          )
          .then(done, fail);
      },
      onLoad: resolve,
      onError: reject,
    });
  });
  if (cache) {
    bitmapCache.set(key, promise);
  }
  return promise;
}
export function loadImageElement(url, manager = DefaultLoadingManager) {
  return new Promise((resolve, reject) => {
    manager.itemStart(url);
    const image = new Image();
    image.decoding = `async`;
    image.onload = () => {
      manager.itemEnd(url);
      resolve(image);
    };
    image.onerror = (error) => {
      manager.itemError(url);
      manager.itemEnd(url);
      reject(error);
    };
    image.src = url;
  });
}
const textureCache = new Map();
export function loadTexture(url, { manager, cache = true } = {}) {
  if (cache && textureCache.has(url)) {
    return textureCache.get(url);
  }
  const promise = (async () => {
    if (/\.svg(?:[?#]|$)/i.test(url)) {
      const texture = new Texture(await loadImageElement(url, manager));
      texture.flipY = true;
      texture.needsUpdate = true;
      return texture;
    }
    const texture = new Texture(
      await loadImageBitmap(url, {
        flipY: true,
        manager,
      }),
    );
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  })();
  if (cache) {
    textureCache.set(url, promise);
  }
  return promise;
}
export async function loadJSON(url, manager = DefaultLoadingManager) {
  return new Promise((resolve, reject) => {
    loadWithRetries({
      manager,
      items: [url],
      attempt: (done, fail) => {
        fetch(url, {
          credentials: `same-origin`,
        })
          .then((response) => {
            if (!response.ok) {
              throw new LoadHttpError(url, response.status);
            }
            return response.json();
          })
          .then(done, fail);
      },
      onLoad: resolve,
      onError: reject,
    });
  });
}
export async function loadArrayBuffer(url, manager = DefaultLoadingManager) {
  return new Promise((resolve, reject) => {
    loadWithRetries({
      manager,
      items: [url],
      attempt: (done, fail) => {
        (
          takeSceneFile(url) ??
          fetch(url, {
            credentials: `same-origin`,
          }).then((response) => {
            if (!response.ok) {
              throw new LoadHttpError(url, response.status);
            }
            return response.blob();
          })
        )
          .then((blob) => blob.arrayBuffer())
          .then(done, fail);
      },
      onLoad: resolve,
      onError: reject,
    });
  });
}
