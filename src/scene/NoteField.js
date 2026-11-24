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
    this.canvas = ctx.app.canvas;
    this.handlers = {
      pointerdown: (e) => this.down(e),
      pointermove: (e) => this.move(e),
      pointerup: (e) => this.up(e),
      pointercancel: () => this.cancel(),
      contextmenu: (e) => this.contextMenu(e),
      pointerleave: () => {
        if (!this.downState) this.hover(null);
      },
    };
    Object.entries(this.handlers).forEach(([key, handler]) =>
      this.canvas.addEventListener(key, handler),
    );
    this.off = ctx.counter.subscribe(() => {
      for (const card of this.cards.values())
        card.update(card.note, this.cardWidth());
      if (this.avoidZone) this.applyAvoidance(false);
    });
  }
  cardWidth() {
    const { layout } = this.ctx.counter.get();
    return Math.min(0.94, layout.indentWidth * 0.3, layout.indentHeight * 0.3);
  }
  freePosition(style, preferred = { x: 0, y: 0 }) {
    const { layout, zone } = this.ctx.counter.get(),
      width = this.cardWidth(),
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
        y: -layout.indentHeight / 2 + 0.22,
        width: Math.min(1.7, layout.indentWidth * 0.7),
        height: 0.2,
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
      if (!card) {
        card = new NoteCard(this.ctx, note, this.cardWidth());
        this.cards.set(note.id, card);
        this.object.add(card.object);
        added.push(card);
      } else card.update(note);
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
      cards.forEach((card, i) => {
        card.sweepIn(i * 0.045);
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
    return (
      [...this.cards.values()]
        .sort((a, b) => b.note.layer - a.note.layer)
        .find((c) => {
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
  hover(card, point = null) {
    const hoverTarget = card
      ? null
      : point && this.ctx.counterObject.well?.contains(point)
        ? { kind: "well", point }
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
    const card = this.at(point);
    const canLink = this.callbacks.canLink?.() ?? true;
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
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      offsetX: card ? card.object.position.x - point.x : 0,
      offsetZ: card ? card.object.position.z - point.z : 0,
      linking: e.shiftKey && canLink,
      moved: false,
      wasDocked,
    };
    if (card && e.shiftKey && canLink) {
      this.callbacks.onLinkStart?.(card.note.id);
      this.ctx.rope?.beginPreview(card.note.id);
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.magnet = createDropMagnet(point.x, point.z);
  }
  move(e) {
    if (!this.enabled) return;
    const point = this.point(e);
    if (!point) return;
    const down = this.downState;
    if (!down) {
      this.hover(this.at(point), point);
      return;
    }
    down.moved ||= Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6;
    if (!down.card || !down.moved) return;
    if (down.linking) {
      this.ctx.rope?.movePreview(point);
      return;
    }
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
    this.ctx.counterObject.well?.highlight(false);
    this.ctx.rope?.clearPreview();
    if (card && down.linking && down.moved) {
      const target = this.at(point);
      this.callbacks.onLinkEnd?.(target?.note.id ?? null);
      this.releaseCapture();
      return;
    }
    if (card && down.moved && card.dragging) {
      const { layout, zone } = this.ctx.counter.get();
      if (this.magnet.latched) {
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
      if (card) this.callbacks.onSelect?.(card.note.id);
      else if (point && this.ctx.counterObject.well?.contains(point))
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
    this.ctx.counterObject.well?.highlight(false);
    this.ctx.rope?.clearPreview();
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
    this.object.removeFromParent();
  }
}
