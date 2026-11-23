import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "../engine/index.js";
import {
  extrudeDown,
  createWellWallShape,
  createWellPlugShape,
} from "../shared/counterGeometry.js";
import {
  createNoteTexture,
  cardAspect,
  noteRoughnessMap,
} from "../features/polaroids/noteTexture.js";
import { DropDockCue } from "./DropDockCue.js";
import { SurfaceStamp } from "./SurfaceClock3D.js";

export function fitScaleInWell(zone, cardWidth, cardHeight) {
  const maxW = zone.width * 0.78;
  const maxH = zone.height * 0.62;
  return Math.min(maxW / Math.max(cardWidth, 0.01), maxH / Math.max(cardHeight, 0.01), 0.92);
}

export function wellSeatOffsetZ(zone) {
  return -zone.height * 0.08;
}

export class ArchiveWell {
  constructor(ctx, plaster) {
    this.ctx = ctx;
    this.object = new Group();
    const { zone, floorY } = ctx.counter.get();
    this.zone = zone;
    this.object.position.set(zone.x, floorY, zone.z);
    const wall = new Mesh(
      extrudeDown(createWellWallShape(zone), 0.1, {
        enabled: true,
        size: 0.012,
        thickness: 0.012,
        segments: 3,
      }),
      plaster,
    );
    const base = new Mesh(
      extrudeDown(createWellPlugShape(zone), 0.014),
      plaster,
    );
    base.position.y = -0.1;
    base.receiveShadow = true;
    this.object.add(wall, base);

    this.previewMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.85,
      metalness: 0,
    });
    this.preview = new Mesh(new PlaneGeometry(1, 1), this.previewMaterial);
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.position.set(0, -0.084, wellSeatOffsetZ(zone));
    this.preview.receiveShadow = true;
    this.preview.visible = false;
    this.object.add(this.preview);

    this.stamp = new SurfaceStamp(ctx, zone.width * 0.9, zone.height * 0.15);
    this.stamp.object.position.set(0, -0.018, zone.height * 0.34);
    this.object.add(this.stamp.object);

    this.cue = new DropDockCue(ctx, { zone, floorY, active: false });
    ctx.app.scene.add(this.cue.object);
    this.setArchived([]);
  }
  setArchived(archivedNotes = []) {
    const count = archivedNotes.length;
    this.stamp.draw(`便签盒 · ${String(count).padStart(2, "0")}`, "#655d4c");
    if (!count) {
      this.preview.visible = false;
      this.previewKey = null;
      this.previewTexture?.dispose();
      this.previewTexture = null;
      return;
    }
    const latest = [...archivedNotes].sort(
      (a, b) =>
        new Date(b.archivedAt || 0).getTime() -
        new Date(a.archivedAt || 0).getTime(),
    )[0];
    const aspect = cardAspect(latest.cardStyle);
    const maxW = this.zone.width * 0.78;
    const maxH = this.zone.height * 0.62;
    const width = Math.min(maxW, maxH * aspect);
    const height = width / aspect;
    this.preview.scale.set(width, height, 1);
    this.preview.position.set(0, -0.084, wellSeatOffsetZ(this.zone));
    this.preview.visible = true;

    const key = JSON.stringify([
      latest.id,
      latest.title,
      latest.body,
      latest.cardStyle,
      latest.color,
      latest.capabilities,
      latest.imageUrl,
    ]);
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.previewTexture?.dispose();
    this.previewTexture = createNoteTexture(latest);
    this.previewMaterial.map = this.previewTexture;
    this.previewMaterial.roughnessMap = noteRoughnessMap(latest);
    this.previewMaterial.needsUpdate = true;
    const token = (this.imageToken = {});
    if (latest.imageUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (this.disposed || token !== this.imageToken) return;
        this.previewTexture?.dispose();
        this.previewTexture = createNoteTexture(latest, image);
        this.previewMaterial.map = this.previewTexture;
        this.previewMaterial.roughnessMap = noteRoughnessMap(latest, true);
        this.previewMaterial.needsUpdate = true;
      };
      image.src = latest.imageUrl;
    }
  }
  setCount(count) {
    this.stamp.draw(`便签盒 · ${String(count).padStart(2, "0")}`, "#655d4c");
    if (!count) this.preview.visible = false;
  }
  highlight(active, point, hint = false) {
    this.cue.update({
      zone: this.zone,
      floorY: this.ctx.counter.get().floorY,
      active,
      entry: point,
      hint,
    });
  }
  contains(point) {
    return (
      Math.abs(point.x - this.zone.x) < this.zone.width / 2 &&
      Math.abs(point.z - this.zone.z) < this.zone.height / 2
    );
  }
  dispose() {
    this.disposed = true;
    this.cue.dispose();
    this.stamp.dispose();
    this.previewTexture?.dispose();
    this.previewMaterial.dispose();
    this.object.traverse((o) => {
      if (o.isMesh) o.geometry?.dispose();
    });
    this.object.removeFromParent();
  }
}
