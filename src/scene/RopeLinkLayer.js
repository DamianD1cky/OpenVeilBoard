import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  CatmullRomCurve3,
  Vector3,
} from "../engine/index.js";
import { createRope, stepRope, ROPE_POINTS } from "../features/rope/labRope.js";
import { benchSurface } from "../features/rope/labBenchLayout.js";
import { SurfaceStamp } from "./SurfaceClock3D.js";
import { visibleEdges } from "../domain/geometry.js";
function tubeGeometry(count) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array((count + 1) * 7 * 3), 3),
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(new Float32Array((count + 1) * 7 * 3), 3),
  );
  const indices = [];
  for (let i = 0; i < count; i++)
    for (let j = 0; j < 6; j++) {
      const a = i * 7 + j,
        b = a + 7;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  geometry.setIndex(indices);
  return geometry;
}
export class RopeLinkLayer {
  constructor(ctx, field) {
    this.ctx = ctx;
    this.field = field;
    this.object = new Group();
    this.links = new Map();
    this.active = new Set();
    this.byNote = new Map();
    this.off = ctx.app.onFrame(
      (_, dt) => this.frame(Math.min(dt, 1 / 30)),
      -0.4,
    );
    this.stats = { awake: 0, uploads: 0, endpointSamples: 0 };
  }
  sync(notes, edges) {
    this.notes = notes;
    const active = visibleEdges(notes, edges),
      ids = new Set(active.map((e) => e.id));
    for (const [id, link] of this.links)
      if (!ids.has(id)) {
        this.destroy(link);
        this.links.delete(id);
      }
    for (const edge of active) {
      let link = this.links.get(edge.id);
      if (!link) {
        const a = this.field.cards.get(edge.fromNoteId)?.anchor(),
          b = this.field.cards.get(edge.toNoteId)?.anchor();
        if (!a || !b) continue;
        const surface = this.surface();
        const rope = createRope(
          [
            [a.x, a.z],
            [(a.x + b.x) / 2 + 0.03, (a.z + b.z) / 2 + 0.05],
            [b.x, b.z],
          ],
          surface,
          0.005,
        );
        rope.plugged = a;
        rope.grabbed = -1;
        const mesh = new Mesh(
          tubeGeometry(active.length > 40 ? 12 : 26),
          new MeshStandardMaterial({
            color: edge.color,
            roughness: 0.95,
            transparent: true,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.object.add(mesh);
        link = {
          rope,
          mesh,
          edge,
          lastA: new Vector3(100, 100, 100),
          lastB: new Vector3(),
          still: 0,
          points: Array.from({ length: ROPE_POINTS }, () => new Vector3()),
        };
        this.links.set(edge.id, link);
        for (const id of [edge.fromNoteId, edge.toNoteId]) {
          if (!this.byNote.has(id)) this.byNote.set(id, new Set());
          this.byNote.get(id).add(link);
        }
        this.wake(link);
      }
      link.edge = edge;
      link.mesh.material.color.set(edge.color);
      if (edge.label !== link.labelText) {
        link.label?.dispose();
        link.labelText = edge.label;
        link.label = edge.label
          ? new SurfaceStamp(
              this.ctx,
              Math.min(0.48, 0.08 + edge.label.length * 0.028),
              0.05,
              true,
            )
          : null;
        if (link.label) {
          link.label.draw(edge.label);
          this.object.add(link.label.object);
          this.wake(link);
        }
      }
    }
    this.highlight(this.highlighted);
  }
  surface() {
    const s = benchSurface(this.ctx.counter.get().layout);
    s.boxes = [...this.field.cards.values()].map((c) => ({
      x: c.object.position.x,
      z: c.object.position.z,
      cos: Math.cos(c.object.rotation.y),
      sin: Math.sin(c.object.rotation.y),
      halfWidth: c.width / 2,
      halfDepth: c.height / 2,
      top: c.object.position.y + 0.008,
    }));
    return s;
  }
  setVisible(visible) {
    this.object.visible = visible;
    if (visible) {
      for (const link of this.links.values()) this.wake(link);
    }
  }
  highlight(id) {
    this.highlighted = id;
    this.highlightedEdge = null;
    this.applyHighlight();
  }
  highlightEdge(edgeId) {
    if (this.highlightedEdge === edgeId) return;
    this.highlightedEdge = edgeId;
    this.applyHighlight();
  }
  applyHighlight() {
    for (const link of this.links.values()) {
      const active = this.highlightedEdge
        ? link.edge.id === this.highlightedEdge
        : !this.highlighted ||
          link.edge.fromNoteId === this.highlighted ||
          link.edge.toNoteId === this.highlighted;
      link.mesh.material.opacity = active ? 1 : 0.25;
    }
  }
  at(point) {
    if (!point) return null;
    let best = null;
    let bestDistSq = 0.048 * 0.048;
    for (const link of this.links.values()) {
      if (link.label) {
        const lp = link.label.object.position;
        const halfW = (link.label.width ?? 0.24) * 0.55;
        if (
          Math.abs(point.x - lp.x) <= halfW &&
          Math.abs(point.z - lp.z) <= 0.045
        ) {
          return link.edge;
        }
      }
      const pos = link.rope.position;
      for (let i = 0; i < ROPE_POINTS - 1; i++) {
        const ax = pos[i * 3],
          az = pos[i * 3 + 2],
          bx = pos[(i + 1) * 3],
          bz = pos[(i + 1) * 3 + 2];
        const dx = bx - ax,
          dz = bz - az;
        const lenSq = dx * dx + dz * dz;
        const t =
          lenSq > 1e-8
            ? Math.max(
                0,
                Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lenSq),
              )
            : 0;
        const px = ax + dx * t - point.x,
          pz = az + dz * t - point.z;
        const dSq = px * px + pz * pz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = link.edge;
        }
      }
    }
    return best;
  }
  wake(link) {
    link.still = 0;
    this.active.add(link);
    this.stats.awake = this.active.size;
  }
  wakeNote(id) {
    for (const link of this.byNote.get(id) ?? []) this.wake(link);
  }
  beginPreview(noteId) {
    this.clearPreview();
    const a = this.field.cards.get(noteId)?.anchor();
    if (!a) return;
    const end = a.clone().add(new Vector3(0.12, 0, 0.04));
    const rope = createRope(
      [
        [a.x, a.z],
        [end.x, end.z],
      ],
      this.surface(),
      0.005,
    );
    const mesh = new Mesh(
      tubeGeometry(26),
      new MeshStandardMaterial({ color: "#b83227", roughness: 0.95 }),
    );
    mesh.castShadow = true;
    this.object.add(mesh);
    this.preview = {
      rope,
      mesh,
      edge: { fromNoteId: noteId },
      end,
      lastA: new Vector3(100, 100, 100),
      lastB: new Vector3(),
      still: 0,
      points: Array.from({ length: ROPE_POINTS }, () => new Vector3()),
    };
    this.wake(this.preview);
  }
  movePreview(point) {
    if (this.preview) {
      this.preview.end.set(
        point.x,
        this.ctx.counter.get().floorY + 0.04,
        point.z,
      );
      this.wake(this.preview);
    }
  }
  clearPreview() {
    if (this.preview) {
      this.destroy(this.preview);
      this.preview = null;
    }
  }
  frame(dt) {
    if (!this.active.size) return;
    const surface = this.surface();
    for (const link of this.active) {
      this.stats.endpointSamples++;
      const a = this.field.cards.get(link.edge.fromNoteId)?.anchor(),
        b = link.end ?? this.field.cards.get(link.edge.toNoteId)?.anchor();
      if (!a || !b) {
        this.active.delete(link);
        continue;
      }
      const changed =
        a.distanceToSquared(link.lastA) > 1e-8 ||
        b.distanceToSquared(link.lastB) > 1e-8;
      if (changed) {
        link.lastA.copy(a);
        link.lastB.copy(b);
        link.rope.rest.fill((a.distanceTo(b) * 1.12) / (ROPE_POINTS - 1));
      }
      link.rope.plugged = a;
      const offset = (ROPE_POINTS - 1) * 3;
      link.rope.position.set([b.x, b.y, b.z], offset);
      link.rope.previous.set([b.x, b.y, b.z], offset);
      const movement = stepRope(link.rope, surface, dt || 1 / 60);
      link.still = !changed && movement < 0.001 ? link.still + dt : 0;
      if (link.still > 0.8) this.active.delete(link);
      this.write(link);
    }
    this.stats.awake = this.active.size;
  }
  write(link) {
    const { rope, mesh, points } = link;
    points.forEach((p, i) => p.fromArray(rope.position, i * 3));
    const curve = new CatmullRomCurve3(points),
      geometry = mesh.geometry;
    const pos = geometry.attributes.position,
      norm = geometry.attributes.normal,
      count = pos.count / 7 - 1;
    const p = new Vector3(),
      tangent = new Vector3(),
      right = new Vector3(),
      up = new Vector3(0, 1, 0),
      normal = new Vector3();
    for (let i = 0; i <= count; i++) {
      curve.getPoint(i / count, p);
      curve.getTangent(i / count, tangent);
      right.crossVectors(tangent, up).normalize();
      normal.crossVectors(right, tangent).normalize();
      for (let j = 0; j <= 6; j++) {
        const angle = (j * Math.PI) / 3,
          nx = right.x * Math.cos(angle) + normal.x * Math.sin(angle),
          ny = right.y * Math.cos(angle) + normal.y * Math.sin(angle),
          nz = right.z * Math.cos(angle) + normal.z * Math.sin(angle);
        pos.setXYZ(
          i * 7 + j,
          p.x + nx * rope.radius,
          p.y + ny * rope.radius,
          p.z + nz * rope.radius,
        );
        norm.setXYZ(i * 7 + j, nx, ny, nz);
      }
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
    geometry.computeBoundingSphere();
    this.stats.uploads++;
    if (link.label) {
      const middle = curve.getPoint(0.5);
      link.label.object.position.set(middle.x, middle.y + 0.012, middle.z);
    }
  }
  destroy(link) {
    this.active.delete(link);
    this.stats.awake = this.active.size;
    for (const id of [link.edge.fromNoteId, link.edge.toNoteId]) {
      const links = this.byNote.get(id);
      links?.delete(link);
      if (links?.size === 0) this.byNote.delete(id);
    }
    link.mesh.geometry.dispose();
    link.mesh.material.dispose();
    link.mesh.removeFromParent();
    link.label?.dispose();
  }
  dispose() {
    this.off();
    this.clearPreview();
    this.links.forEach((link) => this.destroy(link));
    this.object.removeFromParent();
  }
}
