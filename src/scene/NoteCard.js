import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  CylinderGeometry,
  SphereGeometry,
  DoubleSide,
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
} from "../features/polaroids/noteTexture.js";
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
    this.material = new MeshStandardMaterial({
      roughness: 0.83,
      metalness: 0,
      side: DoubleSide,
    });
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
    this.aim = { x: 0, z: 0, lift: 0, tilt: 0, scale: 1, yaw: 0 };
    this.pulseUntil = 0;
    this.archiving = false;
    this.swept = false;
    this.update(note, width);
    this.off = ctx.app.onFrame((_, dt) => this.frame(dt), -0.6);
  }
  update(note, width = this.width) {
    const aspect = cardAspect(note.cardStyle);
    const geometryChanged = this.width !== width || this.aspect !== aspect;
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
      this.pin.position.set(0, 0.016, -this.height * 0.45);
    }
    const key = JSON.stringify([
      note.title,
      note.body,
      note.cardStyle,
      note.color,
      note.capabilities,
      note.imageUrl,
    ]);
    if (key !== this.textureKey) {
      this.textureKey = key;
      this.texture?.dispose();
      this.texture = createNoteTexture(note);
      this.material.map = this.texture;
      this.material.roughnessMap = noteRoughnessMap(note);
      this.material.needsUpdate = true;
      const token = (this.imageToken = {});
      if (note.imageUrl) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (this.disposed || token !== this.imageToken) return;
          this.texture.dispose();
          this.texture = createNoteTexture(note, image);
          this.material.map = this.texture;
          this.material.roughnessMap = noteRoughnessMap(note, true);
          this.material.needsUpdate = true;
        };
        image.src = note.imageUrl;
      }
    }
    this.pinMaterial.color.set(pinColors[note.pinColor] ?? pinColors.red);
    this.note = note;
    if (!this.dragging) this.place();
    if (geometryChanged) this.wakeLinks();
  }
  wakeLinks() {
    this.ctx.rope?.wakeNote(this.note.id);
  }
  place() {
    const previousX = this.aim.x,
      previousZ = this.aim.z;
    const previousY = this.floor,
      previousYaw = this.object.rotation.y;
    const { layout, floorY } = this.ctx.counter.get();
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
    this.aim.yaw = (-this.note.rotation * Math.PI) / 180;
    this.aim.scale = 1;
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
    this.aim.lift = on ? 0.035 : 0;
    this.wakeWiggle();
  }
  dragTo(x, z, { latched = false, zone = null } = {}) {
    this.dragging = true;
    this.wakeLinks();
    if (latched && zone) {
      this.aim.x = zone.x;
      this.aim.z = zone.z + wellSeatOffsetZ(zone);
      this.aim.lift = 0.04;
      this.aim.tilt = 0;
      this.aim.scale = fitScaleInWell(zone, this.width, this.height);
      this.aim.yaw = 0;
    } else {
      this.aim.x = x;
      this.aim.z = z;
      this.aim.lift = 0.18;
      this.aim.tilt = -0.1;
      this.aim.scale = 1;
      this.aim.yaw = (-this.note.rotation * Math.PI) / 180;
    }
    this.wakeWiggle();
  }
  release() {
    this.dragging = false;
    this.wakeLinks();
    this.aim.lift = 0;
    this.aim.tilt = 0;
    this.aim.scale = 1;
    this.aim.yaw = (-this.note.rotation * Math.PI) / 180;
    this.wakeWiggle();
  }
  pulse() {
    this.wakeLinks();
    this.pulseUntil = performance.now() + 450;
    this.wakeWiggle();
  }
  frame(dt) {
    if (this.disposed) return;
    const stepDt = Math.min(dt || 0.016, 0.05);
    const k = 1 - Math.exp(-18 * stepDt),
      now = performance.now();
    if (!this.printing && !this.swept) {
      this.object.position.x += (this.aim.x - this.object.position.x) * k;
      this.object.position.z += (this.aim.z - this.object.position.z) * k;
      this.object.rotation.x += (this.aim.tilt - this.object.rotation.x) * k;
      this.object.rotation.y += (this.aim.yaw - this.object.rotation.y) * k;
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
    return this.pin.getWorldPosition(new Vector3());
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
      x: this.aim.x,
      z: this.aim.z,
      y: this.floor,
      duration: whenMotion(0.68),
      delay: whenMotion(delaySec),
      ease: "power3.out",
      onComplete: () => {
        this.swept = false;
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
  dispose() {
    this.disposed = true;
    this.off();
    gsap.killTweensOf(this.object.position);
    gsap.killTweensOf(this.object.scale);
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
