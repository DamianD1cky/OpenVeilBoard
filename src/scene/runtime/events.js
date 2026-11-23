import { Raycaster, Vector2, Vector3 } from "../../engine/index.js";
const DOM_EVENTS = {
  onClick: [`click`, false],
  onContextMenu: [`contextmenu`, false],
  onDoubleClick: [`dblclick`, false],
  onWheel: [`wheel`, true],
  onPointerDown: [`pointerdown`, true],
  onPointerUp: [`pointerup`, true],
  onPointerLeave: [`pointerleave`, true],
  onPointerMove: [`pointermove`, true],
  onPointerCancel: [`pointercancel`, true],
  onLostPointerCapture: [`lostpointercapture`, true],
};
const HANDLER_NAMES = new Set([
  `onClick`,
  `onContextMenu`,
  `onDoubleClick`,
  `onWheel`,
  `onPointerUp`,
  `onPointerDown`,
  `onPointerOver`,
  `onPointerOut`,
  `onPointerEnter`,
  `onPointerLeave`,
  `onPointerMove`,
  `onPointerMissed`,
  `onPointerCancel`,
  `onLostPointerCapture`,
]);
function makeId(event) {
  return `${(event.eventObject || event.object).id}/${event.index}${event.instanceId}`;
}
function releaseInternalPointerCapture(capturedMap, obj, captures, pointerId) {
  const captureData = captures.get(obj);
  if (captureData) {
    captures.delete(obj);
    if (captures.size === 0) {
      capturedMap.delete(pointerId);
      captureData.target.releasePointerCapture?.(pointerId);
    }
  }
}
export class EventManager {
  constructor({ size }) {
    this.size = size;
    this.roots = [];
    this.interaction = [];
    this.hovered = new Map();
    this.capturedMap = new Map();
    this.initialClick = [0, 0];
    this.initialHits = [];
    this.lastEvent = {
      current: null,
    };
    this.filter = null;
    this.onPointerMissed = null;
    this.enabled = true;
    this.pointer = new Vector2();
    this.connected = null;
    this.handlers = Object.fromEntries(
      Object.keys(DOM_EVENTS).map((name) => [name, this.handlePointer(name)]),
    );
  }
  addRoot(root) {
    root.raycaster = new Raycaster();
    root.pointer = new Vector2();
    root.priority ??= 1;
    this.roots.push(root);
    return root;
  }
  rootOf(object) {
    let top = object;
    while (top.parent) {
      top = top.parent;
    }
    return this.roots.find((root) => root.scene === top) ?? null;
  }
  on(object, handlers) {
    const own = {};
    for (const [name, handler] of Object.entries(handlers)) {
      if (HANDLER_NAMES.has(name) && handler) {
        own[name] = handler;
      }
    }
    object.handlers = own;
    object.eventCount = Object.keys(own).length;
    if (!this.interaction.includes(object)) {
      this.interaction.push(object);
    }
    return () => this.off(object);
  }
  off(object) {
    object.handlers = null;
    object.eventCount = 0;
    this.interaction = this.interaction.filter((o) => o !== object);
    this.initialHits = this.initialHits.filter((o) => o !== object);
    for (const [key, value] of this.hovered) {
      if (value.eventObject === object || value.object === object) {
        this.hovered.delete(key);
      }
    }
    for (const [pointerId, captures] of this.capturedMap) {
      releaseInternalPointerCapture(this.capturedMap, object, captures, pointerId);
    }
  }
  connect(target) {
    this.disconnect();
    this.connected = target;
    for (const name of Object.keys(this.handlers)) {
      const [eventName, passive] = DOM_EVENTS[name];
      target.addEventListener(eventName, this.handlers[name], {
        passive,
      });
    }
  }
  disconnect() {
    const target = this.connected;
    if (!target) {
      return;
    }
    for (const name of Object.keys(this.handlers)) {
      const [eventName] = DOM_EVENTS[name];
      target.removeEventListener(eventName, this.handlers[name]);
    }
    this.connected = null;
  }
  compute(event, root) {
    const { width, height } = this.size();
    root.pointer.set((event.offsetX / width) * 2 - 1, -(event.offsetY / height) * 2 + 1);
    this.pointer.copy(root.pointer);
    root.raycaster.setFromCamera(root.pointer, root.camera());
  }
  calculateDistance(event) {
    const dx = event.offsetX - this.initialClick[0];
    const dy = event.offsetY - this.initialClick[1];
    return Math.round(Math.sqrt(dx * dx + dy * dy));
  }
  intersect(event, filterObjects) {
    const duplicates = new Set();
    const intersections = [];
    const eventsObjects = filterObjects ? filterObjects(this.interaction) : this.interaction;
    const computed = new Set();
    const hitsOf = (obj) => {
      const root = this.rootOf(obj);
      if (!root || root.enabled?.() === false) {
        return [];
      }
      if (!computed.has(root)) {
        this.compute(event, root);
        computed.add(root);
      }
      return root.raycaster.intersectObject(obj, true).map((hit) => ({
        ...hit,
        root,
      }));
    };
    let hits = eventsObjects
      .flatMap(hitsOf)
      .sort((a, b) => b.root.priority - a.root.priority || a.distance - b.distance)
      .filter((item) => {
        const id = makeId(item);
        if (duplicates.has(id)) {
          return false;
        }
        duplicates.add(id);
        return true;
      });
    if (this.filter) {
      hits = this.filter(hits);
    }
    for (const hit of hits) {
      let eventObject = hit.object;
      while (eventObject) {
        if (eventObject.eventCount) {
          intersections.push({
            ...hit,
            eventObject,
          });
        }
        eventObject = eventObject.parent;
      }
    }
    if (`pointerId` in event && this.capturedMap.has(event.pointerId)) {
      for (const captureData of this.capturedMap.get(event.pointerId).values()) {
        if (!duplicates.has(makeId(captureData.intersection))) {
          intersections.push(captureData.intersection);
        }
      }
    }
    return intersections;
  }
  handleIntersects(intersections, event, delta, callback) {
    if (!intersections.length) {
      return intersections;
    }
    const localState = {
      stopped: false,
    };
    for (const hit of intersections) {
      const root = hit.root ?? this.rootOf(hit.object) ?? this.roots[0];
      if (!root) {
        continue;
      }
      const camera = root.camera();
      const capturedMap = this.capturedMap;
      const unprojectedPoint = new Vector3(root.pointer.x, root.pointer.y, 0).unproject(camera);
      const hasPointerCapture = (id) => capturedMap.get(id)?.has(hit.eventObject) ?? false;
      const setPointerCapture = (id) => {
        const captureData = {
          intersection: hit,
          target: event.target,
        };
        if (capturedMap.has(id)) {
          capturedMap.get(id).set(hit.eventObject, captureData);
        } else {
          capturedMap.set(id, new Map([[hit.eventObject, captureData]]));
        }
        event.target.setPointerCapture?.(id);
      };
      const releasePointerCapture = (id) => {
        const captures = capturedMap.get(id);
        if (captures) {
          releaseInternalPointerCapture(capturedMap, hit.eventObject, captures, id);
        }
      };
      const extract = {};
      for (const prop in event) {
        const property = event[prop];
        if (typeof property !== `function`) {
          extract[prop] = property;
        }
      }
      const raycastEvent = {
        ...hit,
        ...extract,
        pointer: root.pointer,
        intersections,
        stopped: localState.stopped,
        delta,
        unprojectedPoint,
        ray: root.raycaster.ray,
        camera,
        stopPropagation: () => {
          const capturesForPointer = `pointerId` in event && capturedMap.get(event.pointerId);
          if (!capturesForPointer || capturesForPointer.has(hit.eventObject)) {
            raycastEvent.stopped = localState.stopped = true;
            if (
              this.hovered.size &&
              [...this.hovered.values()].find((i) => i.eventObject === hit.eventObject)
            ) {
              const higher = intersections.slice(0, intersections.indexOf(hit));
              this.cancelPointer([...higher, hit]);
            }
          }
        },
        target: {
          hasPointerCapture,
          setPointerCapture,
          releasePointerCapture,
        },
        currentTarget: {
          hasPointerCapture,
          setPointerCapture,
          releasePointerCapture,
        },
        nativeEvent: event,
      };
      callback(raycastEvent);
      if (localState.stopped === true) {
        break;
      }
    }
    return intersections;
  }
  cancelPointer(intersections) {
    for (const hoveredObj of [...this.hovered.values()]) {
      if (
        !intersections.length ||
        !intersections.find(
          (hit) =>
            hit.object === hoveredObj.object &&
            hit.index === hoveredObj.index &&
            hit.instanceId === hoveredObj.instanceId,
        )
      ) {
        const eventObject = hoveredObj.eventObject;
        this.hovered.delete(makeId(hoveredObj));
        if (eventObject.eventCount) {
          const data = {
            ...hoveredObj,
            intersections,
          };
          eventObject.handlers.onPointerOut?.(data);
          eventObject.handlers.onPointerLeave?.(data);
        }
      }
    }
  }
  pointerMissed(event, objects) {
    for (const object of objects) {
      object.handlers?.onPointerMissed?.(event);
    }
  }
  handlePointer(name) {
    switch (name) {
      case `onPointerLeave`:
      case `onPointerCancel`:
        return () => this.cancelPointer([]);
      case `onLostPointerCapture`:
        return (event) => {
          if (`pointerId` in event && this.capturedMap.has(event.pointerId)) {
            requestAnimationFrame(() => {
              if (this.capturedMap.has(event.pointerId)) {
                this.capturedMap.delete(event.pointerId);
                this.cancelPointer([]);
              }
            });
          }
        };
      default:
        break;
    }
    return (event) => {
      if (!this.enabled) {
        return;
      }
      this.lastEvent.current = event;
      const isPointerMove = name === `onPointerMove`;
      const isClickEvent =
        name === `onClick` || name === `onContextMenu` || name === `onDoubleClick`;
      const filterObjects = isPointerMove
        ? (objects) =>
            objects.filter((obj) =>
              [`Move`, `Over`, `Enter`, `Out`, `Leave`].some(
                (n) => obj.handlers?.[`onPointer${n}`],
              ),
            )
        : undefined;
      const hits = this.intersect(event, filterObjects);
      const delta = isClickEvent ? this.calculateDistance(event) : 0;
      if (name === `onPointerDown`) {
        this.initialClick = [event.offsetX, event.offsetY];
        this.initialHits = hits.map((hit) => hit.eventObject);
      }
      if (isClickEvent && !hits.length && delta <= 2) {
        this.pointerMissed(event, this.interaction);
        this.onPointerMissed?.(event);
      }
      if (isPointerMove) {
        this.cancelPointer(hits);
      }
      const onIntersect = (data) => {
        const eventObject = data.eventObject;
        if (!eventObject.eventCount) {
          return;
        }
        const handlers = eventObject.handlers;
        if (isPointerMove) {
          if (
            handlers.onPointerOver ||
            handlers.onPointerEnter ||
            handlers.onPointerOut ||
            handlers.onPointerLeave
          ) {
            const id = makeId(data);
            const hoveredItem = this.hovered.get(id);
            if (!hoveredItem) {
              this.hovered.set(id, data);
              handlers.onPointerOver?.(data);
              handlers.onPointerEnter?.(data);
            } else if (hoveredItem.stopped) {
              data.stopPropagation();
            }
          }
          handlers.onPointerMove?.(data);
        } else {
          const handler = handlers[name];
          if (handler) {
            if (!isClickEvent || this.initialHits.includes(eventObject)) {
              this.pointerMissed(
                event,
                this.interaction.filter((object) => !this.initialHits.includes(object)),
              );
              handler(data);
            }
          } else if (isClickEvent && this.initialHits.includes(eventObject)) {
            this.pointerMissed(
              event,
              this.interaction.filter((object) => !this.initialHits.includes(object)),
            );
          }
        }
      };
      this.handleIntersects(hits, event, delta, onIntersect);
    };
  }
  update() {
    if (this.lastEvent.current) {
      this.handlers.onPointerMove(this.lastEvent.current);
    }
  }
}
export function noRaycast() {}
