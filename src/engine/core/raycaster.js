import { Ray } from "../math.js";
export class Raycaster {
  constructor(origin, direction, near = 0, far = Infinity) {
    this.ray = new Ray(origin, direction);
    this.near = near;
    this.far = far;
    this.camera = null;
  }
  setFromCamera(coords, camera) {
    this.camera = camera;
    if (camera.isPerspectiveCamera) {
      this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      this.ray.direction
        .set(coords.x, coords.y, 0.5)
        .unproject(camera)
        .sub(this.ray.origin)
        .normalize();
    } else {
      this.ray.origin.set(coords.x, coords.y, -1).unproject(camera);
      this.ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    }
  }
  intersectObject(object, recursive = true, intersects = []) {
    intersect(object, this, intersects, recursive);
    intersects.sort((a, b) => a.distance - b.distance);
    return intersects;
  }
  intersectObjects(objects, recursive = true, intersects = []) {
    for (const object of objects) {
      intersect(object, this, intersects, recursive);
    }
    intersects.sort((a, b) => a.distance - b.distance);
    return intersects;
  }
}
function intersect(object, raycaster, intersects, recursive) {
  object.raycast(raycaster, intersects);
  if (recursive) {
    for (const child of object.children) {
      intersect(child, raycaster, intersects, true);
    }
  }
}
export { intersect };
