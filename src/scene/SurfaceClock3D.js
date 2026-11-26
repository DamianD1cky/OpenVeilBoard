import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  CanvasTexture,
  SRGBColorSpace,
  uniform,
} from "../engine/index.js";
import { PAINT_WEAR_WGSL, paintWearHooks } from "./plaster.js";
import {
  campaignClockValue,
  formatClockDuration,
} from "../features/campaign/domain/campaignClock.ts";
import { clockText } from "../domain/clockText.ts";
import { gsap, whenMotion } from "../shared/motion.js";
export class SurfaceStamp {
  constructor(ctx, width, height, paper = false) {
    this.paper = paper;
    this.width = width;
    this.height = height;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1536;
    this.canvas.height = Math.max(96, Math.round((1536 * height) / width));
    this.context = this.canvas.getContext("2d", { colorSpace: "srgb" });
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const wear = paintWearHooks();
    this.material.hooks = {
      key: "surface-stamp",
      ...wear,
      uniforms: { ...wear.uniforms, inkEm: uniform(height) },
      functions: PAINT_WEAR_WGSL,
      opacityNode:
        "material.opacity * paintWear(positionWorld, material.inkEm).x",
    };
    this.object = new Mesh(new PlaneGeometry(width, height), this.material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.renderOrder = 3;
    this.object.castShadow = paper;
  }
  draw(text, color = "#514b3e") {
    if (text === this.text && color === this.color) return;
    this.text = text;
    this.color = color;
    const ctx = this.context,
      { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    if (this.paper) {
      ctx.fillStyle = "rgba(239,229,205,0.9)";
      ctx.fillRect(8, 8, width - 16, height - 16);
    }
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = height * 0.72;
    ctx.font = `500 ${size}px "PingFang SC", sans-serif`;
    while (ctx.measureText(text).width > width * 0.93 && size > 12) {
      size -= 2;
      ctx.font = `500 ${size}px "PingFang SC", sans-serif`;
    }
    ctx.fillText(text, width / 2, height / 2);
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.object.geometry.dispose();
    this.object.removeFromParent();
  }
}
export class SurfaceClock3D {
  constructor(ctx) {
    this.ctx = ctx;
    this.stamp = new SurfaceStamp(ctx, 1.7, 0.085);
    this.object = this.stamp.object;
    this.hovered = false;
    this.routeHidden = false;
    this.off = ctx.app.onFrame(() => this.frame());
  }
  setRouteHidden(hidden) {
    const next = Boolean(hidden);
    if (this.routeHidden === next) return;
    this.routeHidden = next;
    const mat = this.stamp.material;
    gsap.killTweensOf(mat);
    if (next) {
      gsap.to(mat, {
        opacity: 0,
        duration: whenMotion(0.22),
        ease: "power2.in",
        onComplete: () => {
          if (this.routeHidden) this.object.visible = false;
        },
      });
    } else {
      this.object.visible = true;
      gsap.to(mat, {
        opacity: 1,
        duration: whenMotion(0.34),
        delay: whenMotion(0.12),
        ease: "power2.out",
      });
    }
  }
  setHover(on) {
    if (this.hovered === on) return;
    this.hovered = on;
    this.dirty = true;
    this.frame();
  }
  setClock(clock) {
    this.clock = clock;
    this.dirty = true;
    this.frame();
  }
  refreshInk() {
    this.dirty = true;
    this.frame();
  }
  frame() {
    const { layout, floorY } = this.ctx.counter.get();
    if (!layout) return;
    const narrow = (this.ctx.app.size?.width ?? 1280) < 920;
    this.object.position.set(
      0,
      floorY + 0.002,
      -layout.indentHeight / 2 + (narrow ? 0.34 : 0.19),
    );
    this.object.scale.setScalar(
      Math.min(narrow ? 0.85 : 1, layout.indentWidth / (narrow ? 2.5 : 2.3)),
    );
    const tick = Math.floor(Date.now() / 1000);
    if (this.clock && (this.dirty || tick !== this.tick)) {
      this.tick = tick;
      this.dirty = false;
      const urgent =
        this.clock.mode === "countdown" &&
        campaignClockValue(this.clock) < 60_000;
      const ink = this.ctx.surfaceInk;
      const baseInk = ink?.stampInk ?? "#514b3e";
      const hoverInk = ink?.stampHoverInk ?? "#2a241b";
      this.stamp.draw(
        clockText(this.clock),
        urgent ? (ink?.isDark ? "#f07c6a" : "#963f31") : this.hovered ? hoverInk : baseInk,
      );
    }
  }
  contains(point) {
    const p = this.object.position;
    return (
      Math.abs(point.x - p.x) < 0.85 * this.object.scale.x &&
      Math.abs(point.z - p.z) < 0.1
    );
  }
  dispose() {
    gsap.killTweensOf(this.stamp.material);
    this.off();
    this.stamp.dispose();
  }
}
