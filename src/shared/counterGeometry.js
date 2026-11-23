import { BufferAttribute, ExtrudeGeometry, Path, Shape, ShapeGeometry } from "../engine/index.js";
export const CAMERA_HEIGHT = 6.4;
export const CAMERA_FOV = 32;
export function getViewportWorldSize(
  pixelWidth,
  pixelHeight,
  distance = CAMERA_HEIGHT,
  fov = CAMERA_FOV,
) {
  const height = 2 * Math.tan((fov * Math.PI) / 180 / 2) * distance;
  const width = height * (pixelWidth / pixelHeight);
  return {
    width,
    height,
  };
}
function roundedRect(path, width, height, radius, cx = 0, cy = 0, clockwise = false) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  if (clockwise) {
    path.moveTo(cx - w + r, cy - h);
    path.absarc(cx - w + r, cy - h + r, r, -Math.PI / 2, Math.PI, true);
    path.lineTo(cx - w, cy + h - r);
    path.absarc(cx - w + r, cy + h - r, r, Math.PI, Math.PI / 2, true);
    path.lineTo(cx + w - r, cy + h);
    path.absarc(cx + w - r, cy + h - r, r, Math.PI / 2, 0, true);
    path.lineTo(cx + w, cy - h + r);
    path.absarc(cx + w - r, cy - h + r, r, 0, -Math.PI / 2, true);
  } else {
    path.moveTo(cx - w + r, cy - h);
    path.lineTo(cx + w - r, cy - h);
    path.absarc(cx + w - r, cy - h + r, r, -Math.PI / 2, 0, false);
    path.lineTo(cx + w, cy + h - r);
    path.absarc(cx + w - r, cy + h - r, r, 0, Math.PI / 2, false);
    path.lineTo(cx - w + r, cy + h);
    path.absarc(cx - w + r, cy + h - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(cx - w, cy - h + r);
    path.absarc(cx - w + r, cy - h + r, r, Math.PI, Math.PI * 1.5, false);
  }
  path.closePath();
}
export function createCounterShape({
  counterWidth,
  counterHeight,
  indentWidth,
  indentHeight,
  indentRadius,
  bottomExtend = 0,
}) {
  const shape = new Shape();
  const extend = Math.max(0, bottomExtend);
  roundedRect(shape, counterWidth, counterHeight + extend, indentRadius * 1.5, 0, -extend / 2);
  const hole = new Path();
  roundedRect(hole, indentWidth, indentHeight, indentRadius, 0, 0, true);
  shape.holes.push(hole);
  return shape;
}
function ensurePlasterAttributes(geometry) {
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  if (geometry.index) {
    try {
      geometry.computeTangents();
    } catch {}
  }
  if (!geometry.attributes.tangent) {
    const count = geometry.attributes.position.count;
    const tangents = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      tangents[i * 4] = 1;
      tangents[i * 4 + 3] = 1;
    }
    geometry.setAttribute(`tangent`, new BufferAttribute(tangents, 4));
  }
  return geometry;
}
function setTangentUVs(geometry, uvs) {
  geometry.setAttribute(`uv`, new BufferAttribute(uvs, 2));
  return ensurePlasterAttributes(geometry);
}
export function applyPlanarUVs(geometry) {
  const position = geometry.attributes.position;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uvs[i * 2] = position.getX(i);
    uvs[i * 2 + 1] = position.getZ(i);
  }
  return setTangentUVs(geometry, uvs);
}
export function applyBoxUVs(geometry) {
  geometry.computeVertexNormals();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (ny >= 0.4) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else if (nx >= nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }
  return setTangentUVs(geometry, uvs);
}
function indentFloorPad(layout) {
  return (layout.bevelSize ?? 0) * 2.2 + 0.04;
}
export function getCounterLayout(pixelWidth, pixelHeight, camera, counter) {
  const view = getViewportWorldSize(pixelWidth, pixelHeight, camera.height, camera.fov);
  const shortest = Math.min(view.width, view.height);
  const compact = view.width / view.height < 0.88 || view.width < 2.2;
  const frameX = compact ? shortest * 0.04 : view.width * counter.frame;
  const frameY = compact ? shortest * 0.04 : view.height * counter.frame;
  const indentWidth = Math.max(view.width - frameX * 2, shortest * counter.minIndent);
  const indentHeight = Math.max(view.height - frameY * 2, shortest * counter.minIndent);
  return {
    view,
    pixelWidth,
    pixelHeight,
    worldPerPixel: view.height / Math.max(pixelHeight, 1),
    counterWidth: view.width * counter.overscan,
    counterHeight: view.height * counter.overscan,
    indentWidth,
    indentHeight,
    indentRadius: shortest * counter.indentRadius,
    thickness: shortest * counter.thickness,
    indentDepth: shortest * counter.indentDepth,
    bevelSize: shortest * counter.bevelSize,
    bevelThickness: shortest * counter.bevelThickness,
    curveSegments: Math.max(4, Math.round(counter.curveSegments ?? 9)),
  };
}
export function createIndentFloorShape(layout, zone, slot) {
  const pad = indentFloorPad(layout);
  const shape = new Shape();
  roundedRect(
    shape,
    layout.indentWidth + pad * 2,
    layout.indentHeight + pad * 2,
    layout.indentRadius + pad,
  );
  if (zone) {
    const hole = new Path();
    roundedRect(hole, zone.width, zone.height, zone.radius, zone.x, -zone.z, true);
    shape.holes.push(hole);
  }
  if (slot) {
    const hole = new Path();
    roundedRect(hole, slot.width, slot.height, slot.radius, slot.x, -slot.z, true);
    shape.holes.push(hole);
  }
  return shape;
}
export function createIndentFloorGeometry(layout, zone, slot) {
  const geometry = new ShapeGeometry(
    createIndentFloorShape(layout, zone, slot),
    Math.max(4, Math.round(layout.curveSegments ?? 9)),
  );
  geometry.rotateX(-Math.PI / 2);
  applyPlanarUVs(geometry);
  return geometry;
}
export function createWellWallShape(zone, { wall = 0.008, overlap = 0.012 } = {}) {
  const shape = new Shape();
  roundedRect(shape, zone.width + overlap * 2, zone.height + overlap * 2, zone.radius + overlap);
  const hole = new Path();
  roundedRect(
    hole,
    Math.max(Math.min(0.04, zone.width * 0.5), zone.width - wall * 2),
    Math.max(Math.min(0.04, zone.height * 0.5), zone.height - wall * 2),
    Math.max(0, zone.radius - wall),
    0,
    0,
    true,
  );
  shape.holes.push(hole);
  return shape;
}
export function createWellPlugShape(zone, inset = 0.012) {
  const shape = new Shape();
  roundedRect(
    shape,
    Math.max(0.05, zone.width - inset * 2),
    Math.max(0.05, zone.height - inset * 2),
    Math.max(0, zone.radius - inset),
  );
  return shape;
}
export function extrudeDown(shape, depth, bevel = {}) {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: Boolean(bevel.enabled && depth > 0.002),
    bevelThickness: Math.min(bevel.thickness ?? 0, depth * 0.35),
    bevelSize: bevel.size ?? 0,
    bevelOffset: bevel.offset ?? 0,
    bevelSegments: bevel.segments ?? 2,
    curveSegments: bevel.curveSegments ?? 9,
  });
  geometry.rotateX(Math.PI / 2);
  applyBoxUVs(geometry);
  return geometry;
}
export function createRoundedRectShape(width, height, radius, cx = 0, cy = 0) {
  const shape = new Shape();
  roundedRect(shape, width, height, radius, cx, cy);
  return shape;
}
export function createRoundedFilmGeometry(width, height, radius, curveSegments = 24) {
  const w = Math.max(0.02, width);
  const h = Math.max(0.02, height);
  const geometry = new ShapeGeometry(
    createRoundedRectShape(w, h, radius),
    Math.max(8, curveSegments),
  );
  const position = geometry.attributes.position;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uvs[i * 2] = position.getX(i) / w + 0.5;
    uvs[i * 2 + 1] = position.getY(i) / h + 0.5;
  }
  const uvAttr = new BufferAttribute(uvs, 2);
  uvAttr.needsUpdate = true;
  geometry.setAttribute(`uv`, uvAttr);
  geometry.computeVertexNormals();
  return geometry;
}
export function extrudeUp(shape, depth, bevel = {}) {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: Boolean(bevel.enabled && depth > 0.002),
    bevelThickness: Math.min(bevel.thickness ?? 0, depth * 0.48),
    bevelSize: bevel.size ?? 0,
    bevelOffset: bevel.offset ?? 0,
    bevelSegments: bevel.segments ?? 2,
    curveSegments: bevel.curveSegments ?? 16,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? 0;
  if (minY !== 0) {
    geometry.translate(0, -minY, 0);
  }
  geometry.computeBoundingBox();
  applyBoxUVs(geometry);
  return geometry;
}
