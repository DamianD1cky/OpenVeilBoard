import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  uniform,
} from "../engine/index.js";
import { PAINT_WEAR_WGSL, paintWearHooks } from "./plaster.js";
import { gsap, whenMotion } from "../shared/motion.js";

/**
 * Full-tray monumental event clock stenciled directly onto the 3D recessed
 * tabletop floor underneath all note cards, clue strings, and dice.
 * Uses bold full-width editorial typography + a horizontal segmented linear
 * gauge (no radial pie dials) so note cards sit physically on top and cast
 * real shadows across the giant lettering.
 */
export class SurfaceEventClock3D {
  constructor(ctx) {
    this.ctx = ctx;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 2048;
    this.canvas.height = 1280;
    this.context = this.canvas.getContext("2d", { colorSpace: "srgb" });
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;

    this.material = new MeshStandardMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.96,
      metalness: 0.0,
      opacity: 0,
    });
    const wear = paintWearHooks();
    this.material.hooks = {
      key: "surface-event-clock",
      ...wear,
      uniforms: { ...wear.uniforms, inkEm: uniform(0.42) },
      functions: PAINT_WEAR_WGSL,
      opacityNode:
        "material.opacity * paintWear(positionWorld, material.inkEm).x",
    };

    this.geometry = new PlaneGeometry(1, 1);
    this.object = new Mesh(this.geometry, this.material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.receiveShadow = true;
    this.object.renderOrder = 2;
    this.object.visible = false;

    this.clock = null;
    this.routeHidden = false;
    this.drawKey = "";
    this.pulsePhase = 0;
    this.baseOpacity = 0;

    this.off = ctx.app.onFrame((_, dt) => this.frame(dt), -0.4);
  }

  setRouteHidden(hidden) {
    this.routeHidden = Boolean(hidden);
    this.object.visible = !this.routeHidden && Boolean(this.clock);
  }

  setEventClock(clock) {
    const next = clock ?? null;
    const prevKey = this.clock
      ? `${this.clock.key}|${this.clock.name}|${this.clock.noteTitle}|${this.clock.value}|${this.clock.segments}|${this.clock.consequence}`
      : "";
    const nextKey = next
      ? `${next.key}|${next.name}|${next.noteTitle}|${next.value}|${next.segments}|${next.consequence}`
      : "";
    this.clock = next;
    if (!next) {
      gsap.killTweensOf(this.material);
      gsap.to(this.material, {
        opacity: 0,
        duration: whenMotion(0.28),
        ease: "power2.out",
        onComplete: () => {
          if (!this.clock) this.object.visible = false;
        },
      });
      return;
    }
    if (!this.routeHidden) this.object.visible = true;
    if (prevKey !== nextKey) {
      this.redraw();
    }
    const ratio = next.value / Math.max(1, next.segments);
    const isCritical = next.segments - next.value <= 1;
    const targetOpacity = isCritical ? 0.98 : ratio >= 0.5 ? 0.92 : 0.86;
    this.baseOpacity = targetOpacity;
    gsap.killTweensOf(this.material);
    gsap.to(this.material, {
      opacity: targetOpacity,
      duration: whenMotion(0.38),
      ease: "power2.out",
    });
  }

  refreshInk() {
    this.drawKey = "";
    if (this.clock) this.redraw();
  }

  redraw() {
    const clock = this.clock;
    if (!clock) return;
    const ink = this.ctx.surfaceInk ?? {
      isDark: false,
      stampInk: "#514b3e",
      stampHoverInk: "#2a241b",
      wellInk: "#655d4c",
    };
    const key = `${clock.key}|${clock.name}|${clock.noteTitle}|${clock.value}|${clock.segments}|${clock.consequence}|${ink.isDark}|${ink.stampInk}|${ink.stampHoverInk}`;
    if (key === this.drawKey) return;
    this.drawKey = key;

    const ctx = this.context;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const segments = Math.max(2, Math.min(24, Number(clock.segments) || 6));
    const value = Math.max(0, Math.min(segments, Number(clock.value) || 0));
    const ratio = value / segments;
    const triggered = value >= segments;
    const critical = !triggered && segments - value === 1;
    const tense = triggered || critical || ratio >= 0.5;

    const isDark = Boolean(ink.isDark);
    const baseInk = ink.stampHoverInk || (isDark ? "#f5dfad" : "#2a241b");
    const mutedInk = ink.stampInk || (isDark ? "#d8bc82" : "#514b3e");
    const dangerInk = isDark ? "#e56a56" : "#8e261b";
    const accent = tense ? dangerInk : baseInk;

    const title =
      clock.noteTitle &&
      clock.noteTitle !== clock.name &&
      !clock.noteTitle.includes(clock.name)
        ? `${clock.name} · ${clock.noteTitle}`
        : clock.noteTitle || clock.name || "事件钟";

    const marginX = 96;
    const innerW = W - marginX * 2;

    // 1. Subtle architectural framing hairlines across the top & bottom of the monumental block
    const blockTop = 195;
    const blockBottom = H - 155;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = isDark ? 0.22 : 0.18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(marginX, blockTop);
    ctx.lineTo(W - marginX, blockTop);
    ctx.moveTo(marginX, blockBottom);
    ctx.lineTo(W - marginX, blockBottom);
    ctx.stroke();

    // 2. Top metadata eyebrow (left: index tag, right: tension state)
    ctx.globalAlpha = isDark ? 0.42 : 0.34;
    ctx.fillStyle = mutedInk;
    ctx.font = '600 32px ui-monospace, "SF Mono", "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const valStr = String(value).padStart(2, "0");
    const segStr = String(segments).padStart(2, "0");
    ctx.fillText(`EVENT CLOCK  //  ${valStr} OF ${segStr}`, marginX, blockTop - 18);

    const statusTag = triggered
      ? "TRIGGERED · 已触发"
      : critical
        ? "CRITICAL · 仅余一格"
        : tense
          ? "ESCALATING · 事态逼近"
          : "ACTIVE · 进行中";
    ctx.textAlign = "right";
    ctx.fillStyle = accent;
    ctx.globalAlpha = triggered || critical ? (isDark ? 0.72 : 0.62) : (isDark ? 0.44 : 0.36);
    ctx.fillText(statusTag, W - marginX, blockTop - 18);

    // 3. MONUMENTAL FULL-TRAY TITLE spanning edge-to-edge!
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = triggered || critical ? dangerInk : baseInk;
    ctx.globalAlpha = triggered
      ? isDark
        ? 0.46
        : 0.36
      : critical
        ? isDark
          ? 0.4
          : 0.32
        : isDark
          ? 0.3
          : 0.24;

    let titleSize = 268;
    const fontFamily =
      '"Unbounded", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif';
    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    while (ctx.measureText(title).width > innerW * 0.96 && titleSize > 78) {
      titleSize -= 8;
      ctx.font = `700 ${titleSize}px ${fontFamily}`;
    }
    const titleY = H * 0.44;
    ctx.fillText(title, W / 2, titleY);

    // 4. FULL-WIDTH LINEAR SEGMENTED PROGRESS TRACK (NO radial pie circle!)
    const barY = H * 0.655;
    const barH = segments > 12 ? 44 : 58;
    const gap = segments > 12 ? 10 : segments > 8 ? 14 : 20;
    const segW = (innerW - gap * (segments - 1)) / segments;

    for (let i = 0; i < segments; i++) {
      const sx = marginX + i * (segW + gap);
      const filled = i < value;
      if (filled) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = triggered
          ? isDark
            ? 0.62
            : 0.52
          : critical
            ? isDark
              ? 0.56
              : 0.46
            : isDark
              ? 0.44
              : 0.36;
        ctx.fillRect(sx, barY, segW, barH);
      } else {
        ctx.fillStyle = mutedInk;
        ctx.globalAlpha = isDark ? 0.08 : 0.06;
        ctx.fillRect(sx, barY, segW, barH);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = isDark ? 0.32 : 0.24;
        ctx.lineWidth = 3;
        ctx.strokeRect(sx + 1.5, barY + 1.5, segW - 3, barH - 3);
      }
      // Subtle segment numeral inside each bar when segments <= 12
      if (segments <= 12) {
        ctx.font = '600 24px ui-monospace, "SF Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = filled ? (isDark ? "#12100d" : "#f4efe4") : mutedInk;
        ctx.globalAlpha = filled ? 0.55 : 0.28;
        ctx.fillText(String(i + 1).padStart(2, "0"), sx + segW - 10, barY + barH - 6);
      }
    }

    // 5. Bottom monumental counter + consequence warning line
    const footerY = barY + barH + 58;
    ctx.textBaseline = "middle";

    // Left: consequence text
    if (clock.consequence) {
      ctx.textAlign = "left";
      ctx.fillStyle = mutedInk;
      ctx.globalAlpha = isDark ? 0.48 : 0.4;
      let subSize = 42;
      ctx.font = `500 ${subSize}px "PingFang SC", "Noto Sans CJK SC", sans-serif`;
      const maxSubW = innerW * 0.68;
      const subText = `满格后果 · ${clock.consequence}`;
      while (ctx.measureText(subText).width > maxSubW && subSize > 24) {
        subSize -= 2;
        ctx.font = `500 ${subSize}px "PingFang SC", "Noto Sans CJK SC", sans-serif`;
      }
      ctx.fillText(subText, marginX, footerY);
    }

    // Right: large tabular fraction
    ctx.textAlign = "right";
    ctx.fillStyle = accent;
    ctx.globalAlpha = triggered || critical ? (isDark ? 0.72 : 0.6) : (isDark ? 0.5 : 0.4);
    ctx.font = `700 84px ${fontFamily}`;
    ctx.fillText(`${valStr} / ${segStr}`, W - marginX, footerY);

    // 6. Triggered diagonal rubber stamp across right-top if full
    if (triggered) {
      ctx.save();
      ctx.translate(W - marginX - 180, blockTop + 120);
      ctx.rotate(-0.14);
      ctx.strokeStyle = dangerInk;
      ctx.fillStyle = dangerInk;
      ctx.globalAlpha = isDark ? 0.62 : 0.52;
      ctx.lineWidth = 8;
      ctx.strokeRect(-165, -52, 330, 104);
      ctx.font = `700 54px "PingFang SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("已 触 发", 0, 2);
      ctx.restore();
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  frame(dt) {
    const { layout, floorY } = this.ctx.counter.get();
    if (!layout) return;
    // Span almost the entire recessed tabletop cleanly inside the bevel walls
    const w = layout.indentWidth * 0.92;
    const h = layout.indentHeight * 0.86;
    this.object.scale.set(w, h, 1);
    this.object.position.set(0, floorY + 0.0022, 0.015);

    // Gentle ominous pulse when critical (1 segment left)
    if (
      this.clock &&
      !this.routeHidden &&
      this.clock.segments - this.clock.value === 1 &&
      this.clock.value < this.clock.segments
    ) {
      this.pulsePhase += Math.min(dt || 0.016, 0.05) * 2.4;
      const pulse = 0.86 + Math.sin(this.pulsePhase) * 0.14;
      this.material.opacity = this.baseOpacity * pulse;
    }
  }

  dispose() {
    this.off();
    gsap.killTweensOf(this.material);
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.object.removeFromParent();
  }
}
