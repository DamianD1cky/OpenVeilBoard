import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from "../engine/index.js";
import {
  createSharedWipe,
  createSlideMaterial,
  getSlidePlaceholder,
  PROJECTION_WIPE,
  updateSharedWipe,
} from "../features/projection/projectionWipe.js";
import { FACTORY_DEFAULTS } from "./sceneControlDefaults.js";
import { gsap, whenMotion } from "../shared/motion.js";
import { playSound } from "../features/audio/audioEngine.js";

const FLOOR_ROT_X = -Math.PI / 2;
const UNIT_PLANE = new PlaneGeometry(1, 1);
const _corner = new Vector3();

function loadSlideTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxDim = 2048;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
      ctx.drawImage(img, 0, 0, w, h);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      resolve({ texture: tex, aspect: w / h });
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function projectFloorRectToNdc(camera, x, y, z, width, height) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const sx of [-0.5, 0.5]) {
    for (const sz of [-0.5, 0.5]) {
      _corner.set(x + sx * width, y, z + sz * height).project(camera);
      minX = Math.min(minX, _corner.x);
      maxX = Math.max(maxX, _corner.x);
      minY = Math.min(minY, _corner.y);
      maxY = Math.max(maxY, _corner.y);
    }
  }
  return new Vector4(minX, maxY, Math.max(0.001, maxX - minX), Math.max(0.001, maxY - minY));
}

function fitLightboxNdc(aspect, viewW, viewH) {
  const padX = Math.min(72, viewW * 0.08);
  const padY = Math.min(76, viewH * 0.1);
  const availW = Math.max(120, viewW - padX * 2);
  const availH = Math.max(120, viewH - padY * 2);
  const safeAspect = Math.max(aspect || 1, 0.08);
  let targetW = availW;
  let targetH = targetW / safeAspect;
  if (targetH > availH) {
    targetH = availH;
    targetW = targetH * safeAspect;
  }
  const ndcW = (targetW / Math.max(viewW, 1)) * 2;
  const ndcH = (targetH / Math.max(viewH, 1)) * 2;
  return new Vector4(-ndcW * 0.5, ndcH * 0.5, ndcW, ndcH);
}

function createBackdropMaterial() {
  const material = new MeshBasicMaterial({ color: 0 });
  material.opacity = 0;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  material.hooks = {
    key: "note-lightbox-backdrop",
    clip: "  clipPosition = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);\n",
  };
  return material;
}

/**
 * WebGPU recessed-tray optical slide projection + seamless lift-to-lightbox viewer.
 * Ported and streamlined from `branch/veilboard/src/scene/ProjectProjection.js`.
 */
export class NoteProjection {
  constructor(ctx) {
    this.ctx = ctx;
    this.app = ctx.app;
    this.object = new Group();
    this.object.visible = false;

    const projCfg = ctx.controls.projection ?? FACTORY_DEFAULTS.projection;
    this.shared = createSharedWipe(projCfg);

    this.backdropMat = createBackdropMaterial();
    this.backdrop = new Mesh(new PlaneGeometry(2, 2), this.backdropMat);
    this.backdrop.renderOrder = 1000;
    this.backdrop.frustumCulled = false;
    this.backdrop.visible = false;
    this.object.add(this.backdrop);

    this.slides = new Map();
    this.items = [];
    this.active = false;
    this.selectedIndex = 0;
    this.scrollState = { offset: 0 };
    this.lightbox = { open: false, progress: 0, index: 0 };
    this.aspects = new Map();
    this.bounds = null;
    this.box = { left: -1, right: 1, top: -0.5, bottom: 0.5, y: 0, width: 2, height: 1 };

    this.cleanups = [
      ctx.counter.subscribe(() => this.layout()),
      ctx.app.stores.size.subscribe(() => this.layout()),
      ctx.app.onFrame(() => this.frame(), -0.5),
    ];
  }

  get lightboxProgress() {
    return this.lightbox.progress;
  }

  setState({ active = false, items = [], selectedIndex = 0 }) {
    const validItems = (items ?? []).filter((it) => Boolean(it?.url));
    const wasActive = this.active && this.items.length > 0;
    const nextActive = Boolean(active) && validItems.length > 0;
    this.active = Boolean(active);
    this.items = validItems;
    const clampedIdx = Math.max(0, Math.min(Math.max(0, validItems.length - 1), selectedIndex));
    const idxChanged = clampedIdx !== this.selectedIndex;
    this.selectedIndex = clampedIdx;

    if (!nextActive && this.lightbox.open) {
      this.closeLightbox(true);
    }

    // Reconcile slide meshes
    const keepKeys = new Set();
    for (const item of validItems) {
      const key = `${item.id}|${item.url}`;
      keepKeys.add(key);
      if (!this.slides.has(key)) {
        const material = createSlideMaterial(this.shared, getSlidePlaceholder());
        const mesh = new Mesh(UNIT_PLANE, material);
        mesh.rotation.x = FLOOR_ROT_X;
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.userData.projectMediaCoverage = 1;
        mesh.userData.projectMediaClean = 0;
        mesh.userData.projectMediaGoboRelease = 0;
        this.object.add(mesh);
        const entry = {
          key,
          item,
          mesh,
          material,
          texture: null,
          aspect: item.aspect || this.aspects.get(item.url) || 16 / 10,
          width: 1,
          height: 1,
          x: 0,
          z: 0,
          loaded: false,
        };
        this.slides.set(key, entry);
        loadSlideTexture(item.url)
          .then(({ texture, aspect }) => {
            if (this.disposed || this.slides.get(key) !== entry) {
              texture.dispose();
              return;
            }
            entry.texture = texture;
            entry.aspect = aspect;
            entry.loaded = true;
            this.aspects.set(item.url, aspect);
            entry.material.slideMap = texture;
            this.layout();
          })
          .catch(() => {});
      }
    }
    for (const [key, entry] of this.slides) {
      if (keepKeys.has(key)) continue;
      entry.texture?.dispose();
      entry.material.dispose();
      entry.mesh.removeFromParent();
      this.slides.delete(key);
    }

    this.layout();

    if (idxChanged || !wasActive) {
      gsap.killTweensOf(this.scrollState);
      gsap.to(this.scrollState, {
        offset: this.selectedIndex,
        duration: whenMotion(wasActive ? 0.42 : 0),
        ease: "power3.out",
      });
    }

    if (nextActive && !wasActive) {
      this.object.visible = true;
      gsap.killTweensOf(this.shared.uFade);
      this.shared.uFade.value = 0;
      gsap.to(this.shared.uFade, {
        value: 1,
        duration: whenMotion(PROJECTION_WIPE.duration),
        delay: whenMotion(0.16),
        ease: PROJECTION_WIPE.easeIn,
      });
    } else if (!nextActive && wasActive) {
      gsap.killTweensOf(this.shared.uFade);
      gsap.to(this.shared.uFade, {
        value: 0,
        duration: whenMotion(PROJECTION_WIPE.outDuration),
        ease: PROJECTION_WIPE.easeOut,
        onComplete: () => {
          if (!this.active || !this.items.length) {
            this.object.visible = false;
          }
        },
      });
    } else if (!nextActive) {
      this.shared.uFade.value = 0;
      this.object.visible = false;
    }
  }

  selectIndex(index) {
    if (!this.items.length) return;
    const clamped = Math.max(0, Math.min(this.items.length - 1, index));
    this.selectedIndex = clamped;
    if (this.lightbox.open) this.lightbox.index = clamped;
    gsap.killTweensOf(this.scrollState);
    gsap.to(this.scrollState, {
      offset: clamped,
      duration: whenMotion(0.42),
      ease: "power3.out",
    });
  }

  openLightbox(index = this.selectedIndex) {
    if (!this.active || !this.items.length) return;
    this.selectIndex(index);
    this.lightbox.open = true;
    this.lightbox.index = this.selectedIndex;
    playSound("ui.select");
    gsap.killTweensOf(this.lightbox);
    gsap.to(this.lightbox, {
      progress: 1,
      duration: whenMotion(0.48),
      ease: "power3.out",
    });
  }

  closeLightbox(immediate = false) {
    if (!this.lightbox.open && this.lightbox.progress <= 0.001) return;
    this.lightbox.open = false;
    if (!immediate) playSound("polaroid.drop", { volume: 0.28 });
    gsap.killTweensOf(this.lightbox);
    if (immediate) {
      this.lightbox.progress = 0;
      return;
    }
    gsap.to(this.lightbox, {
      progress: 0,
      duration: whenMotion(0.38),
      ease: "power3.inOut",
    });
  }

  setBounds(bounds = null) {
    if (!bounds) {
      if (this.bounds !== null) {
        this.bounds = null;
        this.layout();
      }
      return;
    }
    const left = Math.max(0.01, Math.min(0.9, Number(bounds.left) || 0));
    const right = Math.max(left + 0.08, Math.min(0.99, Number(bounds.right) || 1));
    const top = Math.max(0.01, Math.min(0.9, Number(bounds.top) || 0));
    const bottom = Math.max(top + 0.08, Math.min(0.99, Number(bounds.bottom) || 1));
    const prev = this.bounds;
    if (
      prev &&
      Math.abs(prev.left - left) < 0.002 &&
      Math.abs(prev.right - right) < 0.002 &&
      Math.abs(prev.top - top) < 0.002 &&
      Math.abs(prev.bottom - bottom) < 0.002
    ) {
      return;
    }
    this.bounds = { left, right, top, bottom };
    this.layout();
  }

  layout() {
    const { layout, floorY } = this.ctx.counter.get();
    if (!layout) return;
    const viewW = this.app.size.width || 1280;
    const compact = viewW < 760 || layout.indentWidth / Math.max(layout.indentHeight, 0.1) < 0.92;
    let left, right, top, bottom;
    if (this.bounds) {
      const inset = 0.035;
      const innerW = Math.max(0.2, layout.indentWidth - inset * 2);
      const innerH = Math.max(0.2, layout.indentHeight - inset * 2);
      left = -innerW * 0.5 + this.bounds.left * innerW;
      right = -innerW * 0.5 + this.bounds.right * innerW;
      top = -innerH * 0.5 + this.bounds.top * innerH;
      bottom = -innerH * 0.5 + this.bounds.bottom * innerH;
    } else {
      const padX = layout.indentWidth * (compact ? 0.055 : 0.048);
      const padTop = layout.indentHeight * (compact ? 0.11 : 0.105);
      left = -layout.indentWidth * 0.5 + padX;
      // Conservative desktop fallback: keep strictly left of the ~43% right editor column
      right = compact
        ? layout.indentWidth * 0.5 - padX
        : layout.indentWidth * 0.5 - Math.max(layout.indentWidth * 0.45, 0.92);
      top = -layout.indentHeight * 0.5 + padTop;
      bottom = compact
        ? layout.indentHeight * 0.0
        : layout.indentHeight * 0.5 - Math.max(layout.indentHeight * 0.28, 0.42);
    }

    const width = Math.max(0.24, right - left);
    const height = Math.max(0.2, bottom - top);
    const centerZ = (top + bottom) * 0.5;
    const y = (floorY ?? -layout.indentDepth + 0.0016) + 0.0012;

    this.box = { left, right, top, bottom, width, height, centerZ, y, compact };

    const projCfg = this.ctx.controls.projection ?? FACTORY_DEFAULTS.projection;
    updateSharedWipe(this.shared, {
      ...projCfg,
      feather: 0.024,
      wash: 0.08,
      brightness: 1.15,
    });
    this.shared.uStripLeft.value = left;
    this.shared.uStripRight.value = right;
    this.shared.uStripFeather.value = Math.min(width, height) * 0.022;
    this.shared.uStripZ.value = centerZ;
    this.shared.uStripHeight.value = height;
    this.shared.uCompact.value = compact ? 1 : 0;
    this.shared.uVertical.value = 0;

    // Fit each slide proportionally inside the exact projection viewport without overflowing
    const maxW = width * 0.96;
    const maxH = height * 0.94;
    for (const entry of this.slides.values()) {
      const asp = Math.max(0.08, Math.min(12, entry.aspect || 16 / 10));
      let w = maxW;
      let h = w / asp;
      if (h > maxH) {
        h = maxH;
        w = h * asp;
      }
      entry.width = w;
      entry.height = h;
      entry.material.slide.radius = Math.min(w, h) * 0.028;
    }
  }

  frame() {
    if (this.disposed || !this.object.visible) return;
    const { left, right, centerZ, y, width, height } = this.box;
    const centerX = (left + right) * 0.5;
    const stride = width * 0.98;
    const progress = this.lightbox.progress;
    const camera = this.app.camera;
    const viewW = this.app.size.width || 1280;
    const viewH = this.app.size.height || 720;

    this.backdropMat.opacity = progress * 0.86;
    this.backdrop.visible = progress > 0.002;

    this.items.forEach((item, idx) => {
      const key = `${item.id}|${item.url}`;
      const entry = this.slides.get(key);
      if (!entry) return;
      const rel = idx - this.scrollState.offset;
      const x = centerX + rel * stride;
      const z = centerZ;
      entry.x = x;
      entry.z = z;

      const isFocused = idx === this.selectedIndex;
      const slideProg = isFocused ? progress : 0;
      const visible =
        entry.loaded &&
        this.shared.uFade.value > 0.004 &&
        (slideProg > 0.001 || Math.abs(rel) < 1.35);

      entry.mesh.visible = visible;
      if (!visible) return;

      entry.mesh.position.set(x, y, z);
      entry.mesh.scale.set(entry.width, entry.height, 1);
      entry.mesh.renderOrder = slideProg > 0.002 ? 1002 : 2;
      entry.mesh.userData.projectMediaClean = slideProg * 0.45;
      entry.mesh.userData.projectMediaGoboRelease = slideProg;
      entry.material.depthTest = slideProg <= 0.002;

      const s = entry.material.slide;
      s.size.set(entry.width, entry.height);
      s.x = x;
      s.z = z;
      s.viewerProgress = slideProg;
      s.viewerMoveProgress = slideProg;
      if (slideProg > 0.001) {
        const src = projectFloorRectToNdc(camera, x, y, z, entry.width, entry.height);
        const dst = fitLightboxNdc(entry.aspect, viewW, viewH);
        s.viewerSource.copy(src);
        s.viewerRect.copy(dst);
        s.viewerBounds.set(left - 2, right + 2, centerZ, height + 2);
      }
    });
  }

  dispose() {
    this.disposed = true;
    gsap.killTweensOf(this.shared.uFade);
    gsap.killTweensOf(this.scrollState);
    gsap.killTweensOf(this.lightbox);
    this.cleanups.forEach((fn) => fn());
    for (const entry of this.slides.values()) {
      entry.texture?.dispose();
      entry.material.dispose();
      entry.mesh.removeFromParent();
    }
    this.slides.clear();
    this.backdrop.geometry.dispose();
    this.backdropMat.dispose();
    this.backdrop.removeFromParent();
    this.object.removeFromParent();
  }
}
