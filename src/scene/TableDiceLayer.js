import * as CANNON from "cannon-es";
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "../engine/index.js";
import { buildDieGeometry } from "../features/dice/proceduralGeometry.ts";
import { getDieShape } from "../features/dice/diceShapes.ts";
import { gsap, whenMotion } from "../shared/motion.js";
import { panForClientX, playSound } from "../features/audio/audioEngine.js";

const materialPresets = {
  ivory: { color: "#eee3cb", ink: "#322a1f", metalness: 0.04, roughness: 0.35 },
  obsidian: {
    color: "#22231f",
    ink: "#d2ae66",
    metalness: 0.25,
    roughness: 0.22,
  },
  brass: { color: "#af8742", ink: "#282418", metalness: 0.78, roughness: 0.3 },
  jade: { color: "#365c4d", ink: "#f0e1b9", metalness: 0.08, roughness: 0.26 },
};

const UP = new Vector3(0, 1, 0);

function releaseDie(d) {
  gsap.killTweensOf(d.group.position);
  gsap.killTweensOf(d.group.scale);
  gsap.killTweensOf(d.group.quaternion);
  if (d.tweenObj) gsap.killTweensOf(d.tweenObj);
  d.geometry.body.dispose();
  d.geometry.marks.dispose();
  d.bodyMaterial.dispose();
  d.marksMaterial.dispose();
  d.group.removeFromParent();
}

export class TableDiceLayer {
  constructor(ctx, field, onSettled) {
    this.ctx = ctx;
    this.field = field;
    this.onSettled = onSettled;
    this.object = new Group();
    this.dice = [];
    this.exiting = new Set();
    this.state = "idle"; // "idle" | "rolling" | "settled" | "docked"
    this.swept = false;
    this.dockBounds = null;
    this.dockHovered = false;
    this.off = ctx.app.onFrame((_, dt) => this.frame(dt), -0.3);
    this.offCounter = ctx.counter.subscribe(() => {
      if (this.state === "docked" && !this.swept && this.dice.length) {
        this.layoutDocked(true);
      }
    });
    this.stats = { stepping: false, bodies: 0, state: "idle" };
  }

  setState(next) {
    this.state = next;
    this.stats.state = next;
    this.ctx.onDiceState?.(next);
  }

  throw(roll, preset = "ivory", { fromCorner = false } = {}) {
    if (!roll.result || roll.id === this.lastId) return;
    if (this.dice.length) {
      this.sweepOut(false);
    }
    this.lastId = roll.id;
    this.roll = roll;
    this.swept = false;
    this.dockBounds = null;
    this.dockHovered = false;
    const { layout, floorY, zone } = this.ctx.counter.get();
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
      allowSleep: true,
    });
    this.world.defaultContactMaterial.friction = 0.36;
    this.world.defaultContactMaterial.restitution = 0.35;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.y = floorY;
    this.world.addBody(ground);
    const halfWidth = layout.indentWidth / 2 - 0.03,
      halfHeight = layout.indentHeight / 2 - 0.03;
    for (const [x, z, w, h] of [
      [-halfWidth, 0, 0.06, halfHeight],
      [halfWidth, 0, 0.06, halfHeight],
      [0, -halfHeight, halfWidth, 0.06],
      [0, halfHeight, halfWidth, 0.06],
    ]) {
      this.world.addBody(
        new CANNON.Body({
          mass: 0,
          shape: new CANNON.Box(new CANNON.Vec3(w, 0.6, h)),
          position: new CANNON.Vec3(x, floorY + 0.4, z),
        }),
      );
    }
    if (zone) {
      this.world.addBody(
        new CANNON.Body({
          mass: 0,
          shape: new CANNON.Box(
            new CANNON.Vec3(zone.width / 2 + 0.02, 0.5, zone.height / 2 + 0.02),
          ),
          position: new CANNON.Vec3(zone.x, floorY + 0.25, zone.z),
        }),
      );
    }
    this.world.addBody(
      new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(halfWidth, 0.03, halfHeight)),
        position: new CANNON.Vec3(0, floorY + 1.2, 0),
      }),
    );
    let seed =
      [...roll.id].reduce((s, c) => Math.imul(s, 31) + c.charCodeAt(0), 1) >>>
      0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const results = roll.result.dice
      .flatMap((d) =>
        d.sides === 100
          ? [
              { ...d, sides: 100, value: Math.floor((d.value % 100) / 10) + 1 },
              { ...d, sides: 10, value: d.value % 10 || 10 },
            ]
          : [d],
      )
      .filter((d) => [4, 6, 8, 10, 12, 20, 100, "F"].includes(d.sides))
      .slice(0, 40);
    const config = materialPresets[preset] ?? materialPresets.ivory;
    for (const [i, result] of results.entries()) {
      const shape = getDieShape(result.sides),
        scale = Math.min(0.19, layout.indentWidth * 0.08);
      const hull = new CANNON.ConvexPolyhedron({
        vertices: shape.vertices.map(
          (p) => new CANNON.Vec3(p.x * scale, p.y * scale, p.z * scale),
        ),
        faces: shape.faces.map((f) => f.vertices),
      });
      const body = new CANNON.Body({
        mass: 0.025,
        shape: hull,
        linearDamping: 0.2,
        angularDamping: 0.28,
        sleepSpeedLimit: 0.11,
        sleepTimeLimit: 0.4,
      });
      if (fromCorner) {
        body.position.set(
          -halfWidth * 0.72 + (i % 4) * 0.06 + random() * 0.05,
          floorY + 0.3 + i * 0.015,
          halfHeight * 0.62 - Math.floor(i / 4) * 0.07 + (random() - 0.5) * 0.06,
        );
        body.velocity.set(
          1.35 + random() * 1.15,
          0.38 + random() * 0.55,
          -1.05 - random() * 0.85,
        );
      } else {
        body.position.set(
          -halfWidth * 0.7 + random() * 0.15,
          floorY + 0.45 + i * 0.008,
          (random() - 0.5) * halfHeight * 0.8,
        );
        body.velocity.set(
          1.1 + random() * 1.3,
          0.2 + random(),
          (random() - 0.5) * 1.3,
        );
      }
      body.angularVelocity.set(
        random() * 20 - 10,
        random() * 20 - 10,
        random() * 20 - 10,
      );
      body.quaternion.setFromEuler(random() * 6, random() * 6, random() * 6);
      this.world.addBody(body);
      const geometry = buildDieGeometry(result.sides),
        group = new Group();
      group.scale.setScalar(scale);
      const bodyMaterial = new MeshStandardMaterial(config);
      const marksTexture = geometry.recessed ? null : atlas(config.ink);
      const marksMaterial = new MeshStandardMaterial({
        color: geometry.recessed ? config.ink : "#ffffff",
        map: marksTexture,
        transparent: !geometry.recessed,
        roughness: 0.8,
        depthWrite: false,
      });
      const solid = new Mesh(geometry.body, bodyMaterial),
        marks = new Mesh(geometry.marks, marksMaterial);
      solid.castShadow = true;
      solid.receiveShadow = true;
      group.add(solid, marks);
      this.object.add(group);
      const die = {
        body,
        group,
        shape,
        result,
        geometry,
        bodyMaterial,
        marksMaterial,
        marksTexture,
        baseScale: scale,
        restY: floorY + scale * 0.8,
        randomYaw: random() * 6.28,
        readQuaternion: new Quaternion(),
        settledPos: new Vector3(),
        dockPos: new Vector3(),
        dockScale: scale * 0.76,
      };
      this.dice.push(die);
      body.addEventListener("collide", (event) => {
        const impulse = Math.abs(
          event.contact?.getImpactVelocityAlongNormal?.() ?? 0,
        );
        if (impulse > 0.15)
          playSound("polaroid.dock", {
            volume: Math.min(0.8, impulse / 5),
            rate: 1.3 + random() * 0.35,
            pan: panForClientX(
              (body.position.x / layout.indentWidth + 0.5) *
                this.ctx.app.size.width,
            ),
          });
      });
    }
    this.elapsed = 0;
    this.settled = false;
    this.stats.bodies = this.dice.length;
    this.stats.stepping = this.dice.length > 0;
    if (!this.dice.length) {
      this.settled = true;
      this.setState("idle");
      this.onSettled(roll);
    } else {
      this.setState("rolling");
    }
  }

  frame(dt) {
    if (!this.world || this.settled || !this.dice.length) return;
    this.elapsed += Math.min(dt, 0.05);
    this.world.step(1 / 120, Math.min(dt, 0.05), 6);
    for (const die of this.dice) {
      die.group.position.copy(die.body.position);
      die.group.quaternion.copy(die.body.quaternion);
      if (die.body.velocity.length() > 0.9)
        for (const card of this.field.cards.values()) {
          if (
            Math.hypot(
              card.object.position.x - die.body.position.x,
              card.object.position.z - die.body.position.z,
            ) < 0.35
          )
            card.pulse();
        }
    }
    if (
      this.elapsed > 5 ||
      (this.elapsed > 0.6 &&
        this.dice.every((d) => d.body.sleepState === CANNON.Body.SLEEPING))
    ) {
      this.settled = true;
      this.stats.stepping = false;
      this.world = null;
      for (const die of this.dice) {
        die.body.velocity.setZero();
        die.body.angularVelocity.setZero();
        die.body.sleep();
        die.restY = die.group.position.y;
        die.settledPos.copy(die.group.position);
        const value =
          die.result.sides === "F"
            ? die.result.value < 0
              ? 1
              : die.result.value > 0
                ? 5
                : 3
            : die.result.value;
        const face =
          die.shape.faces.find((f) => f.value === value) ?? die.shape.faces[0];
        const q = new Quaternion().setFromUnitVectors(face.readNormal, UP);
        q.premultiply(new Quaternion().setFromAxisAngle(UP, die.randomYaw));
        die.readQuaternion.copy(q);
        const from = die.group.quaternion.clone(),
          progress = { t: 0 };
        die.tweenObj = progress;
        gsap.to(progress, {
          t: 1,
          duration: whenMotion(0.3),
          onUpdate: () =>
            die.group.quaternion.slerpQuaternions(from, q, progress.t),
        });
      }
      this.setState("settled");
      this.resultTimer = setTimeout(() => this.onSettled(this.roll), 320);
    }
  }

  /**
   * Push settled tabletop dice smoothly into a neat row in the bottom-left
   * corner of the recessed tray, preserving readable top faces.
   */
  tidyToCorner() {
    if (this.state !== "settled" || !this.dice.length || this.swept) return;
    clearTimeout(this.resultTimer);
    this.setState("docked");
    this.layoutDocked(false);
  }

  layoutDocked(immediate = false) {
    const { layout, floorY } = this.ctx.counter.get();
    if (!layout || !this.dice.length) return;
    const sorted = [...this.dice].sort(
      (a, b) => a.group.position.x - b.group.position.x,
    );
    this.dice = sorted;
    const baseScale = sorted[0].baseScale;
    const dockScale = Math.min(baseScale * 0.76, layout.indentWidth * 0.044, 0.118);
    const stepX = dockScale * 2.25;
    const stepZ = dockScale * 2.25;
    const maxCols = Math.max(
      4,
      Math.min(12, Math.floor((layout.indentWidth * 0.62) / stepX)),
    );
    const leftEdge = -layout.indentWidth / 2 + dockScale * 1.45 + 0.045;
    const bottomEdge = layout.indentHeight / 2 - dockScale * 1.45 - 0.045;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    this.dockHovered = false;

    sorted.forEach((die, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const tx = leftEdge + col * stepX;
      const tz = bottomEdge - row * stepZ;
      minX = Math.min(minX, tx - dockScale * 1.25);
      maxX = Math.max(maxX, tx + dockScale * 1.25);
      minZ = Math.min(minZ, tz - dockScale * 1.25);
      maxZ = Math.max(maxZ, tz + dockScale * 1.25);
      const heightRatio = dockScale / Math.max(die.baseScale, 0.001);
      const ty = floorY + Math.max(0.015, (die.restY - floorY) * heightRatio);
      die.dockPos.set(tx, ty, tz);
      die.dockScale = dockScale;

      gsap.killTweensOf(die.group.position);
      gsap.killTweensOf(die.group.scale);
      if (die.tweenObj) gsap.killTweensOf(die.tweenObj);

      // Keep top face readable while aligning yaw cleanly along the bottom-left row
      const faceVal =
        die.result.sides === "F"
          ? die.result.value < 0
            ? 1
            : die.result.value > 0
              ? 5
              : 3
          : die.result.value;
      const face =
        die.shape.faces.find((f) => f.value === faceVal) ?? die.shape.faces[0];
      const dockQuat = new Quaternion().setFromUnitVectors(face.readNormal, UP);
      dockQuat.premultiply(
        new Quaternion().setFromAxisAngle(UP, ((i % 3) - 1) * 0.08),
      );
      die.readQuaternion.copy(dockQuat);

      if (immediate) {
        die.group.position.set(tx, ty, tz);
        die.group.scale.setScalar(dockScale);
        die.group.quaternion.copy(dockQuat);
        return;
      }

      const startPos = die.group.position.clone();
      const startScale = die.group.scale.x;
      const startQuat = die.group.quaternion.clone();
      const travel = { t: 0 };
      die.tweenObj = travel;
      const delay = whenMotion(Math.min(0.28, i * 0.022));
      const dur = whenMotion(0.46);
      gsap.to(travel, {
        t: 1,
        duration: dur,
        delay,
        ease: "power2.out",
        onStart: () => {
          if (i < 6) {
            playSound("polaroid.dock", {
              volume: 0.16,
              rate: 1.55 + (i % 4) * 0.08,
              pan: -0.45,
            });
          }
        },
        onUpdate: () => {
          const t = travel.t;
          const lift = Math.sin(t * Math.PI) * 0.022;
          die.group.position.set(
            startPos.x + (tx - startPos.x) * t,
            startPos.y + (ty - startPos.y) * t + lift,
            startPos.z + (tz - startPos.z) * t,
          );
          die.group.scale.setScalar(startScale + (dockScale - startScale) * t);
          die.group.quaternion.slerpQuaternions(startQuat, dockQuat, t);
        },
      });
    });
    this.dockBounds =
      minX <= maxX && minZ <= maxZ ? { minX, maxX, minZ, maxZ } : null;
  }

  containsDocked(point) {
    if (
      !point ||
      this.state !== "docked" ||
      this.swept ||
      !this.dice.length ||
      !this.dockBounds
    ) {
      return false;
    }
    const pad = 0.055;
    return (
      point.x >= this.dockBounds.minX - pad &&
      point.x <= this.dockBounds.maxX + pad &&
      point.z >= this.dockBounds.minZ - pad &&
      point.z <= this.dockBounds.maxZ + pad
    );
  }

  setDockedHover(on) {
    const next = Boolean(on) && this.state === "docked" && !this.swept;
    if (this.dockHovered === next) return;
    this.dockHovered = next;
    if (!this.dice.length || this.state !== "docked" || this.swept) return;
    this.dice.forEach((die, i) => {
      gsap.to(die.group.position, {
        y: die.dockPos.y + (next ? 0.022 : 0),
        duration: whenMotion(next ? 0.22 : 0.26),
        delay: whenMotion(Math.min(0.08, i * 0.012)),
        ease: "power2.out",
        overwrite: "auto",
      });
    });
  }

  getLastRollInfo() {
    if (!this.roll || !this.dice.length) return null;
    return {
      notation: this.roll.notation,
      label: this.roll.label || "",
      count: this.dice.length,
    };
  }

  /**
   * Sweep dice temporarily off the left rim while viewing a note/archive route,
   * then glide them back on return.
   */
  setSwept(swept) {
    if (this.swept === swept) return;
    this.swept = swept;
    if (!this.dice.length || this.state === "rolling") return;
    const { layout, floorY } = this.ctx.counter.get();
    if (!layout) return;
    const exitX = -layout.indentWidth * 0.5 - 0.45;
    this.dice.forEach((die, i) => {
      gsap.killTweensOf(die.group.position);
      if (die.tweenObj) gsap.killTweensOf(die.tweenObj);
      const target =
        this.state === "docked" ? die.dockPos : die.settledPos;
      gsap.to(die.group.position, {
        x: swept ? exitX : target.x,
        y: swept ? floorY + layout.indentDepth + die.group.scale.x * 1.2 : target.y,
        z: target.z,
        duration: whenMotion(swept ? 0.36 : 0.44),
        delay: whenMotion(i * 0.015),
        ease: swept ? "power3.in" : "power3.out",
      });
    });
  }

  /**
   * Gather dice into the top CounterSlot shutter right before printing a roll note.
   */
  collectIntoSlot(onArrived) {
    clearTimeout(this.resultTimer);
    if (!this.dice.length) {
      onArrived?.();
      return;
    }
    const { slot, floorY } = this.ctx.counter.get();
    if (!slot) {
      this.sweepOut(false);
      onArrived?.();
      return;
    }
    this.ctx.counterObject.slotModule?.open();
    const batch = this.dice;
    this.dice = [];
    this.world = null;
    this.settled = true;
    this.stats.stepping = false;
    this.stats.bodies = 0;
    this.dockBounds = null;
    this.dockHovered = false;
    this.setState("idle");

    let fired = false;
    const triggerArrival = () => {
      if (fired) return;
      fired = true;
      onArrived?.();
    };

    batch.forEach((d, i) => {
      this.exiting.add(d);
      gsap.killTweensOf(d.group.position);
      gsap.killTweensOf(d.group.scale);
      if (d.tweenObj) gsap.killTweensOf(d.tweenObj);
      const startPos = d.group.position.clone();
      const startScale = d.group.scale.x;
      const targetX = slot.x + ((i % 5) - 2) * 0.035;
      const targetZ = slot.z;
      const travel = { t: 0 };
      d.tweenObj = travel;
      gsap.to(travel, {
        t: 1,
        duration: whenMotion(0.34),
        delay: whenMotion(Math.min(0.12, i * 0.014)),
        ease: "power2.in",
        onUpdate: () => {
          const t = travel.t;
          const arc = Math.sin(t * Math.PI) * 0.06;
          d.group.position.set(
            startPos.x + (targetX - startPos.x) * t,
            startPos.y + (floorY - 0.015 - startPos.y) * t + arc,
            startPos.z + (targetZ - startPos.z) * t,
          );
          d.group.scale.setScalar(startScale * (1 - t * 0.65));
        },
        onComplete: () => {
          this.exiting.delete(d);
          releaseDie(d);
          if (i === batch.length - 1) triggerArrival();
        },
      });
    });
    // Safety fallback if motion is instant or interrupted
    setTimeout(triggerArrival, 460);
  }

  /**
   * Sweep existing dice smoothly over the left rim with physical roll rotation.
   */
  sweepOut(immediate = false) {
    clearTimeout(this.resultTimer);
    this.settled = true;
    this.stats.stepping = false;
    const dice = this.dice;
    this.dice = [];
    this.world = null;
    this.stats.bodies = 0;
    this.dockBounds = null;
    this.dockHovered = false;
    this.setState("idle");
    const { layout, floorY } = this.ctx.counter.get();
    const exitX = layout ? -layout.indentWidth * 0.5 - 0.5 : -2.5;
    const rimY = layout ? floorY + layout.indentDepth : floorY + 0.02;

    const sorted = [...dice].sort(
      (a, b) => a.group.position.x - b.group.position.x,
    );
    sorted.forEach((d, i) => {
      if (immediate) {
        releaseDie(d);
        return;
      }
      this.exiting.add(d);
      gsap.killTweensOf(d.group.position);
      gsap.killTweensOf(d.group.scale);
      if (d.tweenObj) gsap.killTweensOf(d.tweenObj);

      const startPos = d.group.position.clone();
      const startQuat = d.group.quaternion.clone();
      const targetY = rimY + d.group.scale.x * 1.15;
      const targetZ = startPos.z + (i % 2 === 0 ? -0.05 : 0.05);
      const dx = exitX - startPos.x;
      const dz = targetZ - startPos.z;
      const dist = Math.hypot(dx, dz);
      const rollAxis = new Vector3(dz, 0, -dx).normalize();
      if (rollAxis.lengthSq() < 0.001) rollAxis.set(0, 0, 1);
      const totalAngle = dist / Math.max(d.group.scale.x * 0.7, 0.04);
      const spin = new Quaternion();
      const travel = { t: 0 };
      d.tweenObj = travel;

      gsap.to(travel, {
        t: 1,
        duration: whenMotion(0.36),
        delay: whenMotion(Math.min(0.18, i * 0.016)),
        ease: "power3.in",
        onUpdate: () => {
          const t = travel.t;
          const liftCurve = Math.min(1, t * 2.4);
          d.group.position.set(
            startPos.x + dx * t,
            startPos.y + (targetY - startPos.y) * liftCurve,
            startPos.z + dz * t,
          );
          spin.setFromAxisAngle(rollAxis, totalAngle * t);
          d.group.quaternion.copy(startQuat).premultiply(spin);
        },
        onComplete: () => {
          this.exiting.delete(d);
          releaseDie(d);
        },
      });
    });
  }

  clear(immediate = false) {
    if (immediate) {
      this.sweepOut(true);
      for (const d of this.exiting) releaseDie(d);
      this.exiting.clear();
    } else {
      this.sweepOut(false);
    }
  }

  dispose() {
    this.off();
    this.offCounter?.();
    this.clear(true);
    this.object.removeFromParent();
  }
}

const atlasCache = new Map();
function atlas(color) {
  if (atlasCache.has(color)) return atlasCache.get(color);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 74px Georgia, serif";
  for (let i = 0; i < 35; i++)
    ctx.fillText(
      i <= 20
        ? String(i)
        : i < 31
          ? String((i - 21) * 10).padStart(2, "0")
          : ["?", "−", "·", "+"][i - 31],
      ((i % 8) + 0.5) * 128,
      (Math.floor(i / 8) + 0.5) * 128,
    );
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  atlasCache.set(color, texture);
  return texture;
}
