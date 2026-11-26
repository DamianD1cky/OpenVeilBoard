import { Raycaster, Plane, Vector2, Vector3, Group } from "../engine/index.js";
import { NoteCard } from "./NoteCard.js";
import {
  createDropMagnet,
  updateDropMagnet,
} from "../features/polaroids/dropMagnet.js";
import { settlePosition, findFreePosition } from "../domain/geometry.js";
import { computeAvoidanceOffsets } from "../domain/avoidance.ts";
import { cardAspect } from "../features/polaroids/noteTexture.js";
import { playSound, panForClientX } from "../features/audio/audioEngine.js";
export class NoteField {
  constructor(ctx, callbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.object = new Group();
    this.cards = new Map();
    this.raycaster = new Raycaster();
    this.plane = new Plane(new Vector3(0, 1, 0), 0);
    this.hitPoint = new Vector3();
    this.pointer = new Vector2();
    this.enabled = false;
    this.avoidZone = null;
    this.diceHovered = false;
    this.linkStartId = null;
    this.hoveredPinCard = null;
    this.lastPointerPoint = null;
    this.archiveMode = false;
    this.archiveCards = new Map();
    this.exitingArchiveCards = new Set();
    this.archiveVisibleIds = null;
    this.canvas = ctx.app.canvas;
    this.handlers = {
      pointerdown: (e) => this.down(e),
      pointermove: (e) => this.move(e),
      pointerup: (e) => this.up(e),
      pointercancel: () => this.cancel(),
      contextmenu: (e) => this.contextMenu(e),
      pointerleave: () => {
        if (!this.downState) {
          this.setHoveredPin(null);
          this.setHoveredDiceBtn(null);
          this.setHoveredClockBtn(null);
          this.hover(null);
        }
      },
    };
    Object.entries(this.handlers).forEach(([key, handler]) =>
      this.canvas.addEventListener(key, handler),
    );
    this.off = ctx.counter.subscribe(() => {
      for (const card of this.cards.values())
        card.update(card.note, this.cardWidthFor(card.note));
      if (this.avoidZone) this.applyAvoidance(false);
      if (this.activeFloorClockNoteId) {
      for (const [id, card] of this.cards) {
        card.setClockProjected(id === this.activeFloorClockNoteId);
      }
    }
    if (this.archiveMode) this.syncArchiveCards(false);
    });
  }
  cardWidth() {
    const { layout } = this.ctx.counter.get();
    return Math.min(0.94, layout.indentWidth * 0.3, layout.indentHeight * 0.3);
  }
  cardWidthFor(styleOrNote) {
    const base = this.cardWidth();
    const style =
      typeof styleOrNote === "string"
        ? styleOrNote
        : styleOrNote?.cardStyle ?? "note";
    // Polaroids are tall (0.8 aspect); scale width down so their visual footprint stays compact & balanced
    return style === "polaroid" ? base * 0.72 : base;
  }
  freePosition(style, preferred = { x: 0, y: 0 }) {
    const { layout, zone } = this.ctx.counter.get(),
      width = this.cardWidthFor(style),
      height = width / cardAspect(style);
    const others = [...this.cards.values()].map((c) => ({
      id: c.note.id,
      x: c.aim.x,
      y: c.aim.z,
      width: c.width,
      height: c.height,
      rotation: c.note.rotation,
    }));
    const reserved = [
      {
        id: "archive",
        x: zone.x,
        y: zone.z,
        width: zone.width,
        height: zone.height,
        rotation: 0,
      },
      {
        id: "clock",
        x: 0,
        y: -layout.indentHeight / 2 + 0.19,
        width: Math.min(1.85, layout.indentWidth * 0.72),
        height: 0.36,
        rotation: 0,
      },
    ];
    const p = findFreePosition(
      { id: "new", width: width + 0.03, height: height + 0.03, rotation: 0 },
      others,
      {
        x: layout.indentWidth / 2 - width / 2 - 0.03,
        y: layout.indentHeight / 2 - height / 2 - 0.03,
      },
      reserved,
      {
        x: preferred.x * layout.indentWidth,
        y: preferred.y * layout.indentHeight,
      },
    );
    return { x: p.x / layout.indentWidth, y: p.y / layout.indentHeight };
  }
  sync(notes) {
    this.notes = notes;
    const active = notes.filter((n) => !n.archivedAt),
      ids = new Set(active.map((n) => n.id));
    for (const [id, card] of this.cards)
      if (!ids.has(id) && !card.archiving && !card.burningAway) {
        card.dispose();
        this.cards.delete(id);
      }
    const added = [];
    for (const note of active) {
      let card = this.cards.get(note.id);
      const targetWidth = this.cardWidthFor(note);
      if (!card) {
        card = new NoteCard(this.ctx, note, targetWidth);
        this.cards.set(note.id, card);
        this.object.add(card.object);
        added.push(card);
      } else card.update(note, targetWidth);
    }
    if (this.avoidZone) this.applyAvoidance(false);
    if (added.length) {
      const { layout, zone } = this.ctx.counter.get();
      const exitX = layout
        ? -layout.indentWidth * 0.5 - this.cardWidth() * 1.5
        : -2.8;
      if (this.swept) {
        for (const card of added) {
          card.swept = true;
          card.object.position.set(exitX, card.floor + 0.35, card.aim.z);
        }
      } else {
        added.sort((a, b) => b.aim.x - a.aim.x);
        playSound("polaroid.shuffle", { pan: -0.35 });
        added.forEach((card, i) => {
          const jitter = zone ? (card.aim.z - zone.z) * 0.06 : 0;
          card.enterFromLeft(
            exitX,
            card.aim.z + jitter,
            0.28 + Math.min(i, 6) * 0.045,
            Math.min(i, 8) * 0.055,
          );
        });
      }
    }
    if (this.activeFloorClockNoteId) {
      for (const [id, card] of this.cards) {
        card.setClockProjected(id === this.activeFloorClockNoteId);
      }
    }
    if (this.archiveMode) this.syncArchiveCards(false);
  }
  setArchiveView(active, visibleIds = null) {
    const next = Boolean(active);
    const wasActive = this.archiveMode;
    this.archiveMode = next;
    this.archiveVisibleIds = Array.isArray(visibleIds) ? visibleIds : null;
    this.ctx.counterObject.well?.setArchiveMode?.(next);
    if (!next) {
      if (this.hovered && this.archiveCards.has(this.hovered.note?.id)) {
        this.hovered.setHover(false);
        this.hovered = null;
        this.callbacks.onHover?.(null);
      }
      this.callbacks.onArchivePull?.(null);
      const closing = [...this.archiveCards.values()];
      this.archiveCards.clear();
      if (closing.length) {
        const { layout, zone } = this.ctx.counter.get();
        const wellX = zone?.x ?? (layout ? layout.indentWidth * 0.36 : 1.1);
        const wellZ = zone?.z ?? (layout ? layout.indentHeight * 0.36 : 0.7);
        // Tuck farthest cards back into the well first for a clean cascade
        closing.sort(
          (a, b) =>
            Math.hypot(b.object.position.x - wellX, b.object.position.z - wellZ) -
            Math.hypot(a.object.position.x - wellX, a.object.position.z - wellZ),
        );
        playSound("polaroid.shuffle", { volume: 0.22, pan: 0.25 });
        closing.forEach((card, i) => {
          this.exitingArchiveCards.add(card);
          card.exitToWell(wellX, wellZ, Math.min(i, 7) * 0.03, () => {
            this.exitingArchiveCards.delete(card);
            card.dispose();
          });
        });
      }
      return;
    }
    // Cancel any leftover exiting archive cards before opening a fresh grid
    if (this.exitingArchiveCards.size) {
      for (const card of this.exitingArchiveCards) card.dispose();
      this.exitingArchiveCards.clear();
    }
    this.setHoveredPin(null);
    this.setLinkStart(null);
    this.syncArchiveCards(!wasActive);
  }
  syncArchiveCards(animateFromWell = false) {
    const { layout, zone } = this.ctx.counter.get();
    if (!layout) return;
    const allArchived = (this.notes ?? []).filter((n) => n.archivedAt);
    const byId = new Map(allArchived.map((n) => [n.id, n]));
    let list;
    if (this.archiveVisibleIds) {
      list = this.archiveVisibleIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      list = [...allArchived]
        .sort(
          (a, b) =>
            new Date(b.archivedAt || 0).getTime() -
            new Date(a.archivedAt || 0).getTime(),
        )
        .slice(0, 8);
    }
    const keepIds = new Set(list.map((n) => n.id));
    for (const [id, card] of this.archiveCards) {
      if (!keepIds.has(id) && !card.archiving) {
        if (this.hovered === card) {
          this.hovered = null;
          this.callbacks.onHover?.(null);
        }
        card.dispose();
        this.archiveCards.delete(id);
      }
    }
    if (!list.length) return;

    const compact = layout.indentWidth < 1.35;
    const maxCols = compact ? 2 : 4;
    const cols = Math.min(maxCols, Math.max(1, list.length));
    const rows = Math.ceil(list.length / cols);
    const availW = layout.indentWidth * 0.86;
    const topBound = -layout.indentHeight * 0.5 + Math.max(0.22, layout.indentHeight * 0.16);
    const bottomBound = Math.min(
      layout.indentHeight * 0.5 - 0.14,
      zone ? zone.z - zone.height * 0.5 - 0.045 : layout.indentHeight * 0.5 - 0.14,
    );
    const availH = Math.max(0.38, bottomBound - topBound);
    const maxColW = (availW / cols) * 0.84;
    const minAspect = list.reduce(
      (acc, n) => Math.min(acc, cardAspect(n)),
      1.2,
    );
    const maxRowW = ((availH / rows) * 0.84) * minAspect;
    const width = Math.max(
      0.16,
      Math.min(this.cardWidth() * 0.88, maxColW, maxRowW),
    );

    const added = [];
    const colSpacing = Math.min(availW / cols, width * 1.24);
    const rowSpacing = rows > 1 ? availH / rows : 0;
    const centerZ = (topBound + bottomBound) * 0.5;

    list.forEach((note, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const itemsInRow =
        row === rows - 1 ? list.length - row * cols : cols;
      const rowStartX = -((itemsInRow - 1) * colSpacing) * 0.5;
      const x = rowStartX + col * colSpacing;
      const z =
        rows === 1
          ? centerZ
          : topBound + rowSpacing * (row + 0.5);
      const yaw =
        (((idx % 2 === 0 ? 1 : -1) * (0.55 + (idx % 3) * 0.35)) * Math.PI) /
        180;

      const itemWidth = note.cardStyle === "polaroid" ? width * 0.8 : width;
      let card = this.archiveCards.get(note.id);
      if (!card) {
        card = new NoteCard(this.ctx, note, itemWidth);
        this.archiveCards.set(note.id, card);
        this.object.add(card.object);
        added.push(card);
      } else {
        card.update(note, itemWidth);
      }
      card.setOverridePose({ x, z, yaw });
    });

    if (added.length) {
      const originX = zone?.x ?? layout.indentWidth * 0.36;
      const originZ = zone?.z ?? layout.indentHeight * 0.36;
      if (animateFromWell) {
        playSound("polaroid.shuffle", { pan: 0.25 });
      }
      added.forEach((card, i) => {
        card.enterFromWell(
          originX,
          originZ,
          animateFromWell ? Math.min(i, 7) * 0.045 : 0,
        );
      });
    }
  }
  restoreArchiveCard(card) {
    if (!card || card.archiving) return;
    if (!this.callbacks.canEdit?.(card.note)) return;
    const { layout } = this.ctx.counter.get();
    const exitX = layout
      ? -layout.indentWidth * 0.5 - card.width * 1.4
      : -2.4;
    if (this.hovered === card) {
      this.hovered = null;
      this.callbacks.onHover?.(null);
    }
    this.callbacks.onArchivePull?.(null);
    playSound("polaroid.shuffle", { pan: -0.3 });
    card.returnToDesk(exitX, () => {
      card.dispose();
      this.archiveCards.delete(card.note.id);
      this.callbacks.onRestore?.(card.note.id);
    });
  }
  setAvoidanceZone(zone) {
    this.avoidZone = zone ?? null;
    this.applyAvoidance(true);
  }
  applyAvoidance(withSound = false) {
    const { layout, zone: well } = this.ctx.counter.get();
    if (!layout) return;
    if (!this.avoidZone) {
      let moved = false;
      for (const card of this.cards.values()) {
        if (card.setAvoidance(0, 0, 0)) moved = true;
      }
      if (moved && withSound) {
        playSound("polaroid.shuffle", { volume: 0.16, pan: 0 });
      }
      return;
    }
    const iw = Math.max(layout.indentWidth, 0.1);
    const ih = Math.max(layout.indentHeight, 0.1);
    const inputs = [...this.cards.values()].map((c) => {
      const ang = (c.note.rotation * Math.PI) / 180;
      const hw =
        (Math.abs(Math.cos(ang)) * c.width + Math.abs(Math.sin(ang)) * c.height) *
        0.5;
      const hh =
        (Math.abs(Math.sin(ang)) * c.width + Math.abs(Math.cos(ang)) * c.height) *
        0.5;
      return {
        id: c.note.id,
        x: c.aim.x / iw,
        y: c.aim.z / ih,
        halfW: hw / iw,
        halfH: hh / ih,
      };
    });
    const wellRect = well
      ? {
          left: (well.x - well.width * 0.5) / iw,
          right: (well.x + well.width * 0.5) / iw,
          top: (well.z - well.height * 0.5) / ih,
          bottom: (well.z + well.height * 0.5) / ih,
        }
      : null;
    const offsets = computeAvoidanceOffsets(inputs, this.avoidZone, wellRect);
    let anyMoved = false;
    for (const card of this.cards.values()) {
      const off = offsets.get(card.note.id);
      const changed = off
        ? card.setAvoidance(
            off.dx * iw,
            off.dy * ih,
            (-off.yawDeg * Math.PI) / 180,
          )
        : card.setAvoidance(0, 0, 0);
      if (changed) anyMoved = true;
    }
    if (anyMoved && withSound) {
      playSound("polaroid.shuffle", { volume: 0.18, pan: -0.2 });
    }
  }
  burnAndRemove(id, done) {
    const card = this.cards.get(id);
    if (!card) {
      done?.();
      return;
    }
    card.burnAway(() => {
      card.dispose();
      this.cards.delete(id);
      done?.();
    });
  }
  setSwept(swept) {
    if (this.swept === swept) return;
    this.swept = swept;
    const { layout, zone } = this.ctx.counter.get();
    if (!layout) return;
    const cards = [...this.cards.values()].sort((a, b) => a.aim.z - b.aim.z);
    if (!cards.length) return;
    playSound("polaroid.shuffle", { pan: -0.35 });
    if (swept) {
      const exitX = -layout.indentWidth * 0.5 - this.cardWidth() * 1.5;
      cards.forEach((card, i) => {
        const jitter = zone ? (card.aim.z - zone.z) * 0.08 : 0;
        card.sweepOut(exitX, card.aim.z + jitter, 0.32 + i * 0.06, i * 0.045);
      });
    } else {
      const baseDelay = this.exitingArchiveCards.size > 0 ? 0.08 : 0;
      cards.forEach((card, i) => {
        card.sweepIn(baseDelay + i * 0.045);
      });
    }
  }
  point(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.ctx.app.camera);
    this.plane.constant = -this.ctx.counter.get().floorY;
    return this.raycaster.ray.intersectPlane(this.plane, this.hitPoint);
  }
  at(point) {
    if (!point) return null;
    const pool = this.archiveMode ? this.archiveCards : this.cards;
    return (
      [...pool.values()]
        .sort((a, b) => b.note.layer - a.note.layer)
        .find((c) => {
          if (c.archiving || c.burningAway) return false;
          const dx = point.x - c.object.position.x,
            dz = point.z - c.object.position.z,
            yaw = c.object.rotation.y;
          return (
            Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < c.width / 2 &&
            Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) < c.height / 2
          );
        }) ?? null
    );
  }
  pinAt(point) {
    if (!point) return null;
    return (
      [...this.cards.values()]
        .sort((a, b) => b.note.layer - a.note.layer)
        .find((c) => c.pinHitTest(point)) ?? null
    );
  }
  diceAt(point) {
    if (!point || this.archiveMode) return null;
    return (
      [...this.cards.values()]
        .sort((a, b) => b.note.layer - a.note.layer)
        .find((c) => c.diceHitTest(point)) ?? null
    );
  }
  setHoveredDiceBtn(card) {
    if (this.hoveredDiceBtnCard === card) return;
    this.hoveredDiceBtnCard = card;
    this.callbacks.onDiceButtonHover?.(card ? card.note.id : null);
  }
  setActiveFloorClock(clock) {
    const activeNoteId = clock?.noteId ?? null;
    this.activeFloorClockNoteId = activeNoteId;
    for (const [id, card] of this.cards) {
      card.setClockProjected(id === activeNoteId);
    }
  }
  clockAt(point) {
    if (!point || this.archiveMode) return null;
    for (const card of [...this.cards.values()].sort(
      (a, b) => b.note.layer - a.note.layer,
    )) {
      const action = card.clockHitTest(point);
      if (!action) continue;
      if (action === "toggle") {
        return { card, action: "toggle", delta: 0 };
      }
      if (this.callbacks.canEdit && !this.callbacks.canEdit(card.note)) {
        return null;
      }
      return { card, action, delta: action === "plus" ? 1 : -1 };
    }
    return null;
  }
  setHoveredClockBtn(hit) {
    const prev = this.hoveredClockBtnHit;
    if (prev?.card === hit?.card && prev?.action === hit?.action) return;
    this.hoveredClockBtnHit = hit ?? null;
    this.callbacks.onClockButtonHover?.(
      hit
        ? { noteId: hit.card.note.id, action: hit.action, delta: hit.delta }
        : null,
    );
  }
  setHoveredPin(card) {
    if (this.hoveredPinCard === card) return;
    if (this.hoveredPinCard) {
      this.hoveredPinCard.setPinState({ hovered: false });
    }
    this.hoveredPinCard = card;
    if (card) {
      card.setPinState({ hovered: true });
    }
    this.callbacks.onPinHover?.(card ? card.note.id : null);
  }
  setLinkStart(id) {
    const next = id || null;
    if (this.linkStartId === next) return;
    this.linkStartId = next;
    for (const card of this.cards.values()) {
      card.setPinState({ selected: Boolean(next && card.note.id === next) });
    }
    if (next) {
      this.ctx.rope?.highlight(next);
      this.ctx.rope?.beginPreview(next, this.lastPointerPoint);
    } else {
      this.ctx.rope?.clearPreview();
      this.ctx.rope?.highlight(null);
    }
  }
  hover(card, point = null) {
    const hoverTarget = card
      ? null
      : point && this.ctx.counterObject.well?.contains(point)
        ? { kind: "well", point }
        : this.archiveMode
          ? null
          : point && this.ctx.clock?.contains(point)
            ? { kind: "clock" }
            : point && this.ctx.dice?.containsDocked?.(point)
              ? { kind: "dice" }
              : point
                ? (() => {
                    const edge = this.ctx.rope?.at(point);
                    return edge ? { kind: "edge", edge } : null;
                  })()
                : null;
    this.ctx.clock?.setHover?.(hoverTarget?.kind === "clock");
    const nextDiceHover =
      hoverTarget?.kind === "dice" && (this.callbacks.canRoll?.() ?? true);
    if (nextDiceHover !== this.diceHovered) {
      this.diceHovered = nextDiceHover;
      this.ctx.dice?.setDockedHover?.(nextDiceHover);
      this.callbacks.onDiceHover?.(
        nextDiceHover ? this.ctx.dice?.getLastRollInfo?.() : null,
      );
    }
    if (!this.downState) {
      this.ctx.counterObject.well?.highlight(
        hoverTarget?.kind === "well",
        hoverTarget?.point,
        true,
      );
    }
    if (hoverTarget?.kind === "edge") {
      this.ctx.rope?.highlightEdge(hoverTarget.edge.id);
    } else if (!card) {
      this.ctx.rope?.highlightEdge(null);
    }
    this.canvas.style.cursor = card
      ? "grab"
      : hoverTarget
        ? "pointer"
        : "default";
    if (this.hovered === card) return;
    clearTimeout(this.hoverTimer);
    this.hovered?.setHover(false);
    this.hovered = card;
    if (card) {
      this.callbacks.onHover?.(card.note.id);
      this.hoverTimer = setTimeout(() => {
        if (this.hovered !== card || this.downState) return;
        card.setHover(true);
        this.ctx.rope?.highlight(card.note.id);
      }, 90);
    } else {
      this.callbacks.onHover?.(null);
      if (hoverTarget?.kind !== "edge") this.ctx.rope?.highlight(null);
    }
  }
  down(e) {
    if (!this.enabled || e.button !== 0) return;
    const point = this.point(e);
    if (!point) return;
    this.lastPointerPoint = point.clone();
    const canLink = !this.archiveMode && (this.callbacks.canLink?.() ?? true);
    const canRoll = !this.archiveMode && (this.callbacks.canRoll?.() ?? true);
    const pinCard = canLink ? this.pinAt(point) : null;
    const clockHit = !pinCard ? this.clockAt(point) : null;
    const diceCard = !pinCard && !clockHit && canRoll ? this.diceAt(point) : null;
    const card = pinCard ?? clockHit?.card ?? diceCard ?? this.at(point);
    this.setHoveredDiceBtn(null);
    this.setHoveredClockBtn(null);
    this.callbacks.onPointerDown?.();
    clearTimeout(this.hoverTimer);
    this.hovered?.setHover(false);
    this.hovered = null;
    this.ctx.clock?.setHover?.(false);
    this.ctx.counterObject.well?.highlight(false);
    if (this.diceHovered) {
      this.diceHovered = false;
      this.ctx.dice?.setDockedHover?.(false);
      this.callbacks.onDiceHover?.(null);
    }
    const wasDocked = this.ctx.dice?.state === "docked";
    this.ctx.dice?.tidyToCorner();
    this.downState = {
      card,
      pinCard,
      clockHit,
      diceCard,
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      offsetX: card ? card.object.position.x - point.x : 0,
      offsetZ: card ? card.object.position.z - point.z : 0,
      moved: false,
      wasDocked,
    };
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.magnet = createDropMagnet(point.x, point.z);
  }
  move(e) {
    if (!this.enabled) return;
    const point = this.point(e);
    if (!point) return;
    this.lastPointerPoint = point.clone();
    const down = this.downState;
    if (!down) {
      const canLink = !this.archiveMode && (this.callbacks.canLink?.() ?? true);
      if (this.linkStartId && canLink) {
        const pinCard = this.pinAt(point);
        const card = this.at(point);
        const target =
          pinCard && pinCard.note.id !== this.linkStartId
            ? pinCard
            : card && card.note.id !== this.linkStartId
              ? card
              : null;
        this.hovered?.setHover(false);
        this.hovered = null;
        this.callbacks.onHover?.(null);
        this.setHoveredPin(target);
        if (target) {
          const snap = target.anchor();
          this.ctx.rope?.movePreview({
            x: snap.x,
            y: snap.y,
            z: snap.z,
            snapped: true,
          });
          this.canvas.style.cursor = "pointer";
        } else {
          this.ctx.rope?.movePreview(point);
          this.canvas.style.cursor = "crosshair";
        }
        return;
      }
      const pinCard = canLink ? this.pinAt(point) : null;
      if (pinCard) {
        clearTimeout(this.hoverTimer);
        this.hovered?.setHover(false);
        this.hovered = null;
        this.callbacks.onHover?.(null);
        this.setHoveredDiceBtn(null);
        this.setHoveredClockBtn(null);
        this.setHoveredPin(pinCard);
        this.ctx.rope?.highlight(pinCard.note.id);
        this.canvas.style.cursor = "pointer";
        return;
      }
      this.setHoveredPin(null);
      const clockHit = this.clockAt(point);
      this.setHoveredClockBtn(clockHit);
      const canRoll = !this.archiveMode && (this.callbacks.canRoll?.() ?? true);
      const diceCard = !clockHit && canRoll ? this.diceAt(point) : null;
      this.setHoveredDiceBtn(diceCard);
      this.hover(this.at(point), point);
      if (clockHit || diceCard) {
        this.canvas.style.cursor = "pointer";
      }
      return;
    }
    down.moved ||= Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6;
    if (!down.card || !down.moved) return;
    if (!this.callbacks.canEdit?.(down.card.note)) return;
    const { layout, zone } = this.ctx.counter.get();
    const x = Math.max(
      -layout.indentWidth / 2 + down.card.width / 2,
      Math.min(
        layout.indentWidth / 2 - down.card.width / 2,
        point.x + down.offsetX,
      ),
    );
    const z = Math.max(
      -layout.indentHeight / 2 + down.card.height / 2,
      Math.min(
        layout.indentHeight / 2 - down.card.height / 2,
        point.z + down.offsetZ,
      ),
    );
    if (this.archiveMode) {
      down.card.dragTo(x, z, { latched: false, zone: null });
      const pose = down.card.overridePose;
      const pulledOut = pose
        ? Math.hypot(x - pose.x, z - pose.z) > 0.18
        : false;
      down.archivePulled = pulledOut;
      this.callbacks.onArchivePull?.(pulledOut ? down.card.note.id : null);
      this.canvas.style.cursor = "grabbing";
      return;
    }
    updateDropMagnet(this.magnet, x, z, zone);
    down.card.dragTo(this.magnet.x, this.magnet.z, {
      latched: this.magnet.latched,
      zone,
    });
    this.ctx.counterObject.well?.highlight(this.magnet.latched, point);
    this.canvas.style.cursor = "grabbing";
  }
  up(e) {
    const down = this.downState;
    if (!down) return;
    this.downState = null;
    const point = this.point(e),
      card = down.card;
    if (point) this.lastPointerPoint = point.clone();
    this.ctx.counterObject.well?.highlight(false);
    if (card && down.moved && card.dragging) {
      if (this.archiveMode) {
        this.callbacks.onArchivePull?.(null);
        if (down.archivePulled) {
          card.release();
          this.restoreArchiveCard(card);
        } else {
          card.release();
          card.place();
          playSound("polaroid.drop", { pan: panForClientX(e.clientX) });
        }
        this.releaseCapture();
        return;
      }
      const { layout, zone } = this.ctx.counter.get();
      if (this.magnet.latched) {
        this.ctx.rope?.snapNote?.(card.note.id, { ember: false });
        card.release();
        card.archive(zone, () => {
          this.callbacks.onArchive?.(card.note.id);
          if (this.notes && !this.notes.some((n) => n.id === card.note.id && !n.archivedAt)) {
            card.dispose();
            this.cards.delete(card.note.id);
          }
        });
        playSound("polaroid.drop", { pan: panForClientX(e.clientX) });
      } else {
        const world = (c) => ({
          id: c.note.id,
          x: c.object.position.x,
          y: c.object.position.z,
          rotation: c.note.rotation,
          width: c.width,
          height: c.height,
        });
        const current = world(card);
        current.x = card.aim.x;
        current.y = card.aim.z;
        const next = settlePosition(
          current,
          [...this.cards.values()].map(world),
          {
            x: layout.indentWidth / 2 - current.width / 2,
            y: layout.indentHeight / 2 - current.height / 2,
          },
        );
        card.release();
        this.callbacks.onMove?.(card.note.id, {
          x: next.x / layout.indentWidth,
          y: next.y / layout.indentHeight,
        });
        playSound("polaroid.drop", { pan: panForClientX(e.clientX) });
      }
    } else if (!down.moved) {
      if (this.archiveMode) {
        if (card) this.callbacks.onSelect?.(card.note.id);
        else if (point && this.ctx.counterObject.well?.contains(point))
          this.callbacks.onCloseArchive?.();
      } else if (this.linkStartId) {
        const target = down.pinCard ?? card;
        if (target && target.note.id !== this.linkStartId) {
          this.callbacks.onPinClick?.(target.note.id);
        } else {
          this.callbacks.onLinkEnd?.(null);
        }
      } else if (down.pinCard) {
        this.callbacks.onPinClick?.(down.pinCard.note.id);
      } else if (down.clockHit) {
        down.clockHit.card.pulse();
        if (down.clockHit.action === "toggle") {
          this.callbacks.onCardToggleClockBackdrop?.(down.clockHit.card.note.id);
        } else {
          this.callbacks.onCardStepClock?.(
            down.clockHit.card.note.id,
            down.clockHit.delta,
          );
        }
      } else if (down.diceCard) {
        down.diceCard.pulse();
        this.callbacks.onCardRoll?.(down.diceCard.note.id);
      } else if (card) {
        this.callbacks.onSelect?.(card.note.id);
      } else if (point && this.ctx.counterObject.well?.contains(point))
        this.callbacks.onOpenArchive?.();
      else if (point && this.ctx.clock.contains(point))
        this.callbacks.onClock?.();
      else if (
        down.wasDocked &&
        point &&
        this.ctx.dice?.containsDocked?.(point) &&
        (this.callbacks.canRoll?.() ?? true)
      )
        this.callbacks.onDiceReroll?.();
      else {
        const edge = point ? this.ctx.rope?.at(point) : null;
        if (edge) this.callbacks.onEdge?.(edge);
        else this.callbacks.onBlank?.();
      }
    }
    this.releaseCapture();
  }
  contextMenu(e) {
    if (!this.enabled) return;
    const point = this.point(e);
    if (this.archiveMode) {
      const card = point ? this.at(point) : null;
      if (card && (this.callbacks.canEdit?.(card.note) ?? false)) {
        e.preventDefault();
        this.restoreArchiveCard(card);
      }
      return;
    }
    if (
      point &&
      !this.at(point) &&
      this.ctx.dice?.containsDocked?.(point) &&
      (this.callbacks.canRoll?.() ?? true)
    ) {
      e.preventDefault();
      this.callbacks.onDiceMenu?.();
    }
  }
  releaseCapture() {
    if (this.canvas.hasPointerCapture(this.pointerId))
      this.canvas.releasePointerCapture(this.pointerId);
  }
  cancel() {
    this.downState?.card?.release();
    this.downState?.card?.place();
    this.downState = null;
    this.setHoveredPin(null);
    this.setLinkStart(null);
    this.ctx.counterObject.well?.highlight(false);
    this.callbacks.onLinkEnd?.(null);
  }
  dispose() {
    this.cancel();
    clearTimeout(this.hoverTimer);
    this.off();
    Object.entries(this.handlers).forEach(([key, handler]) =>
      this.canvas.removeEventListener(key, handler),
    );
    this.cards.forEach((c) => c.dispose());
    this.archiveCards.forEach((c) => c.dispose());
    this.archiveCards.clear();
    this.exitingArchiveCards.forEach((c) => c.dispose());
    this.exitingArchiveCards.clear();
    this.object.removeFromParent();
  }
}
