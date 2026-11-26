import {
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "../engine/index.js";
import {
  getCounterLayout,
  createCounterShape,
  createIndentFloorGeometry,
  applyBoxUVs,
} from "../shared/counterGeometry.js";
import { loadPlasterTextures, paintWearUniforms } from "./plaster.js";
import {
  loadSurfaceTextureSet,
  resolveSurfaceTheme,
} from "./surfacePresets.js";
import { createSurfaceMaterial } from "./surfaceMaterial.js";
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
    this.theme = resolveSurfaceTheme(null);
    this.themeVersion = 0;
    this.frameTextures = null;
    this.trayTextures = null;
    this.updateSurfaceInk();
    this.off = ctx.app.stores.size.subscribe(() => this.rebuild());
    this.rebuild();
    // Always load plaster base maps once so SurfaceClock3D paintMaps stay populated
    this.ready = Promise.all([
      loadPlasterTextures(ctx.controls.material.anisotropy),
      this.loadThemeTextures(this.theme),
    ]).then(() => {
      if (!this.disposed) this.rebuild(true);
    });
  }

  updateSurfaceInk() {
    const tray = this.theme.tray;
    this.ctx.surfaceInk = {
      isDark: Boolean(tray.isDark),
      stampInk: tray.stampInk ?? "#514b3e",
      stampHoverInk: tray.stampHoverInk ?? "#2a241b",
      wellInk: tray.wellInk ?? "#655d4c",
      slotBaseColor: tray.slotBaseColor ?? "#24211c",
    };
  }

  async loadThemeTextures(resolved) {
    const aniso = this.ctx.controls.material.anisotropy;
    const [frameTex, trayTex] = await Promise.all([
      loadSurfaceTextureSet(resolved.frame, aniso),
      loadSurfaceTextureSet(resolved.tray, aniso),
    ]);
    if (this.disposed) return;
    this.frameTextures = frameTex;
    this.trayTextures = trayTex;
  }

  async setSurfaceTheme(nextTheme) {
    const resolved = resolveSurfaceTheme(nextTheme);
    const same =
      resolved.frameId === this.theme.frameId &&
      resolved.trayId === this.theme.trayId;
    if (same && this.slabSurface && this.floorSurface) return;
    this.theme = resolved;
    const token = ++this.themeVersion;
    this.updateSurfaceInk();
    await this.loadThemeTextures(resolved);
    if (this.disposed || token !== this.themeVersion) return;
    this.disposeSurfaces();
    this.rebuild(true);
    this.ctx.clock?.refreshInk?.();
    this.ctx.eventClock?.refreshInk?.();
  }

  disposeSurfaces() {
    if (this.slabSurface) {
      this.slabSurface.material.dispose();
      this.slabSurface = null;
    }
    if (this.floorSurface) {
      this.floorSurface.material.dispose();
      this.floorSurface = null;
    }
  }

  rebuild(force = false) {
    const { app, controls, counter } = this.ctx;
    const ready = Boolean(this.frameTextures && this.trayTextures);
    const layoutKey = `${app.size.width}|${app.size.height}|${ready}|${this.theme.frameId}|${this.theme.trayId}`;
    if (!force && layoutKey === this.layoutKey) return;
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
    if (!ready) {
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
      opacity: this.theme.frame.cavityOpacity ?? 0.64,
      color: this.theme.frame.cavityColor ?? "#1a1814",
    };
    const cavity = {
      ...rim,
      kind: undefined,
      opacity: this.theme.tray.cavityOpacity ?? 0.35,
      fade: 0.08,
      color: this.theme.tray.cavityColor ?? "#1a1814",
    };

    if (!this.slabSurface || !this.floorSurface) {
      if (this.slab.material && !this.slabSurface) this.slab.material.dispose();
      if (this.floor.material && !this.floorSurface) this.floor.material.dispose();
      this.slabSurface = createSurfaceMaterial(
        this.theme.frame,
        this.frameTextures,
        extent,
        rim,
        { bump: this.theme.frame.kind !== "plaster", wear: worn },
      );
      this.floorSurface = createSurfaceMaterial(
        this.theme.tray,
        this.trayTextures,
        extent,
        cavity,
        { wear: worn },
      );
      this.slab.material = this.slabSurface.material;
      this.floor.material = this.floorSurface.material;
    } else {
      this.slabSurface.update(this.theme.frame, extent, rim, {
        bump: this.theme.frame.kind !== "plaster",
        wear: worn,
      });
      this.floorSurface.update(this.theme.tray, extent, cavity, {
        wear: worn,
      });
    }
    paintWearUniforms.amount.value =
      this.theme.tray.wearMode === "plaster" ? controls.wear.text : 0.16;
    paintWearUniforms.dirt.value =
      this.theme.tray.wearMode === "plaster" ? controls.wear.stains * 2 : 0.06;
    this.well?.dispose();
    this.well = new ArchiveWell(this.ctx, this.floorSurface.material);
    this.well.setArchived(this.archivedNotes ?? []);
    this.object.add(this.well.object);
    this.slotModule?.dispose();
    this.slotModule = new CounterSlot(
      slot,
      floorY,
      this.floorSurface.material,
      this.ctx.surfaceInk?.slotBaseColor,
    );
    this.object.add(this.slotModule.object);
  }

  dispose() {
    this.disposed = true;
    this.off();
    this.well?.dispose();
    this.slotModule?.dispose();
    this.slab.geometry?.dispose();
    this.floor.geometry?.dispose();
    this.disposeSurfaces();
    this.slab.material?.dispose?.();
    this.floor.material?.dispose?.();
    this.object.removeFromParent();
  }
}
