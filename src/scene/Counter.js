import {
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "../engine/index.js";
import {
  getCounterLayout,
  createCounterShape,
  createIndentFloorGeometry,
  applyBoxUVs,
} from "../shared/counterGeometry.js";
import {
  createPlasterMaterial,
  loadPlasterTextures,
  paintWearUniforms,
} from "./plaster.js";
import { ArchiveWell } from "./ArchiveWell.js";
import { CounterSlot } from "./CounterSlot.js";
export class Counter {
  constructor(ctx) {
    this.ctx = ctx;
    this.object = new Group();
    this.slab = new Mesh();
    this.slab.castShadow = true;
    this.slab.receiveShadow = true;
    this.floor = new Mesh();
    this.floor.receiveShadow = true;
    this.object.add(this.slab, this.floor);
    this.off = ctx.app.stores.size.subscribe(() => this.rebuild());
    this.rebuild();
    this.ready = loadPlasterTextures(ctx.controls.material.anisotropy).then(
      (textures) => {
        if (!this.disposed) {
          this.textures = textures;
          this.rebuild();
        }
      },
    );
  }
  rebuild() {
    const { app, controls, counter } = this.ctx;
    const layoutKey = `${app.size.width}|${app.size.height}|${Boolean(this.textures)}`;
    if (layoutKey === this.layoutKey) return;
    this.layoutKey = layoutKey;
    const layout = getCounterLayout(
      app.size.width,
      app.size.height,
      controls.camera,
      {
        ...controls.counter,
        bevelSize: controls.bevel.size,
        bevelThickness: controls.bevel.thickness,
        curveSegments: controls.bevel.curveSegments,
      },
    );
    this.layout = layout;
    const wellWidth = Math.min(layout.indentWidth * 0.19, 0.72),
      wellHeight = Math.min(layout.indentHeight * 0.22, 0.63);
    const zone = {
      x: layout.indentWidth / 2 - wellWidth / 2 - 0.09,
      z: layout.indentHeight / 2 - wellHeight / 2 - 0.09,
      width: wellWidth,
      height: wellHeight,
      radius: 0.045,
    };
    const floorY = -layout.indentDepth + 0.0016;
    const slot = {
      x: 0,
      z: -layout.indentHeight / 2 + 0.28,
      width: Math.min(0.84, layout.indentWidth * 0.4),
      height: 0.025,
      radius: 0.005,
    };
    counter.replace({ layout, zone, floorY, slot });
    this.slab.geometry?.dispose();
    this.floor.geometry?.dispose();
    const geometry = new ExtrudeGeometry(createCounterShape(layout), {
      depth: layout.thickness,
      bevelEnabled: true,
      bevelThickness:
        Math.max(layout.bevelThickness, layout.indentDepth) + 0.01,
      bevelSize: layout.bevelSize,
      bevelOffset: controls.bevel.offset,
      bevelSegments: controls.bevel.segments,
      curveSegments: layout.curveSegments,
    });
    geometry.rotateX(-Math.PI / 2);
    applyBoxUVs(geometry);
    this.slab.geometry = geometry;
    this.floor.geometry = createIndentFloorGeometry(layout, zone, slot);
    this.floor.position.y = floorY;
    if (!this.textures) {
      this.slab.material ??= new MeshBasicMaterial({ color: "#b8b2a6" });
      this.floor.material ??= new MeshBasicMaterial({ color: "#d8d2c8" });
      return;
    }
    const extent = Math.min(layout.counterWidth, layout.counterHeight);
    const worn = {
      ...controls.wear,
      lip: {
        width: layout.indentWidth,
        height: layout.indentHeight,
        radius: layout.indentRadius,
        lipInset: controls.bevel.offset,
        wallInset: controls.bevel.offset + layout.bevelSize,
      },
    };
    const rim = {
      kind: "rim",
      width: layout.indentWidth,
      height: layout.indentHeight,
      radius: layout.indentRadius,
      fade: 0.05,
      blur: 1.1,
      opacity: 0.64,
      color: "#1a1814",
    };
    const cavity = { ...rim, kind: undefined, opacity: 0.35, fade: 0.08 };
    if (!this.slabPlaster) {
      this.slab.material?.dispose();
      this.floor.material?.dispose();
      this.slabPlaster = createPlasterMaterial(
        this.textures,
        controls.material,
        extent,
        rim,
        { bump: false, wear: worn },
      );
      this.floorPlaster = createPlasterMaterial(
        this.textures,
        controls.material,
        extent,
        cavity,
        { wear: worn },
      );
      this.slab.material = this.slabPlaster.material;
      this.floor.material = this.floorPlaster.material;
    } else {
      this.slabPlaster.update(controls.material, extent, rim, {
        bump: false,
        wear: worn,
      });
      this.floorPlaster.update(controls.material, extent, cavity, {
        wear: worn,
      });
    }
    paintWearUniforms.amount.value = controls.wear.text;
    paintWearUniforms.dirt.value = controls.wear.stains * 2;
    this.well?.dispose();
    this.well = new ArchiveWell(this.ctx, this.floorPlaster.material);
    this.well.setArchived(this.archivedNotes ?? []);
    this.object.add(this.well.object);
    this.slotModule?.dispose();
    this.slotModule = new CounterSlot(slot, floorY, this.floorPlaster.material);
    this.object.add(this.slotModule.object);
  }
  dispose() {
    this.disposed = true;
    this.off();
    this.well?.dispose();
    this.slotModule?.dispose();
    this.slab.geometry?.dispose();
    this.floor.geometry?.dispose();
    this.slab.material?.dispose();
    this.floor.material?.dispose();
    this.object.removeFromParent();
  }
}
