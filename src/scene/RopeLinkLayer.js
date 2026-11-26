import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "../engine/index.js";
import { visibleEdges } from "../domain/geometry.js";
import {
  classifyEdgeTag,
  parseEdgeLabel,
} from "../domain/edgeRelations.ts";

const STRING_SEGMENTS = 10;
const RADIAL_SEGMENTS = 6;

const STYLE_CONFIG = {
  rope: { radius: 0.0029, roughness: 0.92, metalness: 0.0, twist: 48.0 },
  twine: { radius: 0.0034, roughness: 0.96, metalness: 0.0, twist: 62.0 },
  gold: { radius: 0.0024, roughness: 0.32, metalness: 0.72, twist: 38.0 },
  muted: { radius: 0.0026, roughness: 0.94, metalness: 0.0, twist: 42.0 },
};

function createTubeGeometry(segments = STRING_SEGMENTS) {
  const verts = (segments + 1) * (RADIAL_SEGMENTS + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(verts * 3), 3),
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(new Float32Array(verts * 3), 3),
  );
  const uvs = new Float32Array(verts * 2);
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
      const idx = (i * (RADIAL_SEGMENTS + 1) + j) * 2;
      uvs[idx] = j / RADIAL_SEGMENTS;
      uvs[idx + 1] = i / segments;
    }
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  const indices = [];
  const ring = RADIAL_SEGMENTS + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setIndex(indices);
  return geometry;
}

let sharedCollarGeometry = null;
function getCollarGeometry() {
  if (sharedCollarGeometry) return sharedCollarGeometry;
  const majorR = 0.0135;
  const minorR = 0.0033;
  const tubular = 14;
  const radial = 6;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= tubular; i++) {
    const u = (i / tubular) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const r = majorR + minorR * cv;
      positions.push(r * cu, minorR * sv, r * su);
      normals.push(cv * cu, sv, cv * su);
      uvs.push(i / tubular, j / radial);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  sharedCollarGeometry = geo;
  return geo;
}

function createStringMaterial(edge) {
  const cfg = STYLE_CONFIG[edge.style] ?? STYLE_CONFIG.rope;
  const material = new MeshStandardMaterial({
    color: edge.color || "#b83227",
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    transparent: true,
    opacity: 1,
  });
  material.hooks = {
    key: `clue-string:${edge.style || "rope"}`,
    color: `
  {
    let braid = sin((uv.y * ${(cfg.twist * 6.28318).toFixed(1)} + uv.x * 12.56636));
    let strandShade = 0.84 + 0.16 * braid;
    diffuseColor = vec4f(diffuseColor.rgb * strandShade, diffuseColor.a);
  }
`,
  };
  return material;
}

class ClueLineTag {
  constructor(edge) {
    this.edge = edge;
    const { text, direction } = parseEdgeLabel(edge.label || "");
    this.text = text;
    this.direction = direction;
    this.flipped = false;
    const displayLen = text.length + (direction !== "none" ? 1.4 : 0);
    this.width = Math.min(0.46, Math.max(0.125, 0.072 + displayLen * 0.026));
    this.height = 0.048;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 512;
    this.canvas.height = Math.max(72, Math.round((512 * this.height) / this.width));
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshStandardMaterial({
      map: this.texture,
      roughness: 0.86,
      metalness: 0,
      transparent: true,
    });
    this.object = new Mesh(
      new PlaneGeometry(this.width, this.height),
      this.material,
    );
    this.object.rotation.x = -Math.PI / 2;
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.renderOrder = 6;
    this.draw();
  }

  setFlipped(flipped) {
    if (this.flipped === flipped || this.direction !== "forward") return;
    this.flipped = flipped;
    this.draw();
  }

  draw() {
    const ctx = this.canvas.getContext("2d", { colorSpace: "srgb" });
    const { width, height } = this.canvas;
    const vis = classifyEdgeTag(this.edge.label || "", this.edge.style || "rope");
    ctx.clearRect(0, 0, width, height);

    // Aged cardstock slip base
    ctx.fillStyle = vis.paper;
    ctx.fillRect(4, 4, width - 8, height - 8);

    // Subtle paper fiber sheen
    ctx.fillStyle = "rgba(84, 62, 36, 0.045)";
    ctx.fillRect(4, height * 0.56, width - 8, height * 0.4 - 4);

    // Outer stamp border
    ctx.strokeStyle = vis.border;
    ctx.lineWidth = vis.doubleFrame ? 3.5 : 2.8;
    ctx.strokeRect(6, 6, width - 12, height - 12);

    // Hostile / conflict double-line inner stamp frame
    if (vis.doubleFrame) {
      ctx.strokeStyle = vis.border;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(12, 12, width - 24, height - 24);
    }

    // Punched twine-tie holes at both ends
    ctx.fillStyle = "rgba(72, 54, 34, 0.36)";
    ctx.beginPath();
    ctx.arc(20, height / 2, 4.2, 0, Math.PI * 2);
    ctx.arc(width - 20, height / 2, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // Subtle wax/ink accent dot for bond/intimate tags
    if (vis.sealDot) {
      ctx.fillStyle = vis.accent;
      ctx.beginPath();
      ctx.arc(38, height / 2, 4.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Compose directional display text (flipping arrow when tag rotates 180deg to stay upright)
    let display = this.text;
    if (this.direction === "both") {
      display = `↔ ${this.text} ↔`;
    } else if (this.direction === "forward") {
      display = this.flipped ? `← ${this.text}` : `${this.text} →`;
    }

    ctx.fillStyle = vis.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const family = vis.serif
      ? `"Songti SC", "Noto Serif CJK SC", Georgia, serif`
      : `"PingFang SC", "Noto Sans CJK SC", ui-monospace, sans-serif`;
    let size = Math.round(height * 0.54);
    ctx.font = `700 ${size}px ${family}`;
    const maxW = width * (vis.sealDot ? 0.68 : 0.76);
    while (ctx.measureText(display).width > maxW && size > 14) {
      size -= 2;
      ctx.font = `700 ${size}px ${family}`;
    }
    ctx.fillText(display, width / 2 + (vis.sealDot ? 4 : 0), height / 2 + 1);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.object.geometry.dispose();
    this.object.removeFromParent();
  }
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
    this._tmpA = new Vector3();
    this._tmpB = new Vector3();
    this._tmpP = new Vector3();
    this._tmpT = new Vector3();
    this._tmpR = new Vector3();
    this._tmpN = new Vector3();
    this._up = new Vector3(0, 1, 0);
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
        const material = createStringMaterial(edge);
        const mesh = new Mesh(createTubeGeometry(STRING_SEGMENTS), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const collarA = new Mesh(getCollarGeometry(), material);
        const collarB = new Mesh(getCollarGeometry(), material);
        collarA.castShadow = true;
        collarB.castShadow = true;
        this.object.add(mesh, collarA, collarB);
        link = {
          mesh,
          collarA,
          collarB,
          edge,
          styleKey: edge.style || "rope",
          lastA: new Vector3(1e4, 1e4, 1e4),
          lastB: new Vector3(1e4, 1e4, 1e4),
          pluckAmp: 0.0048,
          pluckPhase: 0,
          still: 0,
        };
        this.links.set(edge.id, link);
        for (const id of [edge.fromNoteId, edge.toNoteId]) {
          if (!this.byNote.has(id)) this.byNote.set(id, new Set());
          this.byNote.get(id).add(link);
        }
        this.wake(link);
      }
      const nextStyle = edge.style || "rope";
      if (nextStyle !== link.styleKey) {
        const nextMat = createStringMaterial(edge);
        link.mesh.material.dispose();
        link.mesh.material = nextMat;
        link.collarA.material = nextMat;
        link.collarB.material = nextMat;
        link.styleKey = nextStyle;
      } else {
        link.mesh.material.color.set(edge.color || "#b83227");
      }
      link.edge = edge;
      const tagKey = `${edge.label || ""}|${edge.style || "rope"}|${edge.color || ""}`;
      if (tagKey !== link.tagKey) {
        link.label?.dispose();
        link.tagKey = tagKey;
        link.label = edge.label ? new ClueLineTag(edge) : null;
        if (link.label) {
          this.object.add(link.label.object);
          this.wake(link);
        }
      }
    }
    this.highlight(this.highlighted);
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
    const prev = this.highlightedEdge;
    this.highlightedEdge = edgeId;
    this.applyHighlight();
    if (edgeId && edgeId !== prev) {
      this.pluck(edgeId, 0.0032);
    }
  }

  pluck(edgeId, amp = 0.005) {
    const link = this.links.get(edgeId);
    if (!link) return;
    link.pluckAmp = Math.max(link.pluckAmp, amp);
    this.wake(link);
  }

  applyHighlight() {
    for (const link of this.links.values()) {
      const active = this.highlightedEdge
        ? link.edge.id === this.highlightedEdge
        : !this.highlighted ||
          link.edge.fromNoteId === this.highlighted ||
          link.edge.toNoteId === this.highlighted;
      link.mesh.material.opacity = active ? 1 : 0.24;
      if (link.label) {
        link.label.material.opacity = active ? 1 : 0.35;
        const hovered = this.highlightedEdge === link.edge.id;
        link.label.object.scale.setScalar(hovered ? 1.1 : 1);
      }
    }
  }

  at(point) {
    if (!point) return null;
    let best = null;
    let bestDistSq = 0.044 * 0.044;
    for (const link of this.links.values()) {
      if (link.label) {
        const lp = link.label.object.position;
        const halfW = (link.label.width ?? 0.24) * 0.58;
        if (
          Math.abs(point.x - lp.x) <= halfW &&
          Math.abs(point.z - lp.z) <= 0.045
        ) {
          return link.edge;
        }
      }
      const a = link.lastA;
      const b = link.lastB;
      if (a.x > 1e3) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      const t =
        lenSq > 1e-8
          ? Math.max(
              0,
              Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lenSq),
            )
          : 0;
      const px = a.x + dx * t - point.x;
      const pz = a.z + dz * t - point.z;
      const dSq = px * px + pz * pz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = link.edge;
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

  beginPreview(noteId, initialPoint = null) {
    this.clearPreview();
    const a = this.field.cards.get(noteId)?.anchor();
    if (!a) return;
    const end = initialPoint
      ? new Vector3(
          initialPoint.x,
          initialPoint.snapped
            ? initialPoint.y
            : this.ctx.counter.get().floorY + 0.06,
          initialPoint.z,
        )
      : a.clone();
    const material = createStringMaterial({ color: "#b83227", style: "rope" });
    const mesh = new Mesh(createTubeGeometry(STRING_SEGMENTS), material);
    mesh.castShadow = true;
    const collarA = new Mesh(getCollarGeometry(), material);
    collarA.castShadow = true;
    this.object.add(mesh, collarA);
    this.preview = {
      mesh,
      collarA,
      collarB: null,
      edge: { fromNoteId: noteId, style: "rope", color: "#b83227" },
      end,
      lastA: new Vector3(1e4, 1e4, 1e4),
      lastB: new Vector3(1e4, 1e4, 1e4),
      pluckAmp: 0,
      pluckPhase: 0,
      still: 0,
    };
    this.wake(this.preview);
  }

  movePreview(point) {
    if (this.preview && point) {
      this.preview.end.set(
        point.x,
        point.snapped ? point.y : this.ctx.counter.get().floorY + 0.06,
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
    const stepDt = dt || 1 / 60;
    for (const link of this.active) {
      this.stats.endpointSamples++;
      const a = this.field.cards.get(link.edge.fromNoteId)?.anchor();
      const b = link.end ?? this.field.cards.get(link.edge.toNoteId)?.anchor();
      if (!a || !b) {
        this.active.delete(link);
        continue;
      }
      const moveA = a.distanceTo(link.lastA);
      const moveB = b.distanceTo(link.lastB);
      const changed = moveA > 1e-4 || moveB > 1e-4;
      if (changed) {
        if (link.lastA.x < 1e3) {
          const speed = (moveA + moveB) / Math.max(stepDt, 1 / 120);
          link.pluckAmp = Math.min(0.0085, Math.max(link.pluckAmp, speed * 0.003));
        }
        link.lastA.copy(a);
        link.lastB.copy(b);
      }
      if (link.pluckAmp > 0.00008) {
        link.pluckPhase += stepDt * 22 * Math.PI * 2;
        link.pluckAmp *= Math.exp(-10.5 * stepDt);
      } else {
        link.pluckAmp = 0;
      }
      this.write(link, a, b);
      link.still = !changed && link.pluckAmp === 0 ? link.still + stepDt : 0;
      if (link.still > 0.12) this.active.delete(link);
    }
    this.stats.awake = this.active.size;
  }

  write(link, a, b) {
    const cfg = STYLE_CONFIG[link.edge.style] ?? STYLE_CONFIG.rope;
    const radius = cfg.radius;
    const geometry = link.mesh.geometry;
    const pos = geometry.attributes.position;
    const norm = geometry.attributes.normal;
    const ring = RADIAL_SEGMENTS + 1;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    // Razor-taut detective clue string: minimal natural tension sag
    const sag = Math.min(0.0024, dist * 0.003);
    const vib = link.pluckAmp * Math.sin(link.pluckPhase);
    const horizLen = Math.hypot(dx, dz) || 1;
    const perpX = -dz / horizLen;
    const perpZ = dx / horizLen;

    const p = this._tmpP;
    const tangent = this._tmpT;
    const right = this._tmpR;
    const normal = this._tmpN;
    const up = this._up;
    const minStringY = (this.ctx.counter.get().floorY ?? 0) + 0.056;

    for (let i = 0; i <= STRING_SEGMENTS; i++) {
      const t = i / STRING_SEGMENTS;
      const arch = 4 * t * (1 - t);
      const sway = Math.sin(t * Math.PI) * vib;
      p.set(
        a.x + dx * t + perpX * sway,
        Math.max(minStringY, a.y + dy * t - sag * arch),
        a.z + dz * t + perpZ * sway,
      );
      const dArch = 4 * (1 - 2 * t);
      const dSway = Math.PI * Math.cos(t * Math.PI) * vib;
      tangent
        .set(dx + perpX * dSway, dy - sag * dArch, dz + perpZ * dSway)
        .normalize();
      right.crossVectors(tangent, up);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      else right.normalize();
      normal.crossVectors(right, tangent).normalize();

      for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
        const angle = (j / RADIAL_SEGMENTS) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = right.x * c + normal.x * s;
        const ny = right.y * c + normal.y * s;
        const nz = right.z * c + normal.z * s;
        const idx = i * ring + j;
        pos.setXYZ(idx, p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
        norm.setXYZ(idx, nx, ny, nz);
      }
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
    geometry.computeBoundingSphere();
    this.stats.uploads++;

    if (link.collarA) {
      link.collarA.position.copy(a);
    }
    if (link.collarB) {
      link.collarB.position.copy(b);
    }

    if (link.label) {
      const midX = (a.x + b.x) * 0.5 + perpX * vib;
      const midY = Math.max(minStringY + 0.008, (a.y + b.y) * 0.5 - sag + 0.0065);
      const midZ = (a.z + b.z) * 0.5 + perpZ * vib;
      link.label.object.position.set(midX, midY, midZ);
      // Align evidence slip along string direction, keeping Chinese text always upright
      let angle = -Math.atan2(dz, dx);
      let flipped = false;
      if (angle > Math.PI / 2) {
        angle -= Math.PI;
        flipped = true;
      } else if (angle < -Math.PI / 2) {
        angle += Math.PI;
        flipped = true;
      }
      link.label.setFlipped(flipped);
      link.label.object.rotation.set(-Math.PI / 2, 0, angle);
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
    link.collarA?.removeFromParent();
    link.collarB?.removeFromParent();
    link.label?.dispose();
  }

  dispose() {
    this.off();
    this.clearPreview();
    this.links.forEach((link) => this.destroy(link));
    this.object.removeFromParent();
  }
}
