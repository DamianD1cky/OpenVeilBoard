import { gsap, whenMotion } from "../shared/motion.js";
import {
  applyCamera,
  poseForOpening,
  restPose,
  openingMarks,
} from "../features/opening/intro.js";
import { playSound } from "../features/audio/audioEngine.js";
export class Opening {
  constructor(ctx) {
    this.ctx = ctx;
    this.beats = { fade: 1, launch: 1, fall: 1, zoom: 1 };
    this.active = false;
    this.dirty = true;
    this.offSize = ctx.counter.subscribe(() => {
      this.dirty = true;
    });
    this.off = ctx.app.onFrame(() => this.frame(), -1);
  }
  play(skip = false) {
    this.timeline?.kill();
    const beats = this.beats;
    if (skip) {
      Object.assign(beats, { fade: 1, launch: 1, fall: 1, zoom: 1 });
      this.active = false;
      this.dirty = true;
      return;
    }
    Object.assign(beats, { fade: 0, launch: 0, fall: 0, zoom: 0 });
    this.active = true;
    this.dirty = true;
    playSound("intro.print");
    this.timeline = gsap
      .timeline({
        onComplete: () => {
          this.active = false;
          this.dirty = true;
        },
      })
      .to(beats, { fade: 1, duration: whenMotion(0.3) })
      .to(beats, {
        launch: 1,
        fall: 1,
        duration: whenMotion(0.95),
        ease: "power2.out",
      })
      .to(beats, { zoom: 1, duration: whenMotion(1.1) }, "-=0.65");
  }
  frame() {
    if (!this.active && !this.dirty) return;
    const { app, controls, counter } = this.ctx,
      { layout, slot } = counter.get();
    if (!layout) return;
    this.dirty = false;
    const marks = openingMarks(
      layout,
      -layout.indentDepth + 0.01,
      { width: 0.7, height: 0.9 },
      { ...controls.intro, slotX: slot.x, slotZ: slot.z },
    );
    applyCamera(
      app.camera,
      poseForOpening(
        { phase: "playing", ...this.beats },
        marks,
        restPose(controls.camera),
      ),
    );
  }
  dispose() {
    this.timeline?.kill();
    this.offSize?.();
    this.off();
  }
}
