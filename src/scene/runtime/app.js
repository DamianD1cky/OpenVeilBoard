import { PerspectiveCamera, Renderer, Scene, Vector3 } from "../../engine/index.js";
import { createStore } from "./store.js";
import { EventManager } from "./events.js";
const _position = new Vector3();
const _target = new Vector3();
export class SceneApp {
  static async create(container, { dpr = [1.5, 2], camera: cameraProps = {} } = {}) {
    const canvas = document.createElement(`canvas`);
    canvas.style.display = `block`;
    canvas.style.width = `100%`;
    canvas.style.height = `100%`;
    const wrapper = document.createElement(`div`);
    wrapper.style.position = `relative`;
    wrapper.style.width = `100%`;
    wrapper.style.height = `100%`;
    wrapper.style.overflow = `hidden`;
    wrapper.className = `h-full w-full`;
    wrapper.append(canvas);
    container.append(wrapper);
    const renderer = await Renderer.create(canvas);
    return new SceneApp(container, wrapper, canvas, renderer, {
      dpr,
      cameraProps,
    });
  }
  constructor(container, wrapper, canvas, renderer, { dpr, cameraProps }) {
    this.container = container;
    this.wrapper = wrapper;
    this.canvas = canvas;
    this.renderer = renderer;
    this.scene = new Scene();
    const { position = [0, 6.4, 0.12], fov = 32, near = 0.1, far = 40 } = cameraProps;
    this.camera = new PerspectiveCamera(fov, 1, near, far);
    this.camera.position.set(...position);
    this.camera.lookAt(0, 0, 0);
    this.size = {
      width: 0,
      height: 0,
      top: 0,
      left: 0,
    };
    this.viewport = {
      dpr: 1,
      width: 0,
      height: 0,
      factor: 1,
      distance: 0,
      aspect: 1,
      initialDpr: 1,
    };
    this.dprRange = dpr;
    this.clock = {
      elapsedTime: 0,
      delta: 0,
      oldTime: null,
    };
    this.subscribers = [];
    this.effects = new Set();
    this.frameloop = `always`;
    this.frame = 0;
    this.stores = {
      size: createStore(this.size),
    };
    this.events = new EventManager({
      size: () => this.size,
    });
    this.homeRoot = this.events.addRoot({
      scene: this.scene,
      camera: () => this.camera,
      priority: 1,
    });
    this.running = false;
    this.measure();
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(wrapper);
    this.resizeHandler = () => this.measure();
    window.addEventListener(`resize`, this.resizeHandler);
    this.setDpr(this.calculateDpr(dpr));
    this.viewport.initialDpr = this.viewport.dpr;
    this.events.connect(wrapper);
  }
  calculateDpr(dpr) {
    const target = window.devicePixelRatio ?? 2;
    return Array.isArray(dpr) ? Math.min(Math.max(dpr[0], target), dpr[1]) : dpr;
  }
  measure() {
    const rect = this.wrapper.getBoundingClientRect();
    const width = Math.round(rect.width) || window.innerWidth;
    const height = Math.round(rect.height) || window.innerHeight;
    if (width === this.size.width && height === this.size.height) {
      return;
    }
    this.size = {
      width,
      height,
      top: rect.top,
      left: rect.left,
    };
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateViewport();
    this.stores.size.replace(this.size);
  }
  setDpr(dpr) {
    this.viewport.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.updateViewport();
    this.stores.size.replace({
      ...this.size,
    });
  }
  getCurrentViewport(camera = this.camera, target = [0, 0, 0], size = this.size) {
    const { width, height, top, left } = size;
    const aspect = width / height;
    if (target.isVector3) {
      _target.copy(target);
    } else {
      _target.set(...target);
    }
    const distance = camera.getWorldPosition(_position).distanceTo(_target);
    const fov = (camera.fov * Math.PI) / 180;
    const h = 2 * Math.tan(fov / 2) * distance;
    const w = h * (width / height);
    return {
      width: w,
      height: h,
      top,
      left,
      factor: width / w,
      distance,
      aspect,
    };
  }
  updateViewport() {
    if (!this.size.width) {
      return;
    }
    Object.assign(this.viewport, this.getCurrentViewport());
  }
  get drawingBuffer() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
  onFrame(callback, priority = 0) {
    const entry = {
      callback,
      priority,
      order: this.subscribers.length ? this.subscribers.at(-1).order + 1 : 0,
    };
    this.subscribers.push(entry);
    this.subscribers.sort((a, b) => a.priority - b.priority || a.order - b.order);
    return () => {
      const index = this.subscribers.indexOf(entry);
      if (index >= 0) {
        this.subscribers.splice(index, 1);
      }
    };
  }
  addEffect(callback) {
    this.effects.add(callback);
    return () => this.effects.delete(callback);
  }
  setFrameloop(mode) {
    if (this.frameloop === mode) {
      return;
    }
    this.frameloop = mode;
    this.clock.oldTime = null;
    if (mode === `always`) {
      this.start();
    }
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const loop = (timestamp) => {
      if (!this.running) {
        return;
      }
      if (this.frameloop === `never`) {
        this.running = false;
        return;
      }
      this.raf = requestAnimationFrame(loop);
      this.advance(timestamp);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  dispose() {
    this.stop();
    this.events.disconnect();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.resizeHandler);
    this.subscribers = [];
    this.effects.clear();
    this.renderer.dispose();
    this.wrapper.remove();
  }
  advance(timestamp) {
    for (const effect of this.effects) {
      effect(timestamp);
    }
    const now = performance.now();
    const delta = this.clock.oldTime === null ? 0 : (now - this.clock.oldTime) / 1e3;
    this.clock.oldTime = now;
    this.clock.elapsedTime += delta;
    this.clock.delta = delta;
    this.frame++;
    this.renderer.time = this.clock.elapsedTime;
    if (this.renderer.lost) {
      return;
    }
    this.renderer.beginFrame();
    let manual = false;
    for (const { callback, priority } of [...this.subscribers]) {
      if (priority > 0) {
        manual = true;
      }
      callback(this, delta, timestamp);
    }
    if (!manual) {
      this.renderer.render(this.scene, this.camera, null, DEFAULT_PASS);
    }
    this.renderer.endFrame();
  }
}
const DEFAULT_PASS = {
  id: `default`,
  kind: `color`,
  outputs: [
    {
      name: `output`,
      type: `vec4f`,
    },
  ],
  write: `  out.output = outputColor;`,
};
