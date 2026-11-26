import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "../engine/index.js";
import { visibleEdges } from "../domain/geometry.js";
import {
  classifyEdgeTag,
  parseEdgeLabel,
} from "../domain/edgeRelations.ts";
import { playSound } from "../features/audio/audioEngine.js";
import { gsap, whenMotion } from "../shared/motion.js";

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
    this.snapping = new Set();
    this.snappedEdgeIds = new Set();
    this.routeVisible = true;
    this.routeAlpha = { value: 1 };
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
    for (const id of [...this.snappedEdgeIds]) {
      if (!ids.has(id)) this.snappedEdgeIds.delete(id);
    }
    for (const [id, link] of this.links)
      if (!ids.has(id)) {
        this.destroy(link);
        this.links.delete(id);
      }
    for (const edge of active) {
      if (this.snappedEdgeIds.has(edge.id)) continue;
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
    const next = Boolean(visible);
    if (this.routeVisible === next) return;
    this.routeVisible = next;
    gsap.killTweensOf(this.routeAlpha);
    if (!next) {
      gsap.to(this.routeAlpha, {
        value: 0,
        duration: whenMotion(0.24),
        ease: "power2.in",
        onUpdate: () => this.applyHighlight(),
        onComplete: () => {
          if (!this.routeVisible) this.object.visible = false;
        },
      });
    } else {
      this.object.visible = true;
      for (const link of this.links.values()) this.wake(link);
      this.applyHighlight();
      gsap.to(this.routeAlpha, {
        value: 1,
        duration: whenMotion(0.32),
        delay: whenMotion(0.22),
        ease: "power2.out",
        onStart: () => {
          for (const link of this.links.values()) {
            link.pluckAmp = Math.max(link.pluckAmp, 0.0028);
            this.wake(link);
          }
        },
        onUpdate: () => this.applyHighlight(),
      });
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
    const fade = this.routeAlpha?.value ?? 1;
    for (const link of this.links.values()) {
      const active = this.highlightedEdge
        ? link.edge.id === this.highlightedEdge
        : !this.highlighted ||
          link.edge.fromNoteId === this.highlighted ||
          link.edge.toNoteId === this.highlighted;
      link.mesh.material.opacity = (active ? 1 : 0.24) * fade;
      if (link.label) {
        link.label.material.opacity = (active ? 1 : 0.35) * fade;
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

  /**
   * Plan A: Ember-sever and elastically recoil all strings connected to a burning note.
   * Detached strings spark at the burned tip, whip & retract smoothly toward the surviving
   * pin while fading out, and any attached relationship paper slip gently drops & fades.
   */
  snapNote(noteId, { ember: showEmber = true } = {}) {
    const connected = [...(this.byNote.get(noteId) ?? [])];
    if (!connected.length) return;
    if (showEmber) {
      playSound("polaroid.dock", { volume: 0.24, rate: 1.85 });
    }
    for (const link of connected) {
      this.links.delete(link.edge.id);
      this.active.delete(link);
      this.snappedEdgeIds.add(link.edge.id);
      for (const id of [link.edge.fromNoteId, link.edge.toNoteId]) {
        const set = this.byNote.get(id);
        set?.delete(link);
        if (set?.size === 0) this.byNote.delete(id);
      }

      const burnedIsFrom = link.edge.fromNoteId === noteId;
      const fixedId = burnedIsFrom ? link.edge.toNoteId : link.edge.fromNoteId;
      const a =
        this.field.cards.get(link.edge.fromNoteId)?.anchor() ??
        link.lastA.clone();
      const b =
        this.field.cards.get(link.edge.toNoteId)?.anchor() ??
        link.lastB.clone();
      const burnTipStart = (burnedIsFrom ? a : b).clone();
      const surviveEnd = (burnedIsFrom ? b : a).clone();

      // Hide collar at the detached pin immediately
      if (burnedIsFrom && link.collarA) link.collarA.visible = false;
      if (!burnedIsFrom && link.collarB) link.collarB.visible = false;

      let ember = null;
      let emberMat = null;
      if (showEmber) {
        // Glowing ember bead riding the severed burning tip
        emberMat = new MeshStandardMaterial({
          color: "#ff9b3d",
          emissive: "#ff4d1a",
          emissiveIntensity: 3.4,
          roughness: 0.3,
          metalness: 0,
          transparent: true,
          opacity: 1,
        });
        ember = new Mesh(new SphereGeometry(0.0075, 8, 6), emberMat);
        ember.position.copy(burnTipStart);
        ember.renderOrder = 8;
        this.object.add(ember);
      }

      const labelStartPos = link.label
        ? link.label.object.position.clone()
        : null;
      const labelStartRotZ = link.label ? link.label.object.rotation.z : 0;

      link.pluckAmp = showEmber ? 0.015 : 0.009;
      link.pluckPhase = 0;
      link.snap = {
        burnedIsFrom,
        fixedId,
        burnTipStart,
        surviveEnd,
        ember,
        emberMat,
        labelStartPos,
        labelStartRotZ,
        labelSpin: (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.22),
        labelDriftX: (Math.random() - 0.5) * 0.05,
        labelDriftZ: 0.02 + Math.random() * 0.03,
        t: 0,
        duration: showEmber ? 0.72 : 0.48,
      };
      this.snapping.add(link);
    }
    this.stats.awake = this.active.size + this.snapping.size;
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
    if (!this.active.size && !this.snapping.size) return;
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

    if (this.snapping.size) {
      const floorY = this.ctx.counter.get().floorY ?? 0;
      for (const link of [...this.snapping]) {
        const s = link.snap;
        s.t = Math.min(1, s.t + stepDt / s.duration);
        const liveSurvive =
          this.field.cards.get(s.fixedId)?.anchor() ?? s.surviveEnd;
        s.surviveEnd.copy(liveSurvive);

        // Phase 1 (0..0.16): ember flare & initial snap; Phase 2 (0.16..1): elastic recoil to surviving pin
        let recoil;
        let emberScale;
        let emberGlow;
        if (s.t < 0.16) {
          const f = s.t / 0.16;
          recoil = f * f * 0.07;
          emberScale = 1.0 + Math.sin(f * Math.PI) * 0.55;
          emberGlow = 3.8;
        } else {
          const u = (s.t - 0.16) / 0.84;
          recoil = 0.07 + 0.93 * (1 - Math.pow(1 - u, 2.35));
          emberScale = Math.max(0.01, (1 - u * 1.15) * 1.15);
          emberGlow = Math.max(0, 3.4 * (1 - u * 1.25));
        }

        const dirX = s.surviveEnd.x - s.burnTipStart.x;
        const dirZ = s.surviveEnd.z - s.burnTipStart.z;
        const len = Math.hypot(dirX, dirZ) || 1;
        const whip =
          Math.sin(recoil * Math.PI * 1.65) * 0.032 * (1 - recoil);
        const tipX =
          s.burnTipStart.x + dirX * recoil + (-dirZ / len) * whip;
        const tipZ =
          s.burnTipStart.z + dirZ * recoil + (dirX / len) * whip;
        const tipY =
          s.burnTipStart.y +
          (s.surviveEnd.y - s.burnTipStart.y) * recoil -
          Math.sin(recoil * Math.PI) * 0.014;
        this._tmpA.set(tipX, tipY, tipZ);

        // Ember spark rides the severed burning tip (only for burn mode)
        if (s.ember && s.emberMat) {
          s.ember.position.copy(this._tmpA);
          s.ember.scale.setScalar(emberScale);
          s.emberMat.emissiveIntensity = emberGlow;
          s.emberMat.opacity = Math.max(
            0,
            1 - Math.max(0, (s.t - 0.65) / 0.25),
          );
          s.ember.visible = s.emberMat.opacity > 0.02;
        }

        // Strong recoil string vibration + smooth opacity fade in final 45%
        link.pluckPhase += stepDt * 26 * Math.PI * 2;
        link.pluckAmp *= Math.exp(-4.8 * stepDt);
        const fade = s.t < 0.52 ? 1 : Math.max(0, 1 - (s.t - 0.52) / 0.48);
        link.mesh.material.opacity = fade;
        const radiusScale = Math.max(0.35, 1 - s.t * 0.45);

        const endA = s.burnedIsFrom ? this._tmpA : s.surviveEnd;
        const endB = s.burnedIsFrom ? s.surviveEnd : this._tmpA;
        this.write(link, endA, endB, {
          skipLabel: true,
          radiusScale,
        });

        // Detached relationship paper slip drops gently onto tray and fades away
        if (link.label && s.labelStartPos) {
          const lt = Math.min(1, s.t / 0.78);
          const easeDrop = 1 - Math.pow(1 - lt, 2.2);
          const dropY =
            s.labelStartPos.y +
            (floorY + 0.016 - s.labelStartPos.y) * easeDrop;
          link.label.object.position.set(
            s.labelStartPos.x + s.labelDriftX * easeDrop,
            dropY,
            s.labelStartPos.z + s.labelDriftZ * easeDrop,
          );
          link.label.object.rotation.z =
            s.labelStartRotZ + s.labelSpin * easeDrop;
          link.label.material.opacity = Math.max(0, 1 - Math.pow(lt, 1.5));
        }

        if (s.t >= 1) {
          this.snapping.delete(link);
          this.destroy(link);
        }
      }
    }
    this.stats.awake = this.active.size + this.snapping.size;
  }

  write(link, a, b, { skipLabel = false, radiusScale = 1 } = {}) {
    const cfg = STYLE_CONFIG[link.edge.style] ?? STYLE_CONFIG.rope;
    const radius = cfg.radius * radiusScale;
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

    if (link.label && !skipLabel) {
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
    this.snapping.delete(link);
    this.stats.awake = this.active.size + this.snapping.size;
    for (const id of [link.edge.fromNoteId, link.edge.toNoteId]) {
      const links = this.byNote.get(id);
      links?.delete(link);
      if (links?.size === 0) this.byNote.delete(id);
    }
    if (link.snap?.ember) {
      link.snap.ember.geometry.dispose();
      link.snap.emberMat.dispose();
      link.snap.ember.removeFromParent();
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
    gsap.killTweensOf(this.routeAlpha);
    this.clearPreview();
    this.links.forEach((link) => this.destroy(link));
    this.snapping.forEach((link) => this.destroy(link));
    this.snapping.clear();
    this.snappedEdgeIds.clear();
    this.object.removeFromParent();
  }
}
