import { Matrix4, Vector3 } from "../../engine/index.js";
export function configurePolaroidWiggle(wiggle, velocity, maxStretch) {
  if (!wiggle) return;
  for (const bone of wiggle.wiggleBones) {
    bone.options.velocity = velocity;
    bone.options.maxStretch = maxStretch;
  }
}
export function createPolaroidWiggleUpdater(wiggle, root) {
  const goal = new Vector3();
  const direction = new Vector3();
  const lag = new Vector3();
  const inverse = new Matrix4();
  return (delta) => {
    const bones = wiggle.wiggleBones;
    if (!bones.length) return false;
    const dt = Math.min(delta, 100);
    if (dt < 0.006 && delta) return false;
    const steps = dt >= 100 ? 25 : dt > 0.01 ? 2 : 1;
    root.updateWorldMatrix(false, true);
    let moved = false;
    for (const bone of bones) {
      const previous = bone.oldBoneWorldPosition;
      const x = previous.x;
      const y = previous.y;
      const z = previous.z;
      const target = bone.target;
      const parentMatrix = target.parent.matrixWorld;
      goal.copy(bone.originPosition).applyMatrix4(parentMatrix);
      bone.targetHelper.position.copy(goal);
      if (bone._isFirstStep) {
        bone._isFirstStep = false;
        previous.copy(goal);
      }
      const response = Math.min(bone.options.velocity * 0.85, 0.99999);
      previous.lerp(goal, 1 - (1 - response) ** steps);
      direction.copy(previous).applyMatrix4(inverse.copy(parentMatrix).invert());
      const reach = bone.options.maxStretch * bone.originPosition.length();
      lag.copy(direction).sub(bone.originPosition);
      if (lag.lengthSq() > reach * reach) {
        direction.copy(bone.originPosition).add(lag.setLength(reach));
        previous.copy(direction).applyMatrix4(parentMatrix);
      }
      direction.normalize();
      target.up.set(0, 1, 0);
      target.quaternion.setFromUnitVectors(target.up, direction);
      target.position.set(0, 0, 0);
      target.updateMatrix();
      bone.currentHelper.position.copy(previous);
      if (
        (previous.x - x) ** 2 +
          (previous.y - y) ** 2 +
          (previous.z - z) ** 2 >
        1e-12
      ) {
        moved = true;
      }
    }
    return moved;
  };
}
