import {
  AmbientLight,
  Color,
  DirectionalLight,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from "../engine/index.js";
import { applyCamera, restPose } from "../features/opening/intro.js";
import { SceneApp } from "./runtime/app.js";
import { createStore } from "./runtime/store.js";
import { FACTORY_DEFAULTS } from "./sceneControlDefaults.js";
import { Gobo } from "./gobo.js";
import { ScenePost, objectData } from "./post.js";
import { createPMREM, loadGainMap } from "../engine/pmrem.js";
import { ENVIRONMENT_GAINMAP } from "../shared/sceneAssets.js";
import {
  createRenderBudget,
  sampleRenderBudget,
  noteRenderBudgetInput,
  FRAME_BUSY,
  FRAME_CALM,
} from "../shared/renderBudget.js";
import { Counter } from "./Counter.js";
import { NoteField } from "./NoteField.js";
import { RopeLinkLayer } from "./RopeLinkLayer.js";
import { SurfaceClock3D } from "./SurfaceClock3D.js";
import { SurfaceEventClock3D } from "./SurfaceEventClock3D.js";
import { TableDiceLayer } from "./TableDiceLayer.js";
import { NoteProjection } from "./NoteProjection.js";
import { Opening } from "./Opening.js";
import { DustField } from "./DustField.js";
export class CounterScene {
  static async create(root, callbacks) {
    const app = await SceneApp.create(root, { dpr: [1, 2] });
    const scene = new CounterScene(app, callbacks);
    try {
      await scene.init();
      return scene;
    } catch (error) {
      scene.dispose();
      throw error;
    }
  }
  constructor(app, callbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.cleanups = [];
    this.indentListeners = new Set();
    this.layoutCam = new PerspectiveCamera(32, 1, 0.1, 80);
    this.routeActive = false;
    this.pendingSnapshot = null;
    this.ctx = {
      app,
      controls: structuredClone(FACTORY_DEFAULTS),
      counter: createStore({}),
      inspect: createStore({ open: false }),
      opening: createStore({
        isLive: true,
        hudVisible: true,
        state: { phase: "live" },
      }),
      route: createStore({ pathname: "/", notFound: false }),
    };
    app.events.disconnect(); // The note field owns one explicit pointer classifier.
    app.renderer.objectData = objectData;
    app.scene.background = new Color("#24221e");
  }
  async init() {
    const { app, ctx } = this,
      c = ctx.controls;
    app.scene.add(new AmbientLight(c.ambient.color, c.ambient.intensity));
    const target = new Object3D();
    app.scene.add(target);
    const key = new DirectionalLight(c.key.color, c.key.intensity);
    key.position.set(c.key.x, c.key.y, c.key.z);
    key.target = target;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      near: 0.5,
      far: 40,
      left: -c.key.shadowExtent,
      right: c.key.shadowExtent,
      top: c.key.shadowExtent,
      bottom: -c.key.shadowExtent,
    });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = 0.00003;
    key.shadow.normalBias = 0.0015;
    app.scene.add(key);
    app.scene.userData.keyLight = key;
    app.scene.userData.keyShadowNode = key;
    const fill = new DirectionalLight(c.fill.color, c.fill.intensity);
    fill.position.set(c.fill.x, c.fill.y, c.fill.z);
    app.scene.add(fill);
    ctx.gobo = new Gobo(app.renderer);
    ctx.gobo.configure(c, app.size);
    this.cleanups.push(
      app.stores.size.subscribe(() => ctx.gobo.configure(c, app.size)),
    );
    this.cleanups.push(
      app.onFrame((_, dt) =>
        ctx.gobo.frame(
          dt,
          matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ),
    );
    ctx.post = new ScenePost(app.renderer, {
      gobo: ctx.gobo,
      gtao: c.gtao,
      bloom: {
        strength: 1.6,
        radius: 0.32,
        threshold: 0.95,
        smoothWidth: 0.01,
      },
      samples: 4,
    });
    this.counter = ctx.counterObject = new Counter(ctx);
    app.scene.add(this.counter.object);
    this.cleanups.push(
      ctx.counter.subscribe(() => this.emitIndentRect()),
      app.stores.size.subscribe(() => this.emitIndentRect()),
    );
    this.field = new NoteField(ctx, this.callbacks);
    app.scene.add(this.field.object);
    this.rope = ctx.rope = new RopeLinkLayer(ctx, this.field);
    app.scene.add(this.rope.object);
    this.clock = ctx.clock = new SurfaceClock3D(ctx);
    app.scene.add(this.clock.object);
    this.eventClock = ctx.eventClock = new SurfaceEventClock3D(ctx);
    app.scene.add(this.eventClock.object);
    this.projection = ctx.projection = new NoteProjection(ctx);
    app.scene.add(this.projection.object);
    this.dice = ctx.dice = new TableDiceLayer(ctx, this.field, (roll) =>
      this.callbacks.onDiceSettled?.(roll),
    );
    ctx.onDiceState = (state) => this.callbacks.onDiceState?.(state);
    app.scene.add(this.dice.object);
    this.opening = new Opening(ctx);
    this.dust = new DustField(ctx);
    if (this.dust.object) app.scene.add(this.dust.object);
    this.blur = { value: 0 };
    this.blurTarget = 0;
    const budget = createRenderBudget({
      dprMin: c.scene.dprMin,
      dprMax: c.scene.dprMax,
      deviceDpr: devicePixelRatio,
    });
    const input = () => noteRenderBudgetInput(budget);
    const inputEvents = ["pointerdown", "pointermove", "wheel", "keydown"];
    for (const event of inputEvents)
      window.addEventListener(event, input, { passive: true });
    this.cleanups.push(() => {
      for (const event of inputEvents)
        window.removeEventListener(event, input);
    });
    let last = null;
    this.cleanups.push(
      app.addEffect((timestamp) => {
        const ms = last == null ? NaN : timestamp - last;
        last = timestamp;
        const next = sampleRenderBudget(
          budget,
          ms,
          this.field.downState ? FRAME_BUSY : FRAME_CALM,
        );
        if (next != null) app.setDpr(next);
      }),
    );
    const visibility = () =>
      app.setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", visibility);
    this.cleanups.push(() =>
      document.removeEventListener("visibilitychange", visibility),
    );
    this.cleanups.push(
      app.onFrame((_, dt) => {
        this.blur.value +=
          (this.blurTarget - this.blur.value) * (1 - Math.exp(-9 * dt));
        ctx.post.setSize(
          app.canvas.width,
          app.canvas.height,
          app.size.width,
          app.size.height,
        );
        ctx.post.viewerProgress = Math.max(
          this.blur.value,
          (this.projection?.lightboxProgress ?? 0) * 0.85,
        );
        ctx.post.render(app.scene, app.camera, null);
        if (this.pendingSnapshot) {
          const req = this.pendingSnapshot;
          this.pendingSnapshot = null;
          this.fulfillDiceSnapshot(req);
        }
      }, 1),
    );
    await Promise.all([
      ctx.gobo.load(c.gobo.blur),
      this.counter.ready,
      loadGainMap(app.renderer, ENVIRONMENT_GAINMAP).then((map) => {
        app.scene.environment = createPMREM(app.renderer, map.texture);
        app.scene.environmentIntensity = c.environment.intensity;
      }),
    ]);
    app.renderer.device.lost.then(() => {
      if (!this.disposed) this.callbacks.onLost?.();
    });
    app.start();
    this.ctx.app.container.dataset.scene = "ready";
  }
  sync(snapshot) {
    this.field.sync(snapshot.notes);
    this.rope.sync(snapshot.notes, snapshot.edges);
    this.clock.setClock(snapshot.clock);
    this.counter.archivedNotes = snapshot.notes.filter((n) => n.archivedAt);
    this.counter.archivedCount = this.counter.archivedNotes.length;
    this.counter.well?.setArchived(this.counter.archivedNotes);
  }
  getIndentRect() {
    const { layout, zone, floorY } = this.ctx.counter.get();
    const { width: viewW, height: viewH } = this.app.size;
    if (!layout || !viewW || !viewH) return null;
    const camCfg = this.ctx.controls.camera;
    this.layoutCam.fov = camCfg.fov ?? 32;
    this.layoutCam.near = camCfg.near ?? 0.1;
    this.layoutCam.far = Math.max(camCfg.far ?? 40, 80);
    this.layoutCam.aspect = viewW / Math.max(viewH, 1);
    applyCamera(this.layoutCam, restPose(camCfg));
    this.layoutCam.updateProjectionMatrix();
    this.layoutCam.updateMatrixWorld(true);
    const projectRect = (cx, cz, w, h) => {
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      const corner = new Vector3();
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corner.set(cx + (sx * w) / 2, floorY, cz + (sz * h) / 2);
          corner.project(this.layoutCam);
          const px = ((corner.x + 1) * viewW) / 2;
          const py = ((1 - corner.y) * viewH) / 2;
          left = Math.min(left, px);
          right = Math.max(right, px);
          top = Math.min(top, py);
          bottom = Math.max(bottom, py);
        }
      }
      return {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    };
    const inset = 0.035;
    const rect = projectRect(
      0,
      0,
      Math.max(0.2, layout.indentWidth - inset * 2),
      Math.max(0.2, layout.indentHeight - inset * 2),
    );
    const radiusPx = Math.max(
      10,
      Math.round((layout.indentRadius ?? 0.08) * (rect.width / layout.indentWidth)),
    );
    const well = zone
      ? projectRect(zone.x, zone.z, zone.width, zone.height)
      : null;
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      radius: radiusPx,
      well: well
        ? {
            left: Math.round(well.left),
            top: Math.round(well.top),
            width: Math.round(well.width),
            height: Math.round(well.height),
          }
        : null,
    };
  }
  emitIndentRect() {
    if (!this.indentListeners.size) return;
    const rect = this.getIndentRect();
    for (const fn of this.indentListeners) fn(rect);
  }
  onIndentRect(fn) {
    this.indentListeners.add(fn);
    fn(this.getIndentRect());
    return () => this.indentListeners.delete(fn);
  }
  setNoteProjection(state) {
    this.projection?.setState(state);
  }
  setNoteProjectionBounds(bounds) {
    this.projection?.setBounds(bounds);
  }
  selectProjectionIndex(index) {
    this.projection?.selectIndex(index);
  }
  openProjectionLightbox(index) {
    this.projection?.openLightbox(index);
  }
  closeProjectionLightbox(immediate = false) {
    this.projection?.closeLightbox(immediate);
  }
  setSurfaceTheme(theme) {
    return this.counter?.setSurfaceTheme(theme);
  }
  setAvoidanceZone(zone) {
    this.field?.setAvoidanceZone(zone);
  }
  setLinkStart(id) {
    this.field?.setLinkStart(id);
  }
  captureDiceSnapshot() {
    if (this.disposed || !this.app?.canvas) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingSnapshot?.resolve === done) {
          this.pendingSnapshot = null;
          resolve(null);
        }
      }, 1500);
      const done = (file) => {
        clearTimeout(timer);
        resolve(file);
      };
      this.pendingSnapshot = { resolve: done };
    });
  }
  fulfillDiceSnapshot({ resolve }) {
    try {
      const canvas = this.app.canvas;
      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) {
        resolve(null);
        return;
      }
      const dprX = cw / Math.max(this.app.size.width || cw, 1);
      const dprY = ch / Math.max(this.app.size.height || ch, 1);
      const indent = this.getIndentRect();
      const trayLeft = indent ? Math.max(0, indent.left * dprX) : 0;
      const trayTop = indent ? Math.max(0, indent.top * dprY) : 0;
      const trayW = indent
        ? Math.min(cw - trayLeft, indent.width * dprX)
        : cw;
      const trayH = indent
        ? Math.min(ch - trayTop, indent.height * dprY)
        : ch;

      const diceBounds = this.dice?.getScreenBounds(this.app.camera, cw, ch);
      let sx = trayLeft,
        sy = trayTop,
        sw = trayW,
        sh = trayH;

      if (diceBounds) {
        const spanW = diceBounds.maxX - diceBounds.minX;
        const spanH = diceBounds.maxY - diceBounds.minY;
        const padX = Math.max(spanW * 0.45, trayW * 0.14);
        const padY = Math.max(spanH * 0.45, trayH * 0.14);
        let cropW = Math.max(spanW + padX * 2, trayW * 0.36);
        let cropH = Math.max(spanH + padY * 2, trayH * 0.36);
        // Aim for a clean 4:3 polaroid framing while keeping all dice inside
        const targetAspect = 4 / 3;
        if (cropW / cropH < targetAspect) {
          cropW = cropH * targetAspect;
        } else {
          cropH = cropW / targetAspect;
        }
        if (cropW > trayW) {
          cropW = trayW;
          cropH = Math.min(trayH, Math.max(spanH + padY, cropW / targetAspect));
        }
        if (cropH > trayH) {
          cropH = trayH;
          cropW = Math.min(trayW, Math.max(spanW + padX, cropH * targetAspect));
        }
        const cx = (diceBounds.minX + diceBounds.maxX) * 0.5;
        const cy = (diceBounds.minY + diceBounds.maxY) * 0.5;
        sx = Math.max(
          trayLeft,
          Math.min(trayLeft + trayW - cropW, cx - cropW * 0.5),
        );
        sy = Math.max(
          trayTop,
          Math.min(trayTop + trayH - cropH, cy - cropH * 0.5),
        );
        sw = cropW;
        sh = cropH;
      }

      const ix = Math.max(0, Math.min(cw - 1, Math.round(sx)));
      const iy = Math.max(0, Math.min(ch - 1, Math.round(sy)));
      const iw = Math.max(1, Math.min(cw - ix, Math.round(sw)));
      const ih = Math.max(1, Math.min(ch - iy, Math.round(sh)));

      const device = this.app.renderer?.device;
      const context = this.app.renderer?.context;
      const format = this.app.renderer?.format ?? "bgra8unorm";
      if (!device || !context) {
        resolve(null);
        return;
      }
      if (this.app.renderer.encoder) {
        this.app.renderer.endFrame();
      }
      const tex = context.getCurrentTexture();
      const copyW = Math.max(1, Math.min(tex.width - ix, iw));
      const copyH = Math.max(1, Math.min(tex.height - iy, ih));
      const bytesPerRow = Math.ceil((copyW * 4) / 256) * 256;
      const readBuf = device.createBuffer({
        size: bytesPerRow * copyH,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: tex, origin: { x: ix, y: iy, z: 0 } },
        { buffer: readBuf, bytesPerRow, rowsPerImage: copyH },
        { width: copyW, height: copyH, depthOrArrayLayers: 1 },
      );
      device.queue.submit([encoder.finish()]);

      const isBGRA = format.startsWith("bgra");
      void readBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          try {
            const mapped = new Uint8Array(readBuf.getMappedRange());
            const srcCanvas = document.createElement("canvas");
            srcCanvas.width = copyW;
            srcCanvas.height = copyH;
            const srcCtx = srcCanvas.getContext("2d");
            if (!srcCtx) {
              resolve(null);
              return;
            }
            const imgData = srcCtx.createImageData(copyW, copyH);
            const dst = imgData.data;
            for (let y = 0; y < copyH; y++) {
              const rowStart = y * bytesPerRow;
              const dstRow = y * copyW * 4;
              for (let x = 0; x < copyW; x++) {
                const si = rowStart + x * 4;
                const di = dstRow + x * 4;
                if (isBGRA) {
                  dst[di] = mapped[si + 2];
                  dst[di + 1] = mapped[si + 1];
                  dst[di + 2] = mapped[si];
                } else {
                  dst[di] = mapped[si];
                  dst[di + 1] = mapped[si + 1];
                  dst[di + 2] = mapped[si + 2];
                }
                dst[di + 3] = 255;
              }
            }
            srcCtx.putImageData(imgData, 0, 0);

            const maxOutW = 1200;
            const outW = Math.max(320, Math.min(maxOutW, copyW));
            const outH = Math.max(240, Math.round((outW * copyH) / copyW));
            const outCanvas = document.createElement("canvas");
            outCanvas.width = outW;
            outCanvas.height = outH;
            const outCtx = outCanvas.getContext("2d");
            if (!outCtx) {
              resolve(null);
              return;
            }
            outCtx.drawImage(srcCanvas, 0, 0, copyW, copyH, 0, 0, outW, outH);
            outCanvas.toBlob(
              (blob) => {
                if (!blob) {
                  resolve(null);
                  return;
                }
                resolve(
                  new File([blob], `dice-roll-${Date.now()}.jpg`, {
                    type: "image/jpeg",
                  }),
                );
              },
              "image/jpeg",
              0.9,
            );
          } finally {
            readBuf.unmap();
            readBuf.destroy();
          }
        })
        .catch(() => {
          try {
            readBuf.destroy();
          } catch {}
          resolve(null);
        });
    } catch {
      resolve(null);
    }
  }
  burnNote(id, done) {
    this.field.burnAndRemove(id, done);
  }
  setEventClock(clock) {
    this.eventClock?.setEventClock(clock);
  }
  setRouteView(activePage) {
    this.routeActive = Boolean(activePage);
    this.field.setSwept(this.routeActive);
    this.dice?.setSwept(this.routeActive);
    this.rope.setVisible(!this.routeActive);
    if (this.clock?.object) this.clock.object.visible = !this.routeActive;
    this.eventClock?.setRouteHidden(this.routeActive);
  }
  setUI(active, inspect = false, blur = inspect) {
    this.field.enabled = active && !inspect;
    this.blurTarget = blur ? 0.45 : 0;
  }
  enter(skip = false) {
    this.opening.play(skip);
  }
  diagnostics() {
    const project = (point) => {
      const p = point.clone().project(this.app.camera);
      return {
        x: ((p.x + 1) * this.app.size.width) / 2,
        y: ((1 - p.y) * this.app.size.height) / 2,
      };
    };
    const { zone, floorY } = this.ctx.counter.get();
    return {
      frame: this.app.frame,
      dpr: this.app.viewport.dpr,
      ropes: { count: this.rope.links.size, ...this.rope.stats },
      dice: { ...this.dice.stats, exiting: this.dice.exiting.size },
      archive: project(new Vector3(zone.x, floorY, zone.z)),
      cards: [...this.field.cards.values()].map((c) => {
        const p = c.object
          .getWorldPosition(new Vector3())
          .project(this.app.camera);
        return {
          id: c.note.id,
          title: c.note.title,
          x: ((p.x + 1) * this.app.size.width) / 2,
          y: ((1 - p.y) * this.app.size.height) / 2,
        };
      }),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanups.forEach((fn) => fn());
    this.dice?.dispose();
    this.projection?.dispose();
    this.rope?.dispose();
    this.field?.dispose();
    this.clock?.dispose();
    this.eventClock?.dispose();
    this.opening?.dispose();
    this.dust?.dispose();
    this.counter?.dispose();
    this.ctx.post?.dispose?.();
    this.ctx.gobo?.dispose?.();
    this.app.dispose();
  }
}
