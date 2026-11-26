import {
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SkinnedMesh,
  CylinderGeometry,
  SphereGeometry,
  DoubleSide,
  FrontSide,
  Vector2,
  Vector3,
} from "../engine/index.js";
import { createPolaroidRig } from "../features/polaroids/polaroidRig.js";
import { WiggleRig } from "../features/polaroids/wiggle.js";
import {
  configurePolaroidWiggle,
  createPolaroidWiggleUpdater,
} from "../features/polaroids/polaroidWiggle.js";
import {
  createNoteTexture,
  cardAspect,
  noteRoughnessMap,
  notePaperNormalMap,
  getDiceButtonUvRect,
  getClockStepUvRects,
} from "../features/polaroids/noteTexture.js";
import { createNoteBurnHooks } from "../features/polaroids/noteBurnHooks.js";
import { fitScaleInWell, wellSeatOffsetZ } from "./ArchiveWell.js";
import { gsap, whenMotion } from "../shared/motion.js";
const pinColors = {
  red: "#a63125",
  blue: "#49687e",
  green: "#587257",
  yellow: "#bd984e",
  black: "#35312b",
};
export class NoteCard {
  constructor(ctx, note, width) {
    this.ctx = ctx;
    this.object = new Group();
    this.paper = new Group();
    this.paper.rotation.x = -Math.PI / 2;
    this.object.add(this.paper);
    this.burnHooks = createNoteBurnHooks(note, cardAspect(note));
    this.burnActive = 0;
    this.burningAway = false;
    this.material = new MeshPhysicalMaterial({
      roughness: 0.68,
      metalness: 0.03,
      clearcoat: 0.14,
      clearcoatRoughness: 0.34,
      envMapIntensity: 1.65,
      normalMap: notePaperNormalMap(),
      normalScale: new Vector2(0.18, 0.18),
      alphaTest: 0.08,
      side: DoubleSide,
      shadowSide: FrontSide,
    });
    this.material.hooks = this.burnHooks.hooks;
    this.mesh = new SkinnedMesh(undefined, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.paper.add(this.mesh);
    this.pin = new Group();
    this.pinMaterial = new MeshStandardMaterial({
      color: pinColors[note.pinColor],
      roughness: 0.35,
      metalness: 0.35,
    });
    this.pin.add(
      new Mesh(new CylinderGeometry(0.012, 0.008, 0.048, 8), this.pinMaterial),
      new Mesh(new SphereGeometry(0.026, 12, 8), this.pinMaterial),
    );
    this.pin.children[1].position.y = 0.032;
    this.pin.children.forEach((part) => {
      part.castShadow = true;
    });
    this.object.add(this.pin);
    this.pinHovered = false;
    this.pinSelected = false;
    this.clockProjected = false;
    this._pinWorld = new Vector3();
    this.aim = { x: 0, z: 0, lift: 0, tilt: 0, scale: 1, yaw: 0 };
    this.avoid = { x: 0, z: 0, yaw: 0 };
    this.overridePose = null;
    this.pulseUntil = 0;
    this.archiving = false;
    this.swept = false;
    this.update(note, width);
    this.off = ctx.app.onFrame((_, dt) => this.frame(dt), -0.6);
  }
  update(note, width = this.width) {
    const aspect = cardAspect(note);
    const geometryChanged =
      this.width !== width || Math.abs((this.aspect ?? 0) - aspect) > 0.004;
    if (geometryChanged) {
      this.wiggle?.dispose();
      this.mesh.geometry?.dispose();
      if (this.rig) this.mesh.remove(this.rig.root);
      this.width = width;
      this.height = width / aspect;
      this.aspect = aspect;
      this.rig = createPolaroidRig(this.width, this.height, {
        segmentsX: 10,
        segmentsY: 12,
      });
      this.mesh.geometry = this.rig.geometry;
      this.mesh.add(this.rig.root);
      this.object.updateMatrixWorld(true);
      this.mesh.bind(this.rig.skeleton);
      this.wiggle = new WiggleRig(this.rig.skeleton);
      configurePolaroidWiggle(this.wiggle, 0.24, 0.24);
      this.simulation = {
        matrix: new Float64Array(16),
        quietTime: 0,
        sleeping: false,
        update: createPolaroidWiggleUpdater(this.wiggle, this.rig.root),
      };
      this.pin.position.set(0, 0.02, -this.height * 0.45);
    }
    const key = JSON.stringify([
      note.title,
      note.body,
      note.cardStyle,
      note.color,
      note.capabilities,
      note.imageUrl,
      this.clockProjected,
    ]);
    if (key !== this.textureKey) {
      this.textureKey = key;
      this.texture?.dispose();
      const texOpts = { clockProjected: this.clockProjected };
      this.texture = createNoteTexture(note, null, texOpts);
      this.material.map = this.texture;
      this.material.roughnessMap = noteRoughnessMap(note, false);
      const isPolaroid = note.cardStyle === "polaroid";
      this.material.roughness = isPolaroid ? 0.54 : 0.72;
      this.material.clearcoat = isPolaroid ? 0.32 : 0.10;
      this.material.envMapIntensity = isPolaroid ? 2.1 : 1.5;
      this.material.needsUpdate = true;
      const token = (this.imageToken = {});
      if (note.imageUrl) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (this.disposed || token !== this.imageToken) return;
          this.texture.dispose();
          this.texture = createNoteTexture(note, image, texOpts);
          this.material.map = this.texture;
          this.material.roughnessMap = noteRoughnessMap(note, true);
          this.material.roughness = isPolaroid ? 0.44 : 0.64;
          this.material.clearcoat = isPolaroid ? 0.42 : 0.18;
          this.material.needsUpdate = true;
        };
        image.src = note.imageUrl;
      }
    }
    if (!this.burningAway) {
      this.burnActive = this.burnHooks.update(note, aspect);
    }
    this.pinMaterial.color.set(pinColors[note.pinColor] ?? pinColors.red);
    this.note = note;
    if (!this.dragging) this.place();
    if (geometryChanged) this.wakeLinks();
  }
  wakeLinks() {
    this.ctx.rope?.wakeNote(this.note.id);
  }
  setOverridePose(pose) {
    this.overridePose = pose ?? null;
    if (!this.dragging) this.place();
  }
  place() {
    const previousX = this.aim.x,
      previousZ = this.aim.z;
    const previousY = this.floor,
      previousYaw = this.object.rotation.y;
    const { layout, floorY } = this.ctx.counter.get();
    if (this.overridePose) {
      this.aim.x = this.overridePose.x;
      this.aim.z = this.overridePose.z;
    } else {
      const angle = (this.note.rotation * Math.PI) / 180;
      const halfX =
        (Math.abs(Math.cos(angle)) * this.width) / 2 +
        (Math.abs(Math.sin(angle)) * this.height) / 2;
      const halfZ =
        (Math.abs(Math.sin(angle)) * this.width) / 2 +
        (Math.abs(Math.cos(angle)) * this.height) / 2;
      const boundX = layout.indentWidth / 2 - halfX - 0.015,
        boundZ = layout.indentHeight / 2 - halfZ - 0.015;
      this.aim.x = Math.max(
        -boundX,
        Math.min(boundX, this.note.x * layout.indentWidth),
      );
      this.aim.z = Math.max(
        -boundZ,
        Math.min(boundZ, this.note.y * layout.indentHeight),
      );
    }
    const baseYaw = this.overridePose
      ? this.overridePose.yaw
      : (-this.note.rotation * Math.PI) / 180;
    this.aim.yaw = this.hovered ? baseYaw * 0.65 : baseYaw;
    this.aim.scale = this.hovered ? 1.055 : 1;
    this.floor = floorY + 0.012 + Math.min(this.note.layer, 100) * 0.0002;
    if (
      this.aim.x !== previousX ||
      this.aim.z !== previousZ ||
      this.floor !== previousY ||
      this.aim.yaw !== previousYaw
    )
      this.wakeLinks();
    if (!this.placed) {
      this.object.position.set(this.aim.x, this.floor, this.aim.z);
      this.object.rotation.y = this.aim.yaw;
      this.object.scale.setScalar(1);
      this.placed = true;
      this.resetWiggle();
    }
    this.wakeWiggle();
  }
  wakeWiggle() {
    if (!this.simulation) return;
    this.simulation.sleeping = false;
    this.simulation.quietTime = 0;
  }
  resetWiggle() {
    this.object.updateMatrixWorld(true);
    this.wiggle?.reset();
    if (this.simulation) {
      this.mesh.updateWorldMatrix(true, false);
      this.simulation.matrix.set(this.mesh.matrixWorld.elements);
      this.simulation.quietTime = 0;
      this.simulation.sleeping = false;
    }
  }
  setHover(on) {
    if (this.hovered === on) return;
    this.hovered = on;
    this.wakeLinks();
    this.aim.lift = on ? 0.014 : 0;
    this.aim.scale = on ? 1.055 : 1;
    const baseYaw = this.overridePose
      ? this.overridePose.yaw
      : (-this.note.rotation * Math.PI) / 180;
    this.aim.yaw = on ? baseYaw * 0.65 : baseYaw;
    this.wakeWiggle();
  }
  setPinState({ hovered = this.pinHovered, selected = this.pinSelected } = {}) {
    if (this.pinHovered === hovered && this.pinSelected === selected) return;
    this.pinHovered = hovered;
    this.pinSelected = selected;
    if (selected || hovered) {
      this.pinMaterial.emissive.set(
        pinColors[this.note?.pinColor] ?? pinColors.red,
      );
      this.pinMaterial.emissiveIntensity = selected ? 0.78 : 0.42;
    } else {
      this.pinMaterial.emissive.set(0x000000);
      this.pinMaterial.emissiveIntensity = 0;
    }
    this.wakeLinks();
  }
  pinHitTest(point, radius = 0.045) {
    if (!point || this.swept || this.burningAway || !this.pin.visible) {
      return false;
    }
    this.pin.getWorldPosition(this._pinWorld);
    const dx = point.x - this._pinWorld.x;
    const dz = point.z - this._pinWorld.z;
    return dx * dx + dz * dz <= radius * radius;
  }
  diceHitTest(point) {
    if (!point || this.swept || this.burningAway || this.archiving || !this.note) {
      return false;
    }
    const rect = getDiceButtonUvRect(this.note);
    if (!rect) return false;
    const dx = point.x - this.object.position.x;
    const dz = point.z - this.object.position.z;
    const yaw = this.object.rotation.y;
    const scale = Math.max(0.1, this.object.scale.x || 1);
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const u = lx / (this.width * scale) + 0.5;
    const v = lz / (this.height * scale) + 0.5;
    const pad = 0.028;
    return (
      u >= rect.u0 - pad &&
      u <= rect.u1 + pad &&
      v >= rect.v0 - pad &&
      v <= rect.v1 + pad
    );
  }
  diceButtonWorldPosition(target = new Vector3()) {
    const rect = getDiceButtonUvRect(this.note);
    if (!rect) return null;
    const scale = Math.max(0.1, this.object.scale.x || 1);
    const lx = ((rect.u0 + rect.u1) * 0.5 - 0.5) * this.width * scale;
    const lz = ((rect.v0 + rect.v1) * 0.5 - 0.5) * this.height * scale;
    const yaw = this.object.rotation.y;
    const wx = this.object.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
    const wz = this.object.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
    return target.set(wx, this.object.position.y + 0.005, wz);
  }
  setClockProjected(active) {
    const next = Boolean(active);
    if (this.clockProjected === next) return;
    this.clockProjected = next;
    if (this.note) {
      this.update(this.note, this.width);
    }
  }
  clockHitTest(point) {
    if (!point || this.swept || this.burningAway || this.archiving || !this.note) {
      return null;
    }
    const layout = getClockStepUvRects(this.note);
    if (!layout) return null;
    const dx = point.x - this.object.position.x;
    const dz = point.z - this.object.position.z;
    const yaw = this.object.rotation.y;
    const scale = Math.max(0.1, this.object.scale.x || 1);
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const u = lx / (this.width * scale) + 0.5;
    const v = lz / (this.height * scale) + 0.5;
    const btnPad = 0.024;
    const inRect = (r, pad = btnPad) =>
      u >= r.u0 - pad && u <= r.u1 + pad && v >= r.v0 - pad && v <= r.v1 + pad;
    if (inRect(layout.plus)) return "plus";
    if (inRect(layout.minus)) return "minus";
    if (inRect(layout.gauge, 0.012)) return "toggle";
    return null;
  }
  clockButtonWorldPositions() {
    const layout = getClockStepUvRects(this.note);
    if (!layout) return null;
    const scale = Math.max(0.1, this.object.scale.x || 1);
    const yaw = this.object.rotation.y;
    const toWorld = (r) => {
      const lx = ((r.u0 + r.u1) * 0.5 - 0.5) * this.width * scale;
      const lz = ((r.v0 + r.v1) * 0.5 - 0.5) * this.height * scale;
      return new Vector3(
        this.object.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
        this.object.position.y + 0.005,
        this.object.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
      );
    };
    return {
      minus: toWorld(layout.minus),
      gauge: toWorld(layout.gauge),
      plus: toWorld(layout.plus),
    };
  }
  dragTo(x, z, { latched = false, zone = null } = {}) {
    this.dragging = true;
    this.wakeLinks();
    if (latched && zone) {
      this.aim.x = zone.x;
      this.aim.z = zone.z + wellSeatOffsetZ(zone);
      this.aim.lift = 0.024;
      this.aim.tilt = 0;
      this.aim.scale = fitScaleInWell(zone, this.width, this.height);
      this.aim.yaw = 0;
    } else {
      this.aim.x = x;
      this.aim.z = z;
      // Slide cleanly just above the tray surface so moving paper NEVER floats above & covers red strings
      this.aim.lift = 0.022;
      this.aim.tilt = -0.022;
      this.aim.scale = 1.03;
      this.aim.yaw = this.overridePose
        ? this.overridePose.yaw
        : (-this.note.rotation * Math.PI) / 180;
    }
    this.wakeWiggle();
  }
  release() {
    this.dragging = false;
    this.wakeLinks();
    this.aim.lift = 0;
    this.aim.tilt = 0;
    this.aim.scale = 1;
    this.aim.yaw = this.overridePose
      ? this.overridePose.yaw
      : (-this.note.rotation * Math.PI) / 180;
    this.wakeWiggle();
  }
  pulse() {
    this.wakeLinks();
    this.pulseUntil = performance.now() + 450;
    this.wakeWiggle();
  }
  setAvoidance(dx = 0, dz = 0, yawRad = 0) {
    if (
      Math.abs(this.avoid.x - dx) < 1e-4 &&
      Math.abs(this.avoid.z - dz) < 1e-4 &&
      Math.abs(this.avoid.yaw - yawRad) < 1e-4
    ) {
      return false;
    }
    this.avoid.x = dx;
    this.avoid.z = dz;
    this.avoid.yaw = yawRad;
    this.wakeWiggle();
    this.wakeLinks();
    return true;
  }
  frame(dt) {
    if (this.disposed) return;
    const stepDt = Math.min(dt || 0.016, 0.05);
    if (this.burnActive === 2 || this.burningAway) {
      this.burnHooks.uniforms.uBurnTime.value += stepDt;
    }
    const k = 1 - Math.exp(-15 * stepDt),
      now = performance.now();
    if (!this.printing && !this.swept) {
      const targetX = this.aim.x + (this.dragging ? 0 : this.avoid.x);
      const targetZ = this.aim.z + (this.dragging ? 0 : this.avoid.z);
      const targetYaw = this.aim.yaw + (this.dragging ? 0 : this.avoid.yaw);
      const movedX = Math.abs(targetX - this.object.position.x);
      const movedZ = Math.abs(targetZ - this.object.position.z);
      this.object.position.x += (targetX - this.object.position.x) * k;
      this.object.position.z += (targetZ - this.object.position.z) * k;
      this.object.rotation.x += (this.aim.tilt - this.object.rotation.x) * k;
      this.object.rotation.y += (targetYaw - this.object.rotation.y) * k;
      if (movedX + movedZ > 0.002) this.wakeLinks();
      const nextScale =
        this.object.scale.x + (this.aim.scale - this.object.scale.x) * k;
      this.object.scale.setScalar(nextScale);
      const tiltClearance =
        Math.abs(Math.sin(this.object.rotation.x)) * this.height * 0.52;
      const lift =
        Math.max(this.aim.lift, tiltClearance) +
        (now < this.pulseUntil
          ? Math.sin((this.pulseUntil - now) * 0.03) * 0.0025
          : 0);
      this.object.position.y +=
        (this.floor + lift - this.object.position.y) * k;
    }
    const targetPinY = this.pinSelected
      ? 0.036
      : this.pinHovered
        ? 0.028
        : 0.02;
    const targetPinScale = this.pinSelected
      ? 1.3 + Math.sin(now * 0.008) * 0.08
      : this.pinHovered
        ? 1.26
        : 1;
    const pinK = 1 - Math.exp(-18 * stepDt);
    const prevPinY = this.pin.position.y;
    this.pin.position.y += (targetPinY - this.pin.position.y) * pinK;
    const nextPinScale =
      this.pin.scale.x + (targetPinScale - this.pin.scale.x) * pinK;
    this.pin.scale.setScalar(nextPinScale);
    if (Math.abs(this.pin.position.y - prevPinY) > 0.0002 || this.pinSelected) {
      this.wakeLinks();
    }
    const simulation = this.simulation;
    if (this.wiggle && simulation) {
      this.mesh.updateWorldMatrix(true, false);
      const elements = this.mesh.matrixWorld.elements;
      let moved = false;
      for (let i = 0; i < 16; i += 1) {
        if (Math.abs(elements[i] - simulation.matrix[i]) > 1e-10) {
          moved = true;
        }
        simulation.matrix[i] = elements[i];
      }
      if (moved || this.dragging || this.printing) {
        simulation.sleeping = false;
        simulation.quietTime = 0;
      }
      if (!simulation.sleeping) {
        const boneMoved = simulation.update(stepDt);
        simulation.quietTime =
          moved || boneMoved || this.dragging || this.printing
            ? 0
            : simulation.quietTime + stepDt;
        simulation.sleeping = simulation.quietTime > 0.25;
      }
    }
  }
  anchor() {
    const pos = this.pin.getWorldPosition(new Vector3());
    pos.y += 0.028;
    return pos;
  }
  sweepOut(exitX, targetZ, lift, delaySec = 0) {
    this.swept = true;
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.rotation);
    this.wakeWiggle();
    gsap.to(this.object.position, {
      x: exitX,
      z: targetZ,
      y: this.floor + lift,
      duration: whenMotion(0.62),
      delay: whenMotion(delaySec),
      ease: "power3.in",
    });
  }
  sweepIn(delaySec = 0) {
    if (!this.swept) return;
    gsap.killTweensOf(this.object.position);
    this.wakeWiggle();
    gsap.to(this.object.position, {
      x: this.aim.x + this.avoid.x,
      z: this.aim.z + this.avoid.z,
      y: this.floor,
      duration: whenMotion(0.68),
      delay: whenMotion(delaySec),
      ease: "power3.out",
      onUpdate: () => {
        this.wakeLinks();
      },
      onComplete: () => {
        this.swept = false;
        this.wakeWiggle();
        this.wakeLinks();
      },
    });
  }
  enterFromWell(wellX, wellZ, delaySec = 0) {
    this.printing = true;
    this.swept = false;
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
    gsap.killTweensOf(this.object.rotation);
    this.object.position.set(wellX, this.floor + 0.04, wellZ);
    this.object.scale.setScalar(0.32);
    this.object.rotation.set(0, 0, 0);
    this.resetWiggle();
    gsap.to(this.object.position, {
      x: this.aim.x,
      z: this.aim.z,
      y: this.floor,
      duration: whenMotion(0.56),
      delay: whenMotion(delaySec),
      ease: "power3.out",
      onComplete: () => {
        this.printing = false;
        this.wakeWiggle();
      },
    });
    gsap.to(this.object.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: whenMotion(0.52),
      delay: whenMotion(delaySec),
      ease: "power3.out",
    });
    gsap.to(this.object.rotation, {
      y: this.aim.yaw,
      duration: whenMotion(0.52),
      delay: whenMotion(delaySec),
      ease: "power3.out",
    });
  }
  exitToWell(wellX, wellZ, delaySec = 0, done) {
    this.printing = true;
    this.archiving = true;
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
    gsap.killTweensOf(this.object.rotation);
    if (this.exitWellAnim) gsap.killTweensOf(this.exitWellAnim);
    this.wakeWiggle();
    const startX = this.object.position.x;
    const startY = this.object.position.y;
    const startZ = this.object.position.z;
    const targetY = this.floor + 0.025;
    const travel = { t: 0 };
    this.exitWellAnim = travel;
    gsap.to(travel, {
      t: 1,
      duration: whenMotion(0.36),
      delay: whenMotion(delaySec),
      ease: "power3.in",
      onUpdate: () => {
        const t = travel.t;
        const arc = Math.sin(t * Math.PI) * 0.055;
        this.object.position.set(
          startX + (wellX - startX) * t,
          startY + (targetY - startY) * t + arc,
          startZ + (wellZ - startZ) * t,
        );
      },
      onComplete: () => {
        this.archiving = false;
        done?.();
      },
    });
    gsap.to(this.object.scale, {
      x: 0.28,
      y: 0.28,
      z: 0.28,
      duration: whenMotion(0.34),
      delay: whenMotion(delaySec),
      ease: "power3.in",
    });
    gsap.to(this.object.rotation, {
      x: 0,
      y: 0,
      duration: whenMotion(0.3),
      delay: whenMotion(delaySec),
      ease: "power2.in",
    });
  }
  returnToDesk(exitX, done) {
    this.printing = true;
    this.archiving = true;
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
    gsap.to(this.object.position, {
      x: exitX,
      y: this.floor + 0.14,
      duration: whenMotion(0.42),
      ease: "power2.in",
      onComplete: () => {
        this.archiving = false;
        done?.();
      },
    });
  }
  enterFromLeft(exitX, startZ, lift = 0.3, delaySec = 0) {
    this.printing = true;
    this.swept = false;
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.rotation);
    this.object.position.set(exitX, this.floor + lift, startZ);
    this.object.scale.setScalar(1);
    this.resetWiggle();
    this.wakeLinks();
    gsap.to(this.object.position, {
      x: this.aim.x + this.avoid.x,
      z: this.aim.z + this.avoid.z,
      y: this.floor,
      duration: whenMotion(0.68),
      delay: whenMotion(delaySec),
      ease: "power3.out",
      onUpdate: () => {
        this.wakeLinks();
      },
      onComplete: () => {
        this.printing = false;
        this.wakeWiggle();
        this.wakeLinks();
      },
    });
  }
  print() {
    this.wakeLinks();
    this.ctx.counterObject.slotModule?.open();
    this.printing = true;
    const start = this.ctx.counter.get().slot;
    this.object.position.set(start.x, this.floor + 0.28, start.z);
    this.object.scale.setScalar(1);
    this.resetWiggle();
    gsap.to(this.object.position, {
      x: this.aim.x,
      z: this.aim.z,
      y: this.floor,
      duration: whenMotion(0.85),
      ease: "power2.out",
      onComplete: () => {
        this.printing = false;
        this.wakeWiggle();
      },
    });
  }
  archive(zone, done) {
    this.wakeLinks();
    this.printing = true;
    this.archiving = true;
    const fit = fitScaleInWell(zone, this.width, this.height);
    const { floorY } = this.ctx.counter.get();
    const targetZ = zone.z + wellSeatOffsetZ(zone);
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
    gsap.killTweensOf(this.object.rotation);
    gsap
      .timeline({
        onComplete: () => {
          this.archiving = false;
          done?.();
        },
      })
      .to(this.object.position, {
        x: zone.x,
        z: targetZ,
        y: floorY + 0.025,
        duration: whenMotion(0.24),
        ease: "power2.out",
      })
      .to(this.object.position, {
        y: floorY - 0.084,
        duration: whenMotion(0.26),
        ease: "power2.inOut",
      });
    gsap.to(this.object.scale, {
      x: fit,
      y: fit,
      z: fit,
      duration: whenMotion(0.45),
      ease: "power2.out",
    });
    gsap.to(this.object.rotation, {
      x: 0,
      y: 0,
      duration: whenMotion(0.32),
      ease: "power2.out",
    });
  }
  burnAway(done) {
    if (this.burningAway) return;
    this.burningAway = true;
    this.printing = true;
    this.wakeLinks();
    this.wakeWiggle();
    const u = this.burnHooks.uniforms;
    u.uBurnActive.value = 2;
    u.uBurnTopo.value = 0; // corner radial burn
    u.uBurnOrigin.value.set(0.86, 0.14);
    u.uBurnGlow.value = 2.8;
    const startP = Math.max(0.02, u.uBurnProgress.value);
    const anim = { p: startP };
    let snappedLinks = false;
    this.burnAnim = anim;
    gsap.to(anim, {
      p: 1.05,
      duration: whenMotion(0.95),
      ease: "power1.in",
      onUpdate: () => {
        u.uBurnProgress.value = anim.p;
        if (anim.p >= 0.42 && !snappedLinks) {
          snappedLinks = true;
          this.ctx.rope?.snapNote?.(this.note.id);
        }
        if (anim.p > 0.56 && this.pin.visible) {
          this.pin.visible = false;
        }
      },
      onComplete: () => {
        if (!snappedLinks) {
          snappedLinks = true;
          this.ctx.rope?.snapNote?.(this.note.id);
        }
        done?.();
      },
    });
  }
  dispose() {
    this.disposed = true;
    this.off();
    if (this.burnAnim) gsap.killTweensOf(this.burnAnim);
    if (this.exitWellAnim) gsap.killTweensOf(this.exitWellAnim);
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
    gsap.killTweensOf(this.object.rotation);
    this.wiggle.dispose();
    this.mesh.geometry.dispose();
    this.texture?.dispose();
    this.material.dispose();
    this.pin.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    this.pinMaterial.dispose();
    this.object.removeFromParent();
  }
}
