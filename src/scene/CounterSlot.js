import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "../engine/index.js";
import { applyPlanarUVs } from "../shared/counterGeometry.js";
import { gsap, whenMotion } from "../shared/motion.js";
export class CounterSlot {
  constructor(slot, floorY, plaster, baseColor = "#24211c") {
    this.slot = slot;
    this.object = new Group();
    this.object.position.set(slot.x, floorY + 0.0005, slot.z);
    const base = new Mesh(
      new PlaneGeometry(slot.width, slot.height),
      new MeshBasicMaterial({ color: baseColor }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.005;
    this.object.add(base);
    this.base = base;
    this.shutters = [-1, 1].map((side) => {
      const geometry = new PlaneGeometry(slot.width, slot.height / 2 + 0.001);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, (side * slot.height) / 4);
      applyPlanarUVs(geometry);
      const mesh = new Mesh(geometry, plaster);
      mesh.receiveShadow = true;
      this.object.add(mesh);
      return mesh;
    });
  }
  open() {
    clearTimeout(this.timer);
    this.shutters.forEach((shutter, i) => {
      gsap.killTweensOf(shutter.position);
      gsap.to(shutter.position, {
        z: ((i ? 1 : -1) * this.slot.height) / 2,
        duration: whenMotion(0.2),
      });
    });
    this.timer = setTimeout(() => this.close(), 750);
  }
  close() {
    this.shutters.forEach((shutter) =>
      gsap.to(shutter.position, { z: 0, duration: whenMotion(0.35) }),
    );
  }
  dispose() {
    clearTimeout(this.timer);
    this.shutters.forEach((shutter) => {
      gsap.killTweensOf(shutter.position);
      shutter.geometry.dispose();
    });
    this.base.geometry.dispose();
    this.base.material.dispose();
    this.object.removeFromParent();
  }
}
