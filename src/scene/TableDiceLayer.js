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
export class TableDiceLayer {
  constructor(ctx, field, onSettled) {
    this.ctx = ctx;
    this.field = field;
    this.onSettled = onSettled;
    this.object = new Group();
    this.dice = [];
    this.off = ctx.app.onFrame((_, dt) => this.frame(dt), -0.3);
    this.stats = { stepping: false, bodies: 0 };
  }
  throw(roll, preset = "ivory") {
    if (!roll.result || roll.id === this.lastId) return;
    this.clear(true);
    this.lastId = roll.id;
    this.roll = roll;
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
        randomYaw: random() * 6.28,
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
      this.onSettled(roll);
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
      for (const die of this.dice) {
        die.body.velocity.setZero();
        die.body.angularVelocity.setZero();
        die.body.sleep();
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
        const q = new Quaternion().setFromUnitVectors(
          face.readNormal,
          new Vector3(0, 1, 0),
        );
        q.premultiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 1, 0),
            die.randomYaw,
          ),
        );
        const from = die.group.quaternion.clone(),
          progress = { t: 0 };
        gsap.to(progress, {
          t: 1,
          duration: whenMotion(0.3),
          onUpdate: () =>
            die.group.quaternion.slerpQuaternions(from, q, progress.t),
        });
      }
      this.resultTimer = setTimeout(() => this.onSettled(this.roll), 320);
      this.clearTimer = setTimeout(() => this.clear(), 8320);
    }
  }
  clear(immediate = false) {
    clearTimeout(this.resultTimer);
    clearTimeout(this.clearTimer);
    this.settled = true;
    this.stats.stepping = false;
    const dice = this.dice;
    this.dice = [];
    this.world = null;
    this.stats.bodies = 0;
    for (const d of dice) {
      const release = () => {
        d.geometry.body.dispose();
        d.geometry.marks.dispose();
        d.bodyMaterial.dispose();
        d.marksMaterial.dispose();
        d.group.removeFromParent();
      };
      if (immediate) {
        gsap.killTweensOf(d.group.scale);
        release();
      } else
        gsap.to(d.group.scale, {
          x: 0,
          y: 0,
          z: 0,
          duration: whenMotion(0.22),
          onComplete: release,
        });
    }
  }
  dispose() {
    this.off();
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
