import { BufferGeometry, Float32BufferAttribute } from "../../engine/index.js";
export function createDropRim(zone, cornerSegments = 9) {
  const halfWidth = zone.width * 0.5 + 0.001;
  const halfHeight = zone.height * 0.5 + 0.001;
  const thickness = 0.005;
  const radius = Math.max(thickness, Math.min((zone.radius ?? 0) + 0.001, halfWidth, halfHeight));
  const path = [];
  const corners = [
    [halfWidth - radius, -halfHeight + radius, -Math.PI / 2],
    [halfWidth - radius, halfHeight - radius, 0],
    [-halfWidth + radius, halfHeight - radius, Math.PI / 2],
    [-halfWidth + radius, -halfHeight + radius, Math.PI],
  ];
  for (const [cx, cz, angle] of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const theta = angle + ((i / cornerSegments) * Math.PI) / 2;
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      path.push({
        x: cx + radius * nx,
        z: cz + radius * nz,
        nx,
        nz,
        distance: 0,
      });
    }
  }
  path.push({
    ...path[0],
  });
  for (let i = 1; i < path.length; i++) {
    path[i].distance =
      path[i - 1].distance + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  const length = path.at(-1).distance;
  const positions = [],
    normals = [],
    progress = [],
    indices = [];
  path.forEach((point, i) => {
    for (const side of [1, -1]) {
      positions.push(
        point.x + point.nx * thickness * side,
        0,
        point.z + point.nz * thickness * side,
      );
      normals.push(0, 1, 0);
      progress.push(point.distance / length);
    }
    if (i < path.length - 1) {
      const start = i * 2;
      indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute(`position`, new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(`normal`, new Float32BufferAttribute(normals, 3));
  geometry.setAttribute(`rimPosition`, new Float32BufferAttribute(progress, 1));
  geometry.setIndex(indices);
  return {
    geometry,
    path,
    length,
  };
}
export function nearestRimProgress(rim, point) {
  let closest = Infinity;
  let progress = 0;
  for (let i = 1; i < rim.path.length; i++) {
    const a = rim.path[i - 1];
    const b = rim.path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const squared = dx * dx + dz * dz;
    if (squared < 1e-12) {
      continue;
    }
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / squared));
    const distance = (point.x - a.x - t * dx) ** 2 + (point.z - a.z - t * dz) ** 2;
    if (distance < closest) {
      closest = distance;
      progress = (a.distance + t * Math.sqrt(squared)) / rim.length;
    }
  }
  return progress % 1;
}
